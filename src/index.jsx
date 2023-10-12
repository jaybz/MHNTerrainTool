const s2 = require('s2-cell-draw');
const localStorageKey = 'MHNTerrainTool';
const localStorageVersion = 1;
const colorOrder = ['#ff9900', '#009933', '#cc00ff'];
var knownCells = {};
var polyList = [];
const dataVersion = localStorageVersion + '.' + colorOrder.length;
const map = L.map('map').setView([0, 0], 13);

function showCurrentLocation() {
    if (map) {
        navigator.geolocation.getCurrentPosition(moveMapView)
    }
}

function moveMapView(position) {
    if (map) {
        map.setView([position.coords.latitude, position.coords.longitude], 13);
    }
}

function clearCells() {
    for(i in polyList) {
        map.removeLayer(polyList[i]);
        delete polyList[i];
    }
}

function recolorCells() {
    for (i in polyList) {
        recolorCells(i);
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
    if (!localStorage.knownCells || !localStorage.dataVersion || localStorage.dataVersion != dataVersion) {
        saveData();
        alert('Application Data Initialized');
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

                if (s2key in knownCells) {
                    if (knownCells[s2key].order > 0) {
                        knownCells[s2key].order = -1;
                    } else {
                        knownCells[s2key].order = 1;
                    }
                    saveData();
                    recolorCell(s2key);
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
    L.control.locate({drawCircle: false}).addTo(map);

    // map events
    map.on('moveend', mapMove);
    
    showCurrentLocation();
}

mapInit();
