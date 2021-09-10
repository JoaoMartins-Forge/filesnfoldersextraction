﻿$(document).ready(function () {
    // first, check if current visitor is signed in
    jQuery.ajax({
        url: '/api/forge/oauth/token',
        success: function (res) {
            // yes, it is signed in...
            $('#signOut').show();
            $('#refreshHubs').show();

            // prepare sign out
            $('#signOut').click(function () {
                $('#hiddenFrame').on('load', function (event) {
                    location.href = '/api/forge/oauth/signout';
                });
                $('#hiddenFrame').attr('src', 'https://accounts.autodesk.com/Authentication/LogOut');
                // learn more about this signout iframe at
                // https://forge.autodesk.com/blog/log-out-forge
            })

            // and refresh button
            $('#refreshHubs').click(function () {
                $('#userHubs').jstree(true).refresh();
            });

            // finally:
            prepareUserHubsTree();
            showUser();
        }
    });

    $('#autodeskSigninButton').click(function () {
        jQuery.ajax({
            url: '/api/forge/oauth/url',
            success: function (url) {
                location.href = url;
            }
        });
    });

    $('input[type=radio][name=filter_by]').change(function() {
        itemsTable.refreshTable();
    });

    $('#btnRefresh').click(function () {
        itemsTable.reset();
        itemsTable.getReport();
    });

    $('#executeCSV').click(function () {
        itemsTable.exportData();
    });
});

function prepareUserHubsTree() {
    $('#userHubs').jstree({
        'core': {
            'themes': { "icons": true },
            'multiple': false,
            'data': {
                "url": '/api/forge/datamanagement',
                "dataType": "json",
                'cache': false,
                'data': function (node) {
                    $('#userHubs').jstree(true).toggle_node(node);
                    return { "id": node.id };
                }
            }
        },
        'types': {
            'default': { 'icon': 'glyphicon glyphicon-question-sign' },
            '#': { 'icon': 'glyphicon glyphicon-user' },
            'hubs': { 'icon': 'https://github.com/Autodesk-Forge/bim360appstore-data.management-nodejs-transfer.storage/raw/master/www/img/a360hub.png' },
            'personalHub': { 'icon': 'https://github.com/Autodesk-Forge/bim360appstore-data.management-nodejs-transfer.storage/raw/master/www/img/a360hub.png' },
            'bim360Hubs': { 'icon': 'https://github.com/Autodesk-Forge/bim360appstore-data.management-nodejs-transfer.storage/raw/master/www/img/bim360hub.png' },
            'bim360projects': { 'icon': 'https://github.com/Autodesk-Forge/bim360appstore-data.management-nodejs-transfer.storage/raw/master/www/img/bim360project.png' },
            'a360projects': { 'icon': 'https://github.com/Autodesk-Forge/bim360appstore-data.management-nodejs-transfer.storage/raw/master/www/img/a360project.png' },
            'accprojects': { 'icon': 'https://raw.githubusercontent.com/xiaodongliang/forge-bim360reports/master/public/img/accproject.svg'},
            
            'unsupported': { 'icon': 'glyphicon glyphicon-ban-circle' }
        },
        "sort": function (a, b) {
            var a1 = this.get_node(a);
            var b1 = this.get_node(b);
            var parent = this.get_node(a1.parent);
            if (parent.type === 'items') { // sort by version number
                var id1 = Number.parseInt(a1.text.substring(a1.text.indexOf('v') + 1, a1.text.indexOf(':')))
                var id2 = Number.parseInt(b1.text.substring(b1.text.indexOf('v') + 1, b1.text.indexOf(':')));
                return id1 > id2 ? 1 : -1;
            }
            else if (a1.type !== b1.type) return a1.icon < b1.icon ? 1 : -1; // types are different inside folder, so sort by icon (files/folders)
            else return a1.text > b1.text ? 1 : -1; // basic name/text sort
        },
        "plugins": ["types", "state", "sort"],
        "state": { "key": "autodeskHubs" }// key restore tree state
    }).bind("activate_node.jstree", function (evt, data) {
        if (data != null && data.node != null && (data.node.type == 'accprojects' || data.node.type == 'bim360projects')) {
            $('#statusLabel').empty();
            $('#statusLabel').append('<label>reading project '+data.node.text+'...</label>');
            itemsTable = new ItemsTable("itemsTable", data.node.id.split('/')[6], data.node.id.split('/')[8]);
            itemsTable.getReport();
        }
    });
}


function showUser() {
    jQuery.ajax({
        url: '/api/forge/user/profile',
        success: function (profile) {
            var img = '<img src="' + profile.picture + '" height="30px">';
            $('#userInfo').html(img + profile.name);
        }
    });
}
