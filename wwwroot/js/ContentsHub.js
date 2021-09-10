var connection = new signalR.HubConnectionBuilder().withUrl("/contentshub").build();

connection.on("ReceiveContents", function (contentsGuid, dataType, guid, parentFolderId) {
  if(guid === itemsTable.guid){

    itemsTable.getReadyItems(dataType, contentsGuid, parentFolderId)

  }
});

async function hubClientAsync(hubId, projectId, currentFolderId, currentFileId, dataType){
  connection.invoke("GetFolderContents", hubId, projectId, currentFolderId, currentFileId, dataType).catch(function (err) {
        return console.error(err.toString());
    });
}

connection.start().then(function () {
    //No function for now
}).catch(function (err) {
    return console.error(err.toString());
});