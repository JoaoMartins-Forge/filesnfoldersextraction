var itemsTable = null;

const humanReadableTitles = {
    name: 'ITEM NAME',
    createTime: 'CREATION DATE',
    createUserId: 'CREATOR ID',
    createUserName: 'CREATOR NAME',
    lastModifiedTime: 'LAST CHANGE TIME',
    lastModifiedUserId: 'LAST CHANGED BY (ID)',
    lastModifiedUserName: 'LAST CHANGED BY (NAME)',
    fullPath: 'FULL PATH',
    timestamp: 'EXTRACTION DATE'
}

const excludedFromTable = [
    'id',
    'type',
    'hidden'
]

// const notHumanReadableFields = [
//     'createUserId',
//     'lastModifiedUserId',
//     'lastModifiedUserId'
// ]

const folderSpecificFields = {
    filesInside: 'FILES INSIDE',
    foldersInside: 'FOLDERS INSIDE'
}

const fileSpecificFields = {
    version: 'VERSION',
    size: 'SIZE'
}

class ItemsTable {
    constructor(tableId, hubId, projectId) {
        this.tableId = tableId;
        this.hubId = hubId;
        this.projectId = projectId;
        // this.currentDataType = currentDataType;
        this.items = [];
        this.dataSet = [];
        this.fullPaths = {};
        this.guid = createUUID();
        this.requests = 0;
        this.responses = 0;
    }

    getTableData() {
        return $("#itemsTable").bootstrapTable('getData');
    }

    exportData() {
        switch (this.checkExportType()) {
            case 'csv':
                this.exportTableAsCSV();
                break;
        }
    }

    exportTableAsCSV() {
        let visibleColumns = this.getVisibleColumns()
        let csvData = this.getTableData();
        let csvDataCleared = this.cleanForCommas(csvData);
        let csvString = csvDataCleared.join("%0A");
        let a = document.createElement('a');
        a.href = 'data:attachment/csv,' + csvString;
        a.target = '_blank';
        a.download = 'ExportedData' + (new Date()).getTime() + '.csv';
        document.body.appendChild(a);
        a.click();
    }

    getVisibleColumns() {
        let visibleColumnsKeys = [];
        for (const columnObjcet of $("#itemsTable").bootstrapTable('getVisibleColumns')) {
            visibleColumnsKeys.push(columnObjcet.field);
        }
        return visibleColumnsKeys;
    }

    cleanForCommas(csvData) {
        let clearedCsvData = [];
        let visibleColumns = this.getVisibleColumns();
        clearedCsvData.push(visibleColumns);
        for (const rowObject of csvData) {
            let auxRow = [];
            for (const rowKey in rowObject) {
                if (visibleColumns.includes(rowKey))
                    auxRow.push(typeof rowObject[rowKey] === "string" ? rowObject[rowKey].replaceAll(',', ' ') : rowObject[rowKey]);
            }
            clearedCsvData.push(auxRow);
        }
        return clearedCsvData;
    }

    checkExportType() {
        return $('input[name=export]:checked', '#datasets').val();
    }

    reset() {
        this.items = [];
        this.dataSet = [];
        this.fullPaths = {};
    }

    checkHumanReadable() {
        return $('input[name=dataTypeToDisplay]:checked', '#datasets').val() === 'humanReadable';
    }

    getTableLevel() {
        return $('input[name=filter_by]:checked', '#statsView').val();
    }

    prepareDataset() {
        let filteredObjects;
        switch (this.getTableLevel()) {
            case "folderlevel":
                filteredObjects = this.items.filter(item => item.type === 'folder');
                break;
            case "filelevel":
                filteredObjects = this.items.filter(item => item.type === 'file');
                break;
        }

        for (const filteredItem of filteredObjects) {
            if (!filteredItem.fullPath) {
                filteredItem.fullPath = this.fullPaths[filteredItem.id];
            }
        }

        this.dataSet = filteredObjects;
    }

    getHumanReadableColumns() {
        let excludedColumns = excludedFromTable;

        this.prepareDataset();
        let tableColumns = [];
        for (const elementKey in humanReadableTitles) {
            if (excludedColumns.findIndex(key => key === elementKey) === -1) {
                tableColumns.push({
                    field: elementKey,
                    title: humanReadableTitles[elementKey]
                })
            }
        }
        switch (this.getTableLevel()) {
            case "folderlevel":
                for (const elementKey in folderSpecificFields) {
                    if (excludedColumns.findIndex(key => key === elementKey) === -1) {
                        tableColumns.push({
                            field: elementKey,
                            title: folderSpecificFields[elementKey]
                        })
                    }
                }
                break;
            case "filelevel":
                for (const elementKey in fileSpecificFields) {
                    if (excludedColumns.findIndex(key => key === elementKey) === -1) {
                        tableColumns.push({
                            field: elementKey,
                            title: fileSpecificFields[elementKey]
                        })
                    }
                }
                break;
        }


        return tableColumns;
    }

    async drawTable() {
        $("#itemsTable").empty();

        this.prepareDataset();
        let tableColumns = this.getHumanReadableColumns();

        $("#itemsTable").bootstrapTable({
            data: this.dataSet,
            pagination: true,
            search: true,
            sortable: true,
            columns: tableColumns
        })

    }

    refreshTable() {
        this.prepareDataset();

        let tableColumns = this.getHumanReadableColumns();

        $('#itemsTable').bootstrapTable('refreshOptions', {
            data: this.dataSet,
            columns: tableColumns
        });

    }

    updateItemsInside(currentFolderId, totalFiles, totalFolders) {
        let currentFolder = this.items.filter(f => f.id === currentFolderId)[0];

        currentFolder.filesInside += totalFiles;
        currentFolder.foldersInside += totalFolders;

        let currentFullPath = this.fullPaths[currentFolderId];

        let folders = currentFullPath.split('/');

        if (folders.length > 1) {
            folders.pop();
            let parentFolderFullPath = folders.join('/');
            let parentFolderId = Object.keys(this.fullPaths).find(key => this.fullPaths[key] === parentFolderFullPath);

            this.updateItemsInside(parentFolderId, totalFiles, totalFolders);
        }
        
    }

    async fetchDataAsync( currentFolderId = null, dataType ) {
        this.requests ++;
        this.updateStatus();
        try {
            const requestUrl = '/api/forge/resource/info';
            const requestData = {
                'hubId': this.hubId,
                'projectId': this.projectId,
                'folderId': currentFolderId,
                'dataType': dataType,
                'connectionId': connection.connection.connectionId,
                'guid': this.guid
            };
            apiClientAsync(requestUrl, requestData);

        }
        catch (err) {
            console.log(err);
        }
    }

    async getReadyItems(dataType, contentsGuid, parentFolderId){

        const requestUrl = 'api/forge/resource/items';
        const requestData = {
            'jobGuid': contentsGuid
        };
        let contents = await apiClientAsync(requestUrl, requestData);

        this.responses ++;
        this.updateStatus();

        this.items.push(...contents);

        switch (dataType) {
            case 'topFolders': {
                for (const rawItem of contents) {
                    this.fullPaths[rawItem.id] = rawItem.name;
                }
                this.drawTable();
                break;
            }
            case 'folder': {
                let parentFullPath = this.fullPaths[parentFolderId];
                for (const rawItem of contents) {
                    this.fullPaths[rawItem.id] = `${parentFullPath}/${rawItem.name}`;
                }
                let totalFiles = contents.filter(i => i.type === 'file').length;
                let totalFolders = contents.filter(i => i.type === 'folder').length;
                this.updateItemsInside(parentFolderId, totalFiles, totalFolders);
                this.refreshTable();
            };
        };
    
        for (const folderContent of contents) {
            (folderContent.type == "folder" ? this.getFolderContents(folderContent) : null);
        }
    }

    async updateStatus(){
        $('#statusLabel').empty();
        $('#statusLabel').append('<label>'+this.responses+' out of '+this.requests+' steps done!</label>');
    }

    async getReport() {
        this.fetchDataAsync(null, 'topFolders');
    }

    async getFolderContents(folder) {
        this.fetchDataAsync(folder.id, 'folder');
    }
}

function createUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
       var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
       return v.toString(16);
    });
}

// helper function for Request
function apiClientAsync(requestUrl, requestData = null, requestMethod = 'get') {
    let def = $.Deferred();

    if (requestMethod == 'post') {
        requestData = JSON.stringify(requestData);
    }

    jQuery.ajax({
        url: requestUrl,
        contentType: 'application/json',
        type: requestMethod,
        dataType: 'json',
        data: requestData,
        success: function (res) {
            def.resolve(res);
        },
        error: function (err) {
            console.error('request failed:');
            def.reject(err)
        }
    });
    return def.promise();
}