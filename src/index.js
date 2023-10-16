var S2 = require('s2-geometry').S2;
const appName = 'MHNTerrainMap';
const appVersion = '0.8.7';
const terrainColor = ['#009933', '#ff9900', '#3300ff'];
const terrainNames = ['Forest', 'Desert', 'Swamp'];
const terrainIcons = ['fa-tree', 'fa-area-chart', 'fa-tint'];
var dataVersion = '1.0';
var terrainRotation = [];
terrainColor.forEach((item, index) => { terrainRotation.push(index)});
var visiblePolygons = {};
const initLocation = L.Permalink.getMapLocation(-1, [37.7955742, -122.3958959]);
const defaultZoom = 15;
const map = L.map('map', {center: initLocation.center, zoom: initLocation.zoom < 0 ? defaultZoom : initLocation.zoom});
L.Permalink.setup(map);
const searchProvider = new GeoSearch.OpenStreetMapProvider();
const terrainCellLevel = 14;
const terrainOpacity = 0.3;
var lastRecolor = new Date(0);
var terrainButtons = [];
var overrideDate = null;

var timerId = null;

L.Control.Watermark = L.Control.extend({
    onAdd: function(map) {
        var text = L.DomUtil.create('span');

        text.innerHTML = appName + ' v' + appVersion;

        return text;
    },

    onRemove: function(map) {}
});

L.control.watermark = function(opts) {
    return new L.Control.Watermark(opts);
}

function s2IdToNumericToken(cellId) {
    return s2TokenToInt(s2IdToToken(cellId));
}

function s2IdToToken(cellId) {
    return parseInt(cellId).toString(16).replace(/0+$/, '');
}

function s2TokenToInt(token) {
    return parseInt(token, 16);
}

function s2GetVisibleCells(bounds) {
    var center = bounds.getCenter();
    var origin = getCellFromPoint(center);
    var visibleCells = [origin];

    var visibleNeighbors = getCellNeighbors(origin)
        .filter((cell) => { return !visibleCells.map((cell) => { return cell.id }).includes(cell.id) })
        .filter((cell) => { return isCellVisible(bounds, cell) });

    while(visibleNeighbors.length > 0) {
        visibleCells = visibleCells.concat(visibleNeighbors);
        var newNeighbors = [];
        visibleNeighbors.forEach((neighbor) => {
            newNeighbors = newNeighbors.concat(
                getCellNeighbors(neighbor)
                .filter((cell) => { return !visibleCells.map((existing) => { return existing.id; }).includes(cell.id) })
                .filter((cell) => { return !newNeighbors.map((existing) => { return existing.id; }).includes(cell.id) })
            );
        });
        visibleNeighbors = newNeighbors.filter((cell) => { return isCellVisible(bounds, cell) });
    }

    return visibleCells;
}

function getCellFromPoint(point) {
    var s2cell = S2.S2Cell.FromLatLng(point, terrainCellLevel);
    var poly = s2CellToPolygon(s2cell);
    var key = s2cell.toHilbertQuadkey();
    var id = S2.keyToId(key);
    return { s2cell: s2cell, polygon: poly, id: id, key: key };
}

function getCellNeighbors(cell) {
    var s2cell = cell.s2cell;
    var s2neighbors = cell.s2cell.getNeighbors();
    var neighbors = s2neighbors.map((item) => { return { s2cell: item, polygon: s2CellToPolygon(item), id: S2.keyToId(item.toHilbertQuadkey()) }});
    return neighbors;
}

function s2CellToPolygon(cell) {
    var corners = cell.getCornerLatLngs();
    return L.polygon([
        [corners[0].lat, corners[0].lng],
        [corners[1].lat, corners[1].lng],
        [corners[2].lat, corners[2].lng],
        [corners[3].lat, corners[3].lng],
    ], {color: '#999999', weight: 1, fill: true});
}

function isCellVisible(bounds, cell) {
    return bounds.overlaps(cell.polygon._bounds);
}

function showCurrentLocation() {
    if (map) {
        navigator.geolocation.getCurrentPosition(moveMapView, setDefaultZoom);
    }
}

function moveMapView(position) {
    if (map) {
        map.setView([position.coords.latitude, position.coords.longitude]);
    }
}

function setDefaultZoom(error) {
    map.setZoom(defaultZoom);
}

function clearCells() {
    for(i in visiblePolygons) {
        map.removeLayer(visiblePolygons[i]);
        delete visiblePolygons[i];
    }
}

function recolorCellsInterval() {
    if (
        document.visibilityState === "visible" &&
        (((getCurrentUTCDate() - lastRecolor) / (24 * 60 * 60 * 1000)) >= 1)
    ) {
        recolorCells();
    }
}

function recolorCells() {
    for (i in visiblePolygons) {
        recolorCell(i);
    }
    lastRecolor = getCurrentUTCDate();
}

function getCurrentUTCDate() {
    var today = new Date(Date.now());
    today.setUTCHours(0, 0, 0, 0);
    return today;
}

function recolorCell(i) {
    if (i in visiblePolygons) {
        visiblePolygons[i].setStyle({fillOpacity: terrainOpacity, fillColor: getTerrainColor(i)});
    }
}

function getTerrainColor(i) {
    var dayCount = ((getCurrentUTCDate().getTime() / 1000) / (24 * 60 * 60) + 1) % terrainColor.length;
    var seedIndex = s2IdToNumericToken(i) % terrainColor.length;
    var terrainIndex = (seedIndex + dayCount) % terrainColor.length;

    return terrainColor[terrainRotation[terrainIndex]];
}

function getLocalStorageData() {
    if (localStorage.dataVersion === dataVersion) {
        terrainRotation = JSON.parse(localStorage.terrainRotation);
    } else {
        saveLocalStorageData();
    }
}

function saveLocalStorageData() {
    localStorage.dataVersion = dataVersion;
    localStorage.terrainRotation = JSON.stringify(terrainRotation);
}

function mapMove() {
    bounds = map.getBounds();
    clearCells();

    if (map.getZoom() >= 14) {
        const cells = s2GetVisibleCells(bounds);
        cells.forEach((cell) => {
            visiblePolygons[cell.id] = cell.polygon;

            cell.polygon.on('click', (e) => {
                var id = cell.id;
                var center = visiblePolygons[cell.id].getCenter();
                const url = new URL(location.href);
                url.hash = center.lat + ',' + center.lng + ',' + defaultZoom + 'z';
                navigator.clipboard.writeText(url.href);
            });
            cell.polygon.addTo(map);
        });
        recolorCells();
    }
}

function mapInit() {
    // map layers
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    
    // map controls
    const searchControl = new GeoSearch.GeoSearchControl({
        position: 'topleft',
        provider: searchProvider,
        showMarker: true,
        marker: {
            icon: new L.Icon.Default(),
            draggable: false,
        },
        showPopup: false,
        autoClose: true,
        autoComplete: true,
        retainZoomLevel: true,
        animateZoom: true,
        maxSuggestions: 5,
        keepResult: true,
        maxMarkers: 1,
        style: 'button'
      });
    map.addControl(searchControl);

    L.control.locate({
        drawCircle: false,
        keepCurrentZoomLevel: true,
        icon: 'fa fa-map-marker',
        iconLoading: 'fa fa-spinner fa-pulse fa-fw',
        iconElementTag: 'i',
        clickBehavior: {inView: 'stop', outOfView: 'setView', inViewNotFollowing: 'setView'}
    }).addTo(map);

    // terrain controls
    terrainRotation.forEach((color, index) => {
        var buttonIndex = index;
        var buttonState = index;
        var button = L.easyButton({
            id: 'terrain-button',
            states: terrainRotation.map((color, index) => {
                return {
                    stateName: 'terrain' + (index + 1),
                    icon: terrainIcons[index],
                    title: terrainNames[index],
                    onClick: (btn) => {
                        var nextTerrain = (index + 1) % terrainColor.length;
                        btn.state('terrain' + (nextTerrain + 1));
                        terrainRotation[buttonIndex] = nextTerrain;
                        saveLocalStorageData();
                        recolorCells();
                    }
                };
            })
        });
        button.state('terrain' + (terrainRotation[buttonIndex] + 1));

        terrainButtons.push(button);
    });

    // terrain controls
    terrainButtons.push(L.easyButton({
        id: 'terrain-reset',
        states: [{
            icon: 'fa-refresh',
            title: 'Reset to default rotation',
            onClick: () => {
                terrainRotation.forEach((r, i) => {
                    terrainRotation[i] = parseInt(i);
                    terrainButtons[i].state('terrain' + (parseInt(i) + 1));
                });

                /*
                for(var i in terrainRotation) {
                    terrainRotation[i] = parseInt(i);
                    console.log('terrain' + (parseInt(i) + 1));
                    terrainButtons[i].state('terrain' + (parseInt(i) + 1));
                }*/
                saveLocalStorageData();
                recolorCells();
            }
        }]
    }));
    L.easyBar(terrainButtons).addTo(map);

    // version watermark
    L.control.watermark({ position: 'topright' }).addTo(map);

    // map events
    map.on('moveend', mapMove);
    
    if(initLocation.zoom == -1)
        showCurrentLocation();
    else
        map.setZoom(initLocation.zoom);

    window.addEventListener('hashchange', function() {
        const newLocation = L.Permalink.getMapLocation();
        map.setView(newLocation.center, newLocation.zoom, {animate: true});
    });

    timerId = setInterval(recolorCellsInterval, 6000);
}

getLocalStorageData();
mapInit();
