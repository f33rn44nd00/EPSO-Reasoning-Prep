function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = JSON.parse(e.postData.contents);

  // 1. Write new user to 'Users' tab
  if (data.action === "createUser") {
    var userSheet = ss.getSheetByName("Users");
    userSheet.appendRow([
      data.username,
      new Date().toISOString()
    ]);
    return ContentService.createTextOutput(JSON.stringify({ status: "user_created" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 2. Write test attempt to 'TestResults' tab & update seen question IDs in 'Users' tab (Column C)
  if (data.action === "saveResult") {
    var logSheet = ss.getSheetByName("TestResults");
    logSheet.appendRow([
      new Date().toISOString(),
      data.username,
      data.category,
      data.score,
      data.total,
      data.timeSpentSec,
      data.missedTags ? data.missedTags.join(", ") : ""
    ]);

    // Update seen question IDs in Users sheet
    var answeredIds = data.answeredIds || data.answered_ids;
    if (answeredIds && answeredIds.length > 0) {
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

  // 1. Read flat array of usernames from 'Users' tab
  if (action === "getUsers") {
    var userSheet = ss.getSheetByName("Users");
    var data = userSheet.getDataRange().getValues();
    data.shift(); // Remove header row
    
    var usernames = data.map(function(row) { return row[0]; });
    return ContentService.createTextOutput(JSON.stringify(usernames))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 2. Read past attempts from 'TestResults' tab
  var logSheet = ss.getSheetByName("TestResults");
  var rows = logSheet.getDataRange().getValues();
  rows.shift(); // Remove header row

  return ContentService.createTextOutput(JSON.stringify(rows))
    .setMimeType(ContentService.MimeType.JSON);
}