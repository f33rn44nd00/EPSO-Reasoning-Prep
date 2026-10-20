/**
 * EPSO Reasoning Prep - Apps Script backend
 *
 * Sheets expected:
 *   Users        : A username | B created | C seen_ids (JSON array)
 *   TestResults  : A timestamp | B username | C category | D details (JSON) | E attempt_id
 *                  (no stored score/total/time: they are recomputed from details)
 *
 * Every response is JSON:
 *   success -> { ok: true, ...fields }
 *   failure -> { ok: false, error: "<code>", message: "<human readable>" }
 *
 * Error codes: bad_json, empty_body, unknown_action, invalid_username,
 *   invalid_category, invalid_details, invalid_attempt_id,
 *   invalid_answered_ids, user_not_found, missing_sheet, busy, server_error
 */

var VALID_CATEGORIES = ["verbal", "numerical", "abstract"];
var LOCK_WAIT_MS = 10000;

// ---------------------------------------------------------------- responses

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function fail_(code, message) {
  return jsonResponse_({ ok: false, error: code, message: message || "" });
}

// ---------------------------------------------------------------- entry points

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return fail_("empty_body", "Request had no body");
    }

    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return fail_("bad_json", "Request body is not valid JSON");
    }

    // One writer at a time: avoids duplicate users and seen_ids overwrites
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(LOCK_WAIT_MS)) {
      return fail_("busy", "Server busy, try again");
    }

    try {
      switch (data.action) {
        case "createUser":
        case "loginUser":
          return handleLogin_(data);
        case "saveResult":
          return handleSaveResult_(data);
        default:
          return fail_("unknown_action", "Unknown action: " + data.action);
      }
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return fail_("server_error", String(err && err.message ? err.message : err));
  }
}

function doGet(e) {
  try {
    var action = e && e.parameter ? e.parameter.action : null;

    if (action === "getUser") {
      var v = validateUsername_(e.parameter.username);
      if (!v.ok) return fail_("invalid_username", v.message);

      var userSheet = getSheet_("Users");
      var row = findUserRow_(userSheet, v.name);
      if (!row) return fail_("user_not_found", "No such user");

      return jsonResponse_({
        ok: true,
        username: userSheet.getRange(row, 1).getValue(),
        seen_ids: readSeenIds_(userSheet, row)
      });
    }

    if (action === "getResults") {
      var rv = validateUsername_(e.parameter.username);
      if (!rv.ok) return fail_("invalid_username", rv.message);

      var usersSheet = getSheet_("Users");
      var userRow = findUserRow_(usersSheet, rv.name);
      if (!userRow) return fail_("user_not_found", "No such user");

      var storedName = usersSheet.getRange(userRow, 1).getValue();
      return jsonResponse_({
        ok: true,
        username: storedName,
        results: readUserResults_(storedName)
      });
    }    

    return fail_("unknown_action", "Unknown action: " + action);
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return fail_("server_error", String(err && err.message ? err.message : err));
  }
}

// ---------------------------------------------------------------- handlers

function handleLogin_(data) {
  var v = validateUsername_(data.username);
  if (!v.ok) return fail_("invalid_username", v.message);

  var userSheet = getSheet_("Users");
  var row = findUserRow_(userSheet, v.name);

  if (row) {
    return jsonResponse_({
      ok: true,
      status: "user_exists",
      username: userSheet.getRange(row, 1).getValue(),
      seen_ids: readSeenIds_(userSheet, row),
      isNew: false
    });
  }

  userSheet.appendRow([v.name, new Date().toISOString(), "[]"]);

  return jsonResponse_({
    ok: true,
    status: "user_created",
    username: v.name,
    seen_ids: [],
    isNew: true
  });
}

function handleSaveResult_(data) {
  // ---- 1. Validate everything before writing anything
  var v = validateUsername_(data.username);
  if (!v.ok) return fail_("invalid_username", v.message);

  if (VALID_CATEGORIES.indexOf(data.category) === -1) {
    return fail_("invalid_category", "Category must be verbal, numerical or abstract");
  }

  if (!Array.isArray(data.details)) {
    return fail_("invalid_details", "details must be an array");
  }

  var attemptId = String(data.attemptId || "");
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(attemptId)) {
    return fail_("invalid_attempt_id", "attemptId missing or malformed");
  }

  var answeredIds = data.answeredIds || [];
  if (!Array.isArray(answeredIds) || !answeredIds.every(function (id) { return typeof id === "string"; })) {
    return fail_("invalid_answered_ids", "answeredIds must be an array of strings");
  }

  var userSheet = getSheet_("Users");
  var userRow = findUserRow_(userSheet, v.name);
  if (!userRow) return fail_("user_not_found", "Unknown user: " + v.name);

  var storedUsername = userSheet.getRange(userRow, 1).getValue();
  var logSheet = getSheet_("TestResults");

  // ---- 2. Append the result (skipped if this attempt was already saved,
  //         which makes client retries safe)
  var alreadySaved = attemptExists_(logSheet, attemptId);
  if (!alreadySaved) {
    logSheet.appendRow([
      new Date().toISOString(),
      storedUsername,
      data.category,
      JSON.stringify(data.details),
      attemptId
    ]);
  }

  // ---- 3. Merge seen IDs. Always runs, even for a duplicate attempt, so a
  //         retry can complete a previous call that saved the row but failed here.
  if (answeredIds.length > 0) {
    var existingSeen = readSeenIds_(userSheet, userRow);
    var merged = Array.from(new Set(existingSeen.concat(answeredIds)));
    userSheet.getRange(userRow, 3).setValue(JSON.stringify(merged));
  }

  return jsonResponse_({
    ok: true,
    status: alreadySaved ? "already_saved" : "result_saved",
    attemptId: attemptId
  });
}

// ---------------------------------------------------------------- helpers

function getSheet_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error("Missing sheet tab: " + name);
  return sheet;
}

/**
 * 1-30 chars, must start with a letter or digit (blocks leading = + - @ which
 * Sheets would treat as a formula), then letters, digits, space, _ . -
 */
function validateUsername_(raw) {
  var name = String(raw == null ? "" : raw).trim();
  if (!name) return { ok: false, message: "Username is empty" };
  if (name.length > 30) return { ok: false, message: "Username is longer than 30 characters" };
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _.\-]*$/u.test(name)) {
    return { ok: false, message: "Username contains invalid characters" };
  }
  return { ok: true, name: name };
}

/** Returns the sheet row number of the user, or 0 if not found. Skips the header row. */
function findUserRow_(userSheet, username) {
  var lastRow = userSheet.getLastRow();
  if (lastRow < 2) return 0;

  var cell = userSheet.getRange(2, 1, lastRow - 1, 1)
    .createTextFinder(username)
    .matchEntireCell(true)
    .matchCase(false)
    .findNext();

  return cell ? cell.getRow() : 0;
}

function readSeenIds_(userSheet, row) {
  var raw = userSheet.getRange(row, 3).getValue();
  if (!raw) return [];
  try {
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("not an array");
    return parsed;
  } catch (err) {
    // Fail loudly instead of returning [] and later overwriting real data
    throw new Error("Corrupt seen_ids in Users row " + row);
  }
}

function attemptExists_(logSheet, attemptId) {
  var lastRow = logSheet.getLastRow();
  if (lastRow < 2) return false;

  var cell = logSheet.getRange(2, 5, lastRow - 1, 1) // column E (attempt_id), skipping header
    .createTextFinder(attemptId)
    .matchEntireCell(true)
    .matchCase(true)
    .findNext();

  return cell !== null;
}


  /**
   * All attempts of one user, newest first.
   * Each entry: { attemptId, timestamp (ISO), category, details }.
   * A row whose details cell cannot be parsed is returned with details: null
   * so one bad row never hides the rest of the list.
   */
  function readUserResults_(username) {
    var logSheet = getSheet_("TestResults");
    var lastRow = logSheet.getLastRow();
    if (lastRow < 2) return [];

    var matches = logSheet.getRange(2, 2, lastRow - 1, 1) // column B (username), skipping header
      .createTextFinder(username)
      .matchEntireCell(true)
      .matchCase(false)
      .findAll();

    var results = matches.map(function (cell) {
      var values = logSheet.getRange(cell.getRow(), 1, 1, 5).getValues()[0];
      var timestamp = values[0] instanceof Date ? values[0].toISOString() : String(values[0]);

      var details = null;
      try {
        var parsed = JSON.parse(values[3]);
        if (Array.isArray(parsed)) details = parsed;
      } catch (err) {
        details = null;
      }

      return {
        attemptId: String(values[4]),
        timestamp: timestamp,
        category: String(values[2]),
        details: details
      };
    });

    results.sort(function (a, b) {
      return a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0;
    });
    return results;
  }