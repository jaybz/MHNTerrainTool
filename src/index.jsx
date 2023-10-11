const s2 = require('s2-cell-draw');
const colorOrder = ['#ff9900', '#009933', '#cc00ff'];
var knownCells = [];
var polyList = [];

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
            poly.setStyle({fillOpacity: 0.2, fillColor: getTerrainColor(i)});
        } else {
            poly.setStyle({fillOpacity: 0});
        }
    }
}

function getTerrainColor(s2key) {
    var color = 'black';
    if (s2key in knownCells) {
        var today = getCurrentUTCDate();
        var interval = (today.getDate() - knownCells[s2key].origin.getDate()) % colorOrder.length;
        color = colorOrder[interval];
    }
    return color;
}

var map = L.map('map').setView([0, 0], 13);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

map.on('moveend', function() { 
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

                if (s2key in knownCells === false) {
                    knownCells[s2key] = {origin: getCurrentUTCDate(), order: 1};
                } else {
                    var interval = ((knownCells[s2key].order + (colorOrder.length * 3)) + getCurrentUTCDate().getDate() - knownCells[s2key].origin.getDate()) % colorOrder.length;
                    knownCells[s2key].origin.setDate(getCurrentUTCDate().getDate() - interval);
                }

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
                    recolorCell(s2key);
                }
            });
        }
    }
});

showCurrentLocation();
