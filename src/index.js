var S2 = require('s2-geometry').S2;
const appName = 'MHNTerrainTool';
const appVersion = '0.8.2';
const colorOrder = ['#009933', '#ff9900', '#5500ff'];
var visiblePolygons = {};
const map = L.map('map').setView([0, 0], 13);
const searchProvider = new GeoSearch.OpenStreetMapProvider();
const terrainCellLevel = 14;
const terrainOpacity = 0.2;

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
/*
function s2IdToNumericToken(cellId) {
    return s2TokenToInt(s2IdToToken(cellId));
}

function s2IdToToken(cellId) {
    return cellId.toString(16).replace(/0+$/, '');
}

function s2TokenToInt(token) {
    return parseInt(token, 16);
}
*/
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
        navigator.geolocation.getCurrentPosition(moveMapView);
    }
}

function moveMapView(position) {
    if (map) {
        map.setView([position.coords.latitude, position.coords.longitude], 15);
    }
}

function clearCells() {
    for(i in visiblePolygons) {
        map.removeLayer(visiblePolygons[i]);
        delete visiblePolygons[i];
    }
}

function recolorCellsInterval() {
    if (document.visibilityState === "visible") recolorCells();
}

function recolorCells() {
    for (i in visiblePolygons) {
        recolorCell(i);
    }
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
    var dayCount = ((getCurrentUTCDate().getTime() / 1000) / (24 * 60 * 60) + 1) % colorOrder.length;
    var seedIndex = i % colorOrder.length;
    var colorIndex = (seedIndex + dayCount) % colorOrder.length;

    return colorOrder[colorIndex];
}

function mapMove() {
    bounds = map.getBounds();
    clearCells();

    if (map.getZoom() >= 12) {
        const cells = s2GetVisibleCells(bounds);

        var tmp = s2GetVisibleCells(bounds);

        cells.forEach((cell) => {
            visiblePolygons[cell.id] = cell.polygon;
            cell.polygon.addTo(map);
            recolorCell(cell.id);
        });
    }
}

function mapInit() {
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

    // version watermark
    L.control.watermark({ position: 'topright' }).addTo(map);

    // map events
    map.on('moveend', mapMove);
    
    showCurrentLocation();
    timerId = setInterval(recolorCellsInterval, 60000);
}

mapInit();
