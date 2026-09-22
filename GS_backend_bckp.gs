function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = JSON.parse(e.postData.contents);

// 1. Handle User Login / Registration in 'Users' tab
  if (data.action === "createUser" || data.action === "loginUser") {
    var userSheet = ss.getSheetByName("Users");
    var usersData = userSheet.getDataRange().getValues();
    var inputUsername = String(data.username || "").trim();
    var cleanUsername = inputUsername.toLowerCase();

    if (!inputUsername) {
      return ContentService.createTextOutput(JSON.stringify({ error: "invalid_username" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Check if user already exists (case-insensitive)
    for (var i = 1; i < usersData.length; i++) {
      var existingUser = String(usersData[i][0] || "").trim().toLowerCase();
      if (existingUser === cleanUsername) {
        var rawSeen = usersData[i][2]; // Column C
        var existingSeen = rawSeen ? JSON.parse(rawSeen) : [];
        
        return ContentService.createTextOutput(JSON.stringify({ 
          status: "user_exists", 
          username: usersData[i][0], 
          seen_ids: existingSeen,
          isNew: false 
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // If user does not exist, create new row
    userSheet.appendRow([
      inputUsername,
      new Date().toISOString(),
      "[]" // Column C: Initial empty JSON array for seen_ids
    ]);

    return ContentService.createTextOutput(JSON.stringify({ 
      status: "user_created", 
      username: inputUsername, 
      seen_ids: [],
      isNew: true 
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // 2. Write test attempt to 'TestResults' tab & update seen question IDs in 'Users' tab (Column C)
  if (data.action === "saveResult") {
    var logSheet = ss.getSheetByName("TestResults");
    
    // Append full attempt payload including Column G (TestDetailsJSON)
    logSheet.appendRow([
      new Date().toISOString(),
      data.username,
      data.category,
      data.score,
      data.total,
      data.timeSpentSec,
      JSON.stringify(data.details || []) // Column G: Full question session array
    ]);

    // Update seen question IDs in Users sheet (Column C)
    var answeredIds = data.answeredIds || data.answered_ids || [];
    if (answeredIds.length > 0) {
      var userSheet = ss.getSheetByName("Users");
      var usersData = userSheet.getDataRange().getValues();
      for (var i = 0; i < usersData.length; i++) {
        if (usersData[i][0] === data.username) {
          var rawSeen = usersData[i][2]; // Column C (0-indexed position 2)
          var existingSeen = rawSeen ? JSON.parse(rawSeen) : [];
          var updatedSeen = Array.from(new Set(existingSeen.concat(answeredIds)));
          userSheet.getRange(i + 1, 3).setValue(JSON.stringify(updatedSeen));
          break;
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "result_saved" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var action = e.parameter ? e.parameter.action : null;

  // 1. Fetch single user profile with seen_ids
  if (action === "getUser") {
    var username = e.parameter.username;
    var userSheet = ss.getSheetByName("Users");
    var usersData = userSheet.getDataRange().getValues();
    usersData.shift(); // Remove header row
    for (var i = 0; i < usersData.length; i++) {
      if (usersData[i][0] === username) {
        var rawSeen = usersData[i][2];
        return ContentService.createTextOutput(JSON.stringify({
          username: usersData[i][0],
          seen_ids: rawSeen ? JSON.parse(rawSeen) : []
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ error: "not_found" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 2. Read user list with seen_ids attached
  if (action === "getUsers") {
    var userSheet = ss.getSheetByName("Users");
    var data = userSheet.getDataRange().getValues();
    data.shift(); // Remove header row
    
    var users = data.map(function(row) {
      return {
        username: row[0],
        seen_ids: row[2] ? JSON.parse(row[2]) : []
      };
    });
    return ContentService.createTextOutput(JSON.stringify(users))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 3. Read past attempts from 'TestResults' tab
  var logSheet = ss.getSheetByName("TestResults");
  var rows = logSheet.getDataRange().getValues();
  rows.shift(); // Remove header row

  return ContentService.createTextOutput(JSON.stringify(rows))
    .setMimeType(ContentService.MimeType.JSON);
}