const s2 = require('s2-cell-draw');
const localStorageKey = 'MHNTerrainTool';
const localStorageVersion = 1;
const appVersion = 0.6;
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

function getData() {
    if (!localStorage.knownCells || !localStorage.dataVersion) {
        saveData();
    } else if (localStorage.dataVersion != dataVersion) {
        var currentDataVersion = 0;
        if (localStorage.dataVersion != '1.3') {
            currentDataVersion = localStorage.dataVersion;
        }

        var versionedData = {
            version: currentDataVersion,
            cells: JSON.parse(localStorage.knownCells, parseKnownCells)
        };

        for (; currentDataVersion < dataVersion; currentDataVersion++) {
            versionedData = dataMigrations[currentDataVersion](versionedData);
            if (versionedData == null) break;
        }

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

    L.easyBar([
        L.easyButton({
            id: 'export-button',
            states: [{
                icon: 'fa-download',
                title: 'Export Data',
                onClick: function(btn, map){
                    alert('Data export coming soon');
                }
            }]
        }),
        L.easyButton({
            id: 'import-button',
            states: [{
                icon: 'fa-upload',
                title: 'Import Data',
                onClick: function(btn, map){
                    alert('Data import coming soon');
                }
            }]
        })
    ]).addTo(map);
    /*
    var dataBar = L.easyBar([
        L.easyButton('fa-download', function(btn, map){
            alert('Data export coming soon');
        }),
        L.easyButton('fa-upload', function(btn, map){
            alert('Data import coming soon');
        })
    ]).addTo(map);
    */
    // version watermark
    L.control.watermark({ position: 'bottomleft' }).addTo(map);

    // map events
    map.on('moveend', mapMove);
    
    showCurrentLocation();
    timerId = setInterval(recolorCellsInterval, 60000);
}

mapInit();
