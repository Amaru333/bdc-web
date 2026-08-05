function main() {
  const docId = DocumentApp.getActiveDocument().getId();
  getBodyTextString(docId)
}

function getBodyTextString(docId) {
  const document = Docs.Documents.get(docId, {"includeTabsContent": true});
  DriveApp.getFolderById("155HOr5cDRrlsw30t6roXsum06Ms-XYH2")
  .createFile("DocsAPITest.json", document)
}
