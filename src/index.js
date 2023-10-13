const s2 = require('s2-cell-draw');
const appName = 'MHNTerrainTool';
const localStorageVersion = 1;
const appVersion = '0.7.1';
const colorOrder = ['#ff9900', '#009933', '#cc00ff'];
var knownCells = {};
var polyList = [];
const dataMigrations = [dataMigrationOldToV1];
const dataVersion = dataMigrations.length;
const map = L.map('map').setView([0, 0], 13);

var timerId = null;

L.Control.Watermark = L.Control.extend({
    onAdd: function(map) {
        var text = L.DomUtil.create('span');

        text.innerHTML = 'MHNTerrainTool v' + appVersion + ', data version: ' + localStorageVersion;

        return text;
    },

    onRemove: function(map) {}
});
L.control.watermark = function(opts) {
    return new L.Control.Watermark(opts);
}


function dataMigrationOldToV1(versionedData) {
    if(versionedData == null) return versionedData;
    var version = versionedData.version;
    var cells = versionedData.cells;

    // convert version 0, otherwise retain data
    if (version === 0) {
        versionedData.version++; // only increment version, no need for actual conversion
    } else {
        return versionedData;
    }

    return versionedData;
}

function showCurrentLocation() {
    if (map) {
        navigator.geolocation.getCurrentPosition(moveMapView);
    }
}

function moveMapView(position) {
    if (map) {
        map.setView([position.coords.latitude, position.coords.longitude], 15);
    }
}

function clearCells() {
    for(i in polyList) {
        map.removeLayer(polyList[i]);
        delete polyList[i];
    }
}

function recolorCellsInterval() {
    if (document.visibilityState === "visible") recolorCells();
}

function recolorCells() {
    for (i in polyList) {
        recolorCell(i);
    }
}

function getCurrentUTCDate() {
    var today = new Date(Date.now());
    today.setUTCHours(0, 0, 0, 0);
    return today;
}

function recolorCell(i) {
    if (i in polyList) {
        poly = polyList[i];
        if (i in knownCells) {
            poly.setStyle({fillOpacity: 0.4, fillColor: getTerrainColor(i)});
        } else {
            poly.setStyle({fillOpacity: 0});
        }
    }
}

function getDateDifference(date1, date2) {
    const oneDay = 24 * 60 * 60 * 1000; // hours*minutes*seconds*milliseconds
    return Math.floor((date1 - date2) / oneDay);
}

function getTerrainColor(s2key) {
    var color = 'black';
    if (s2key in knownCells) {
        var today = getCurrentUTCDate();
        var interval = getDateDifference(today, knownCells[s2key].origin) % colorOrder.length;
        color = colorOrder[interval];
    }
    return color;
}

function migrateVersionedData(versionedData) {
    if (!versionedData) return null;
    var currentVersion = versionedData.version;
    for (; currentDataVersion < dataVersion; currentDataVersion++) {
        versionedData = dataMigrations[currentDataVersion](versionedData);
        if (versionedData == null) break;
    }
    return versionedData;
}

function getData() {
    if (!localStorage.knownCells || !localStorage.dataVersion) { // no existing data, initialize app
        saveData();
    } else if (localStorage.dataVersion != dataVersion) { // old data found, migrate to latest version
        var currentDataVersion = 0;
        if (localStorage.dataVersion != '1.3') {
            currentDataVersion = localStorage.dataVersion;
        }

        var versionedData = migrateVersionedData({
            version: currentDataVersion,
            cells: JSON.parse(localStorage.knownCells, parseKnownCells)
        });

        if (versionedData != null && versionedData.version === dataVersion) {
            knownCells = versionedData.cells;
            alert('WARNING: Old map data was converted to most recent version. The conversion may have errors.');
        } else {
            knownCells = {};
            alert('ERROR: Old map data could not be converted to the most recent version. Data was cleared instead.');
        }

        saveData();
    } else {
        knownCells = JSON.parse(localStorage.knownCells, parseKnownCells);
    }
}

function saveData() {
    localStorage.knownCells = JSON.stringify(knownCells);
    localStorage.dataVersion = dataVersion;
}

function stringifyKnownCells(key, value) {
    if (key == "origin") {
        value.getTime();
    } else {
        return value;
    }
}

function parseKnownCells(key, value) {
    if (key == "origin") {
        return new Date(value);
    } else {
        return value;
    }
}

function mapMove() {
    bounds = map.getBounds();
    const cells = s2.createPolygonListFromBounds({
        bounds: [[bounds._southWest.lng, bounds._southWest.lat], [bounds._northEast.lng, bounds._northEast.lat]],
        level: 14
    });

    clearCells();

    if (cells.length <= 5000) {
        //var polygonList = [];
        for (let i = 0; i < cells.length; i++) {
            var box = cells[i];
            polygon = [
                [box.path[0][1], box.path[0][0]],
                [box.path[1][1], box.path[1][0]],
                [box.path[2][1], box.path[2][0]],
                [box.path[3][1], box.path[3][0]],
            ];
            poly = L.polygon(polygon, {color: '#999999', weight: 1, fill: true}).addTo(map);
            polyList[cells[i]["S2Key"]] = poly;

            recolorCell(cells[i]["S2Key"]);

            poly.on('click', function(e) {
                var s2key = cells[i]["S2Key"];
                var today = getCurrentUTCDate();

                if (s2key in knownCells === false) {
                    knownCells[s2key] = {origin: today, order: 1};
                } else {
                    var interval = ((knownCells[s2key].order + (colorOrder.length * 3)) + getDateDifference(today, knownCells[s2key].origin)) % colorOrder.length;
                    knownCells[s2key].origin = today;
                    knownCells[s2key].origin.setDate(today.getDate() - interval);
                }
                saveData();

                recolorCell(s2key);
            });

            poly.on('contextmenu', function(e) {
                var s2key = cells[i]["S2Key"];

                if(s2key in knownCells) {
                    var win = L.control.window(map, {
                        modal: true,
                        closeButton: false,
                        position: 'center',
                        content: 'Current rotation: ' + ((knownCells[s2key].order > 0) ? 'Desert > Forest > Swamp' : 'Desert > Swamp > Forest'),
                        prompt: {
                            buttonOK: '<i class="fa fa-trash-o" aria-hidden="true" title="Clear Cell"></i>',
                            callback: function() {
                                var s2key = cells[i]["S2Key"];
                                delete knownCells[s2key];
                                saveData();
                                recolorCell(s2key);
                            },
                            buttonAction: '<i class="fa fa-refresh" aria-hidden="true" title="Reverse Terrain Order"></i>',
                            action: function() {
                                var s2key = cells[i]["S2Key"];
                                if (s2key in knownCells) {
                                    if (knownCells[s2key].order > 0) {
                                        knownCells[s2key].order = -1;
                                    } else {
                                        knownCells[s2key].order = 1;
                                    }
                                    saveData();
                                    recolorCell(s2key);
                                }
                            },
                            buttonCancel: '<i class="fa fa-times" aria-hidden="true" title="Cancel"></i>'
                        }
                    }).show();
                }
            });
        }
    }
}

function mapInit() {
    getData();

    // map layers
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    
    // map controls
    L.control.locate({
        drawCircle: false,
        keepCurrentZoomLevel: true,
        icon: 'fa fa-map-marker',
        iconLoading: 'fa fa-spinner fa-pulse fa-fw',
        iconElementTag: 'i',
        clickBehavior: {inView: 'stop', outOfView: 'setView', inViewNotFollowing: 'setView'}
    }).addTo(map);

    var fileUpload = L.DomUtil.get('fileupload');
    L.DomEvent.on(fileUpload, 'change', function(e) {
        const file = e.target.files[0];
        var reader = new FileReader();
        reader.addEventListener(
            'load',
            () => {
                var versionedData = JSON.parse(reader.result, parseKnownCells);
                var abort = false;
                var importVersion = versionedData.version;

                if (versionedData != null && versionedData.version != dataVersion) {
                    if (confirm('WARNING: Imported file is using an old data version and might not be imported correctly. Do you want to continue?')) {
                        versionedData = migrateVersionedData(versionedData);
                    } else {
                        abort = true;
                    }
                } 
                
                if (versionedData == null || versionedData.version != dataVersion) {
                    alert('ERROR: Imported data could not be parsed.');
                } else if (!abort) {
                    var importCells = versionedData.cells;
                    var foundExisting = false;
                    for (var i in importCells) {
                        if (!(i in knownCells)) {
                            knownCells[i] = importCells[i];
                        } else {
                            foundExisting = true;
                        }
                    }
                    saveData();
                    recolorCells();
                    if (foundExisting) {
                        alert('At least one imported cell already exists in your data. Those cells were ignored in the import. None of your existing data was overwritten.');
                    }
                }        
            },
            false);
        reader.readAsText(file);
        fileUpload.value = '';
    });
    L.easyBar([
        L.easyButton({
            id: 'export-button',
            states: [{
                icon: 'fa-download',
                title: 'Export Data',
                onClick: function(btn, map){
                    const exportFileName = appName + '-' + appVersion + '-' + localStorage.dataVersion + '-export.json';

                    var versionedData = {
                        version: localStorage.dataVersion,
                        cells: JSON.parse(localStorage.knownCells, parseKnownCells)
                    };
                    var serializedData = JSON.stringify(versionedData);
            
                    var file = new Blob([serializedData], {type: 'application/json'});
                    var a = document.createElement('a');
                    a.href = URL.createObjectURL(file);
                    a.download = exportFileName;
                    a.click();
                }
            }]
        }),
        L.easyButton({
            id: 'import-button',
            states: [{
                icon: 'fa-upload',
                title: 'Import Data',
                onClick: function(btn, map) {
                    fileUpload.click();
                }
            }]
        }),
        L.easyButton({
            id: 'clear-data-button',
            states: [{
                icon: 'fa-trash',
                title: 'Clear Data Data',
                onClick: function(btn, map){
                    if (confirm('This will clear all cells of terrain. Are you sure you want to do this?')) {
                        knownCells = {};
                        saveData();
                        recolorCells();
                    }
                }
            }]
        })
    ]).addTo(map);

    // version watermark
    L.control.watermark({ position: 'bottomleft' }).addTo(map);

    // map events
    map.on('moveend', mapMove);
    
    showCurrentLocation();
    timerId = setInterval(recolorCellsInterval, 60000);
}

mapInit();
