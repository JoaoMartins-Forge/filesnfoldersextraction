using Autodesk.Forge;
using Autodesk.Forge.Model;
using Hangfire;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using MongoDB.Driver;
using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Bson.Serialization;
using System.Linq;

namespace forgeSample.Controllers
{
  public class DataManagementController : ControllerBase
  {
    /// <summary>
    /// Credentials on this request
    /// </summary>
    private Credentials Credentials { get; set; }

    /// <summary>
    /// GET TreeNode passing the ID
    /// </summary>
    [HttpGet]
    [Route("api/forge/datamanagement")]
    public async Task<IList<jsTreeNode>> GetTreeNodeAsync(string id)
    {
      Credentials = await Credentials.FromSessionAsync(base.Request.Cookies, Response.Cookies);
      if (Credentials == null) { return null; }

      IList<jsTreeNode> nodes = new List<jsTreeNode>();

      if (id == "#") // root
        return await GetHubsAsync();
      else
      {
        string[] idParams = id.Split('/');
        string resource = idParams[idParams.Length - 2];
        switch (resource)
        {
          case "hubs": // hubs node selected/expanded, show projects
            return await GetProjectsAsync(id);
        }
      }

      return nodes;
    }

    [HttpGet]
    [Route("api/forge/resource/info")]
    public List<dynamic> GetResourceInfo()
    {
      switch (base.Request.Query["dataType"])
      {
        case "topFolders":
          return GetProjectContents(base.Request.Query["hubId"], base.Request.Query["projectId"]).GetAwaiter().GetResult();
        case "folder":
          return GetFolderContents(base.Request.Query["projectId"], base.Request.Query["folderId"]).GetAwaiter().GetResult();
        default:
          break;
      }
      return new List<dynamic>();
    }



    private async Task<IList<jsTreeNode>> GetHubsAsync()
    {
      IList<jsTreeNode> nodes = new List<jsTreeNode>();

      // the API SDK
      HubsApi hubsApi = new HubsApi();
      hubsApi.Configuration.AccessToken = Credentials.TokenInternal;

      var hubs = await hubsApi.GetHubsAsync();
      foreach (KeyValuePair<string, dynamic> hubInfo in new DynamicDictionaryItems(hubs.data))
      {
        // check the type of the hub to show an icon
        string nodeType = "hubs";
        switch ((string)hubInfo.Value.attributes.extension.type)
        {
          case "hubs:autodesk.core:Hub":
            nodeType = "hubs"; // if showing only BIM 360, mark this as 'unsupported'
            break;
          case "hubs:autodesk.a360:PersonalHub":
            nodeType = "personalHub"; // if showing only BIM 360, mark this as 'unsupported'
            break;
          case "hubs:autodesk.bim360:Account":
            nodeType = "bim360Hubs";
            break;
        }

        // create a treenode with the values
        jsTreeNode hubNode = new jsTreeNode(hubInfo.Value.links.self.href, hubInfo.Value.attributes.name, nodeType, !(nodeType == "unsupported"));
        nodes.Add(hubNode);
      }

      return nodes;
    }

    private async Task<IList<jsTreeNode>> GetProjectsAsync(string href)
    {
      IList<jsTreeNode> nodes = new List<jsTreeNode>();

      // the API SDK
      ProjectsApi projectsApi = new ProjectsApi();
      projectsApi.Configuration.AccessToken = Credentials.TokenInternal;

      // extract the hubId from the href
      string[] idParams = href.Split('/');
      string hubId = idParams[idParams.Length - 1];

      var projects = await projectsApi.GetHubProjectsAsync(hubId);
      foreach (KeyValuePair<string, dynamic> projectInfo in new DynamicDictionaryItems(projects.data))
      {
        // check the type of the project to show an icon
        string nodeType = "projects";
        switch ((string)projectInfo.Value.attributes.extension.type)
        {
          case "projects:autodesk.core:Project":
            nodeType = "a360projects";
            break;
          case "projects:autodesk.bim360:Project":
            if ((string)projectInfo.Value.attributes.extension.data.projectType == "ACC")
            {
              nodeType = "accprojects";
            }
            else
            {
              nodeType = "bim360projects";
            }
            break;
        }

        // create a treenode with the values
        jsTreeNode projectNode = new jsTreeNode(projectInfo.Value.links.self.href, projectInfo.Value.attributes.name, nodeType, false);
        nodes.Add(projectNode);
      }

      return nodes;
    }

    private async Task<List<dynamic>> GetProjectContents(string hubId, string projectId)
    {
      List<dynamic> topfolders = new List<dynamic>();

      Credentials = await Credentials.FromSessionAsync(base.Request.Cookies, Response.Cookies);
      // the API SDK
      ProjectsApi projectApi = new ProjectsApi();
      projectApi.Configuration.AccessToken = Credentials.TokenInternal;

      var folders = await projectApi.GetProjectTopFoldersAsync(hubId, projectId);
      foreach (KeyValuePair<string, dynamic> folder in new DynamicDictionaryItems(folders.data))
      {
        dynamic jFolder = getNewObject(folder);

        topfolders.Add(jFolder);
      }
      return topfolders;
    }

    private async Task<List<dynamic>> GetFolderContents(string projectId, string folderId)
    {

      Credentials = await Credentials.FromSessionAsync(base.Request.Cookies, Response.Cookies);
      string jobGuid = Guid.NewGuid().ToString();

      string jobId = BackgroundJob.Enqueue(() =>
        // the API SDK
        GetAllFolderContents(projectId, folderId, jobGuid, Credentials.TokenInternal)
      );

      while (JobStorage.Current.GetConnection().GetJobData(jobId).State != "Deleted" && JobStorage.Current.GetConnection().GetJobData(jobId).State != "Succeeded")
      {
        Thread.Sleep(200);
			}

      return GetItemsFromDb(jobGuid);
		}

		private List<dynamic> GetItemsFromDb(string jobGuid)
		{
			try
			{
        BsonClassMap.RegisterClassMap<ItemsCollection>();
      }
			catch (Exception)
			{

			}
      
      MongoClient client = new MongoClient(Environment.GetEnvironmentVariable("MONGO_CONNECTOR"));

			IMongoDatabase database = client.GetDatabase(Environment.GetEnvironmentVariable("ITEMS_DB"));

			var items_collection = database.GetCollection<ItemsCollection>(Environment.GetEnvironmentVariable("ITEMS_COLLECTION"));

      List<ItemsCollection> retornados = items_collection.Find(colitem => colitem.jobGuid == jobGuid).ToList();

      List<dynamic> items = retornados.Select(o => o.item).ToList();

      return items;
    }

		public async Task GetAllFolderContents(string projectId, string folderId, string jobGuid, string token)
		{
			FoldersApi folderApi = new FoldersApi();
			folderApi.Configuration.AccessToken = token;

			dynamic folderContents = await folderApi.GetFolderContentsAsync(projectId, folderId);
			// the GET Folder Contents has 2 main properties: data & included (not always available)
			DynamicDictionaryItems folderData = new DynamicDictionaryItems(folderContents.data);

      List<dynamic> items = AddItems(folderContents);
      //items.AddRange(AddItems(folderContents));

      int pageNumber = 0;
			try
			{
				while (folderContents.links.next != null)
				{
					pageNumber++;
					folderContents = await folderApi.GetFolderContentsAsync(projectId, folderId, null, null, null, pageNumber);

					folderData = new DynamicDictionaryItems(folderContents.data);

          List<dynamic> newItems = AddItems(folderContents);
          items.AddRange(newItems);
          //items.AddRange(AddItems(folderContents));
				}
			}
			catch (Exception)
			{ }

      AddItemsToDb(jobGuid, items);
		}

		private void AddItemsToDb(string jobGuid, List<dynamic> items)
		{
      MongoClient client = new MongoClient(Environment.GetEnvironmentVariable("MONGO_CONNECTOR"));

      IMongoDatabase database = client.GetDatabase(Environment.GetEnvironmentVariable("ITEMS_DB"));
      var itemsCollection = database.GetCollection<ItemsCollection>(Environment.GetEnvironmentVariable("ITEMS_COLLECTION"));
			foreach (var item in items)
			{
        ItemsCollection newItem = new ItemsCollection()
        {
          jobGuid = jobGuid,
          item = item
        };

        itemsCollection.InsertOne(newItem);
      }

		}

		public static List<dynamic> AddItems(dynamic folderContents)
		{
      List<dynamic> items = new List<dynamic>();

      DynamicDictionaryItems folderData = new DynamicDictionaryItems(folderContents.data);
      // let's start iterating the FOLDER DATA
      foreach (KeyValuePair<string, dynamic> folderContentItem in folderData)
			{
				dynamic newItem = getNewObject(folderContentItem);
				if (newItem.type == "file")
				{
					try
					{
            dynamic itemLastVersion = getFileVersion(folderContents.included, folderContentItem.Value.relationships.tip.data.id);
            newItem.version = itemLastVersion.version;
            newItem.size = itemLastVersion.size;
          }
					catch (Exception)
					{

					}
        }
				items.Add(newItem);
			}
			return items;
		}

		private static dynamic getNewObject(KeyValuePair<string, dynamic> folderContentItem)
		{
			//dynamic newItem = new JObject();
      dynamic newItem = new System.Dynamic.ExpandoObject();
      newItem.createTime = folderContentItem.Value.attributes.createTime;
      newItem.createUserId = folderContentItem.Value.attributes.createUserId;
      newItem.createUserName = folderContentItem.Value.attributes.createUserName;
      newItem.lastModifiedTime = folderContentItem.Value.attributes.lastModifiedTime;
      newItem.lastModifiedUserId = folderContentItem.Value.attributes.lastModifiedUserId;
      newItem.lastModifiedUserName = folderContentItem.Value.attributes.lastModifiedUserName;
      newItem.hidden = folderContentItem.Value.attributes.hidden;
      newItem.id = folderContentItem.Value.id;
      newItem.timestamp = DateTime.UtcNow.ToLongDateString();

      string extension = folderContentItem.Value.attributes.extension.type;
			switch (extension)
			{
				case "folders:autodesk.bim360:Folder":
					newItem.name = folderContentItem.Value.attributes.name;
          newItem.filesInside = 0;
          newItem.foldersInside = 0;
					newItem.type = "folder";
					break;
				case "items:autodesk.bim360:File":
					newItem.name = folderContentItem.Value.attributes.displayName;
					newItem.type = "file";
					break;
				case "items:autodesk.bim360:Document":
					newItem.name = folderContentItem.Value.attributes.displayName;
					newItem.type = "file";
					break;
				default:
          newItem.name = folderContentItem.Value.attributes.displayName;
          newItem.type = "file";
          break;
			}

			return newItem;
		}

		private static dynamic getFileVersion(dynamic included, string versionId)
		{
      DynamicDictionaryItems folderIncluded = new DynamicDictionaryItems(included);

      foreach (KeyValuePair<string, dynamic> ItemVersion in folderIncluded)
			{
				if (ItemVersion.Value.id == versionId)
				{
					try
					{
            dynamic dynamicAux = new System.Dynamic.ExpandoObject();
            dynamicAux.version = ItemVersion.Value.attributes.versionNumber;
            dynamicAux.size = ItemVersion.Value.attributes.storageSize;
            return dynamicAux;
          }
					catch (Exception ex)
					{
            return new System.Dynamic.ExpandoObject();
          }
          
				}
			}
      return new System.Dynamic.ExpandoObject();
    }

		public static string Base64Encode(string plainText)
    {
      var plainTextBytes = System.Text.Encoding.UTF8.GetBytes(plainText);
      return System.Convert.ToBase64String(plainTextBytes).Replace("/", "_");
    }

    [BsonIgnoreExtraElements]
    public class ItemsCollection
    {
      public string jobGuid { get; set; }
      public dynamic item { get; set; }
    }

    public class jsTreeNode
    {
      public jsTreeNode(string id, string text, string type, bool children)
      {
        this.id = id;
        this.text = text;
        this.type = type;
        this.children = children;
      }

      public string id { get; set; }
      public string text { get; set; }
      public string type { get; set; }
      public bool children { get; set; }
    }

  }
}
