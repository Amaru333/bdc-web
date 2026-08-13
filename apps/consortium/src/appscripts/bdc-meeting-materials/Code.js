function getDocAsMarkdown() {
  const documentId = DocumentApp.getActiveDocument().getId();
  const url = `https://docs.google.com/document/d/${documentId}/export?format=markdown`;
  const response = UrlFetchApp.fetch(url, {
    headers: {
      "Authorization": "Bearer " + ScriptApp.getOAuthToken()
    },
    muteHttpExceptions: true
  });
  const markdownText = response.getContentText();
  Logger.log(markdownText);
  
  return markdownText;
}

/**
 * Creates a custom menu in Google Sheets when it opens.
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🚀 Deployment')
    .addItem('Re-deploy Website', 'triggerGitHubWorkflow')
    .addToUi();
}

/**
 * Triggers the GitHub Actions workflow.
 */
function triggerGitHubWorkflow() {
  var ui = SpreadsheetApp.getUi();
  
  const allSecrets = PropertiesService.getScriptProperties().getProperties();
  
  const githubToken = allSecrets['GITHUB_TOKEN']; 
  const repoOwner = allSecrets['REPO_OWNER'];
  var repoName = 'p_test';
  var workflowId = 'deploy.yml';
  var branch = 'main'; 

  var url = 'https://api.github.com/repos/' + repoOwner + '/' + repoName + '/actions/workflows/' + workflowId + '/dispatches';

  var payload = {
    "ref": branch
  };

  var options = {
    'method': 'post',
    'headers': {
      'Authorization': 'Bearer ' + githubToken,
      'Accept': 'application/vnd.github.v3+json'
    },
    'contentType': 'application/json',
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  };

  try {
    var response = ui.alert('Confirm Deployment', 'Are you sure you want to trigger a re-deploy on GitHub?', ui.ButtonSet.YES_NO);
    
    if (response == ui.Button.YES) {
      var fetchResponse = UrlFetchApp.fetch(url, options);
      var responseCode = fetchResponse.getResponseCode();

      if (responseCode >= 200 && responseCode < 300) {
        ui.alert('Success', 'Deployment triggered successfully! Check your GitHub Actions tab.', ui.ButtonSet.OK);
      } else {
        ui.alert('Error', 'Failed to trigger deployment. GitHub responded with code: ' + responseCode + '\n\n' + fetchResponse.getContentText(), ui.ButtonSet.OK);
      }
    }
  } catch (e) {
     ui.alert('Error', 'An Apps Script error occurred: ' + e.toString(), ui.ButtonSet.OK);
  }
}