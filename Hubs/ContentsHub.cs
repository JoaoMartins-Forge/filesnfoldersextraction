using Microsoft.AspNetCore.SignalR;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace fileInfoExtract.Hubs
{
  public class ContentsHub : Microsoft.AspNetCore.SignalR.Hub
  {

    public async static Task SendContents(IHubContext<ContentsHub> hub, string connectionId, string contentsGuid, string dataType, string extractionGuid, string parentFolderId)
    {
      await hub.Clients.Client(connectionId).SendAsync("ReceiveContents", contentsGuid, dataType, extractionGuid, parentFolderId);
    }

  }
}