/**
 * Creates a custom menu in Google Sheets when it opens.
 */
function onOpen() {
  console.log("hello");
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("🚀 Deployment").addItem("Re-deploy Website", "triggerGitHubWorkflow").addToUi();
}

/**
 * Triggers the GitHub Actions workflow.
 */
function triggerGitHubWorkflow() {
  var ui = SpreadsheetApp.getUi();

  const allSecrets = PropertiesService.getScriptProperties().getProperties();

  const githubToken = allSecrets["GITHUB_TOKEN"];
  const repoOwner = allSecrets["REPO_OWNER"];
  var repoName = "p_test";
  var workflowId = "deploy.yml";
  var branch = "main";

  var url = "https://api.github.com/repos/" + repoOwner + "/" + repoName + "/actions/workflows/" + workflowId + "/dispatches";

  var payload = {
    ref: branch,
  };

  var options = {
    method: "post",
    headers: {
      Authorization: "Bearer " + githubToken,
      Accept: "application/vnd.github.v3+json",
    },
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  try {
    var response = ui.alert("Confirm Deployment", "Are you sure you want to trigger a re-deploy on GitHub?", ui.ButtonSet.YES_NO);

    if (response == ui.Button.YES) {
      var fetchResponse = UrlFetchApp.fetch(url, options);
      var responseCode = fetchResponse.getResponseCode();

      if (responseCode >= 200 && responseCode < 300) {
        ui.alert("Success", "Deployment triggered successfully! Check your GitHub Actions tab.", ui.ButtonSet.OK);
      } else {
        ui.alert("Error", "Failed to trigger deployment. GitHub responded with code: " + responseCode + "\n\n" + fetchResponse.getContentText(), ui.ButtonSet.OK);
      }
    }
  } catch (e) {
    ui.alert("Error", "An Apps Script error occurred: " + e.toString(), ui.ButtonSet.OK);
  }
}

function setupStatusColumn(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  let statusCol = headers.indexOf("Status") + 1;
  if (statusCol === 0) {
    statusCol = lastCol + 1;
    sheet.getRange(1, statusCol).setValue("Status");
  }

  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(["Pending", "Approve", "Reject"], true).setAllowInvalid(false).build();
    sheet.getRange(2, statusCol, lastRow - 1, 1).setDataValidation(rule);
    for (let r = 2; r <= lastRow; r++) {
      const cell = sheet.getRange(r, statusCol);
      if (!cell.getValue()) cell.setValue("Pending");
    }
  }
}

function onFormSubmit(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = e.range.getSheet().getName();
  const sheet = ss.getSheetByName(sheetName);

  // Get the exact row that was just added
  const row = e.range.getRow();

  // ---- 1. SEND BEAUTIFIED EMAIL FIRST ----
  const responses = e.namedValues;
  const recipient = "amrutesharun0599@gmail.com";
  const isOffboarding = sheetName === "BDC Offboarding Form";

  // Extract names for a better subject line (defaults to "Member" if not found)
  const firstName = responses["First Name"] ? responses["First Name"][0] : "";
  const lastName = responses["Last Name"] ? responses["Last Name"][0] : "";
  const fullName = (firstName + " " + lastName).trim() || "Member";

  const subject = isOffboarding ? `🔴 Offboarding Request: ${fullName}` : `🟢 New Onboarding Request: ${fullName}`;

  // Build the deep link to the specific sheet and row
  const baseUrl = "https://docs.google.com/spreadsheets/d/1KyhYG8deCZp1dYjYkkQCV96I6wt5xjpMGLW6dKSsmKc/edit";
  const gid = isOffboarding ? "630776004" : "151504736";
  const rowLink = `${baseUrl}#gid=${gid}&range=A${row}`;

  // Build the HTML Body
  const headerColor = isOffboarding ? "#e06666" : "#6aa84f"; // Red for off, Green for on
  const headerText = isOffboarding ? "Offboarding Request" : "New Member Onboarding";

  let htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      <div style="background-color: ${headerColor}; color: white; padding: 15px 20px;">
        <h2 style="margin: 0; font-size: 20px;">${headerText}</h2>
      </div>
      <div style="padding: 20px; background-color: #ffffff;">
        <p style="color: #555; font-size: 14px;">A new form response has been submitted. Here are the details:</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
  `;

  // Add all questions and answers into a clean table
  for (let question in responses) {
    let answer = responses[question][0] || "<i>No answer provided</i>";
    htmlBody += `
          <tr>
            <td style="padding: 12px 10px; border-bottom: 1px solid #eeeeee; font-weight: bold; color: #333; width: 40%; vertical-align: top; font-size: 13px;">${question}</td>
            <td style="padding: 12px 10px; border-bottom: 1px solid #eeeeee; color: #444; vertical-align: top; font-size: 13px;">${answer}</td>
          </tr>
    `;
  }

  // Close the table and add the button
  htmlBody += `
        </table>
        <div style="text-align: center; margin-top: 30px; margin-bottom: 10px;">
          <a href="${rowLink}" style="background-color: #4a86e8; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; font-size: 14px;">Review Row ${row} in Sheets</a>
        </div>
      </div>
    </div>
  `;

  // Create a plain text fallback just in case the email client blocks HTML
  let plainBody = `A new ${isOffboarding ? "offboarding" : "onboarding"} response has been submitted:\n\n`;
  for (let question in responses) {
    plainBody += `${question}: ${responses[question][0]}\n`;
  }
  plainBody += `\nReview in Sheets (Row ${row}): ${rowLink}`;

  // Send the email
  MailApp.sendEmail({
    to: recipient,
    subject: subject,
    body: plainBody,
    htmlBody: htmlBody,
  });

  // ---- 2. HANDLE THE STATUS COLUMN ----
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  let statusCol = headers.indexOf("Status") + 1;
  if (statusCol === 0) return;

  const rule = SpreadsheetApp.newDataValidation().requireValueInList(["Pending", "Approve", "Reject"], true).setAllowInvalid(false).build();

  // Use 'row' instead of 'getLastRow()' to ensure accuracy if multiple submit at once
  sheet.getRange(row, statusCol).setDataValidation(rule).setValue("Pending");
}

function onEditTrigger(e) {
  const sheet = e.source.getActiveSheet();
  const range = e.range;
  const sheetName = sheet.getName();

  if (sheetName !== "New Member Form" && sheetName !== "BDC Offboarding Form") return;

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  let statusCol = -1;
  for (let i = headers.length - 1; i >= 0; i--) {
    if (headers[i] === "Status") {
      statusCol = i + 1;
      break;
    }
  }
  if (range.getColumn() !== statusCol) return;

  const ss = e.source;
  const membersSheet = ss.getSheetByName("Members");
  const row = range.getRow();
  const newValue = range.getValue();
  const dataColCount = statusCol - 1;
  const rowData = sheet.getRange(row, 1, 1, dataColCount).getValues()[0];
  const timestampToCheck = rowData[0]?.toString();

  // ---- OFFBOARDING SHEET ----
  if (sheetName === "BDC Offboarding Form") {
    if (newValue === "Approve") {
      const emailToRemove = rowData[1]?.toString().trim().toLowerCase();

      if (membersSheet) {
        const membersData = membersSheet.getDataRange().getValues();
        const memberHeaders = membersData[0];
        let emailCol = -1;
        for (let i = 0; i < memberHeaders.length; i++) {
          if (memberHeaders[i].toString().toLowerCase().includes("email")) {
            emailCol = i;
            break;
          }
        }

        if (emailCol !== -1) {
          for (let i = membersData.length - 1; i >= 1; i--) {
            if (membersData[i][emailCol]?.toString().trim().toLowerCase() === emailToRemove) {
              membersSheet.deleteRow(i + 1);
              break;
            }
          }
        }
      }

      sheet.getRange(row, 1, 1, lastCol).setBackground("#f4cccc"); // red = offboarded
    } else if (newValue === "Reject" || newValue === "Pending") {
      sheet.getRange(row, 1, 1, lastCol).setBackground(newValue === "Reject" ? "#ffe599" : null);
    }

    // ---- ONBOARDING SHEET ----
  } else if (sheetName === "New Member Form") {
    if (newValue === "Approve") {
      if (!membersSheet) ss.insertSheet("Members");

      const membersData = membersSheet.getDataRange().getValues();
      for (let i = 1; i < membersData.length; i++) {
        if (membersData[i][0]?.toString() === timestampToCheck) return;
      }

      // 1. Append the base row data first
      membersSheet.appendRow(rowData);
      const newlyAddedRowIndex = membersSheet.getLastRow();

      // Get headers to find column positions
      let lastMemCol = membersSheet.getLastColumn();
      let memHeaders = lastMemCol > 0 ? membersSheet.getRange(1, 1, 1, lastMemCol).getValues()[0] : [];

      // 2. Handle "Show in consortium directory"
      let dirColIndex = memHeaders.indexOf("Show in consortium directory") + 1;
      if (dirColIndex === 0) {
        dirColIndex = lastMemCol + 1;
        membersSheet.getRange(1, dirColIndex).setValue("Show in consortium directory");
        lastMemCol++; // Update column count
      }

      const dirTargetCell = membersSheet.getRange(newlyAddedRowIndex, dirColIndex);
      dirTargetCell.setValue("Yes");

      const yesNoRule = SpreadsheetApp.newDataValidation().requireValueInList(["Yes", "No"], true).setAllowInvalid(false).build();

      dirTargetCell.setDataValidation(yesNoRule);

      // 3. Handle "Consortium-wide emails"
      // Re-fetch headers in case we just added a new column
      memHeaders = membersSheet.getRange(1, 1, 1, lastMemCol).getValues()[0];
      let emailPrefColIndex = memHeaders.indexOf("Consortium-wide emails") + 1;

      if (emailPrefColIndex === 0) {
        emailPrefColIndex = lastMemCol + 1;
        membersSheet.getRange(1, emailPrefColIndex).setValue("Consortium-wide emails");
      }

      const emailPrefCell = membersSheet.getRange(newlyAddedRowIndex, emailPrefColIndex);
      const currentPrefValue = emailPrefCell.getValue().toString().trim();

      // Transform the long sentence/blank space into Yes/No
      if (currentPrefValue === "Remove this person from consortium-wide emails") {
        emailPrefCell.setValue("No");
      } else {
        emailPrefCell.setValue("Yes");
      }

      // Apply the same Yes/No dropdown validation
      emailPrefCell.setDataValidation(yesNoRule);

      // Color the row in the form sheet green
      sheet.getRange(row, 1, 1, lastCol).setBackground("#d9ead3");
    } else if (newValue === "Reject" || newValue === "Pending") {
      if (membersSheet) {
        const membersData = membersSheet.getDataRange().getValues();
        for (let i = 1; i < membersData.length; i++) {
          if (membersData[i][0]?.toString() === timestampToCheck) {
            membersSheet.deleteRow(i + 1);
            break;
          }
        }
      }
      sheet.getRange(row, 1, 1, lastCol).setBackground(newValue === "Reject" ? "#f4cccc" : null);
    }
  }
}
