var S2 = require('s2-geometry').S2;
const appName = 'MHNTerrainMap';
const appVersion = '0.9.0';
const terrainList = [
    {   color: '#009933',
        name: 'Forest',
        icon: 'fa-tree' },
    {   color: '#ff9900',
        name: 'Desert',
        icon: 'fa-area-chart' },
    {   color: '#5522ff',
        name: 'Swamp',
        icon: 'fa-tint' },
    /*{   color: '#99ccff',
        name: 'Snow',
        icon: 'fa-snowflake-o' },
    {   color: '#ff3333',
        name: 'Lava',
        icon: 'fa-tint' },*/
];

/* terrain rotation control (same as in-game terrain list order)
    0 - Forest
    1 - Desert
    2 - Swamp

   default rotation array is [0, 1, 2]
   - manipulating array will manipulate actual rotation in the map without
     having to re-order the terrain list above
*/
var terrainRotation = [];
var dataVersion = '1.' + terrainList.length;
terrainList.forEach((item, index) => {
    terrainRotation.push(index);
    window.document.styleSheets[window.document.styleSheets.length - 1]
        .insertRule('#terrain-button.terrain' + (index + 1) + '-active { background-color: ' + terrainList[index].color + '; }');
});

var faceLookup = {};
var visiblePolygons = {};
const initLocation = L.Permalink.getMapLocation(-1, [37.7955742, -122.3958959]);
const defaultZoom = 15;
const map = L.map('map', {
    center: initLocation.center,
    zoom: initLocation.zoom < 0 ? defaultZoom : initLocation.zoom,
    zoomControl: false,
    maxBounds: [[-90,-180], [90,180]],
    noWrap: true
});

L.Permalink.setup(map);
const searchProvider = new GeoSearch.OpenStreetMapProvider();
const terrainCellLevel = 14;
const terrainOpacity = 0.3;
var lastRecolor = new Date(0);
var terrainButtons = [];
var overrideDate = null;
var calendarControl = null;
var timerId = null;

L.Control.Watermark = L.Control.extend({
    onAdd: function(map) {
        var text = L.DomUtil.create('span');
        text.innerHTML = appName + ' v' + appVersion;
        return text;
    },
    onRemove: (map) => {}
});

L.control.watermark = (opts) => {
    return new L.Control.Watermark(opts);
};

L.Control.Calendar = L.Control.extend({
    options: {
        position: 'topleft',
        id: null,
        initialDate: new Date(Date.now()),
        clearUsesInitialDate: false,
        title: '',
        minDate: null,
        maxDate: null,
        onSelectionChange: (selectedDate) => {
        },
        formatDisplay: (selectedDate) => {
            return selectedDate.toISOString().substring(0,10);
        }
    },
    initialize: (options) => {
        L.setOptions(this, options);

        this.updateDisplay = () => {
            if (this._input.value) {
                var selectedDate = new Date(this._input.value);
                selectedDate.setUTCHours(0, 0, 0, 0);
                this._display.innerHTML = this.options.formatDisplay(selectedDate);
                this._display.style.visibility = 'visible';
            } else {
                this._display.innerHTML = '';
                this._display.style.visibility = 'hidden';
            }
        };

        if(this.options.initialDate)
            this.options.initialDate.setUTCHours(0, 0, 0, 0);
        this._container = L.DomUtil.create('div', 'leaflet-control-calendar leaflet-bar');

        // button
        this._a = L.DomUtil.create('a', '', this._container);
        this._a.innerHTML = '<span class="fa fa-calendar"></span>';
        this._a.role = 'button';
        this._a.title = this.options.title;
        this._a['aria-label'] = this.options.title;
        this._a.href = '#';
        this._a.style = 'float:left;display:inline-block';

        // date input
        this._input = L.DomUtil.create('input', '', this._container);
        this._input.type = 'date';
        this._input.style = 'height:0;width:0;padding:0;border:0;display:block;visibility:hidden;float:left;';

        // label
        this._display = L.DomUtil.create('a', '', this._container);
        this._display.style = 'visibility:hidden;display:inline-block;height:30px;width:fit-content;padding-right:5px;padding-bottom:1px;cursor:pointer;';
        this._display.innerHTML = '';
        
        // initial options logic
        if(this.options.initialDate) {
            this._input.value = this.options.initialDate.toISOString().substring(0,10);
            this._display.innerHTML = this.options.formatDisplay(this.options.initialDate);
            this._display.style.visibility = 'visible';
        }
        if(this.options.minDate) {
            this.options.minDate.setUTCHours(0, 0, 0, 0);
            this._input.min = this.options.minDate.toISOString().substring(0,10);
        }
        if(this.options.maxDate) {
            this.options.maxDate.setUTCHours(0, 0, 0, 0);
            this._input.max = this.options.maxDate.toISOString().substring(0,10);
        }
    },
    onAdd: (map) => {
        L.DomEvent.on(this._container, {
            click: (event) => {
                L.DomEvent.stop(event);
                this._input.showPicker();
            }
        });
        L.DomEvent.on(this._container, {
            dblclick: (event) => {
                L.DomEvent.stop(event);
            }
        });
        L.DomEvent.on(this._input, {
            change: (event) => {
                var selectedDate = null;
                if (this._input.value) {
                    var selectedDate = new Date(this._input.value);
                    selectedDate.setUTCHours(0, 0, 0, 0);
                } else if (this.options.clearUsesInitialDate && this.options.initialDate) {
                    this._input.value = this.options.initialDate.toISOString().substring(0,10);
                    selectedDate = this.options.initialDate;
                }
                this.updateDisplay(this);
                this.options.onSelectionChange(selectedDate);
            }
        });
        return this._container;
    },
    reset: () => {
        if (this.options.clearUsesInitialDate && this.options.initialDate) {
            var value = this.options.initialDate;
            if (this.options.minDate > value) {
                value = this.options.minDate;
            } else if (this.options.maxDate < value) {
                value = this.options.maxDate;
            }
            this._input.value = value.toISOString().substring(0,10);
        }
        else
            this._input.value = ''

            this.updateDisplay(this);
    },
    getValue: () => {
        var selectedDate = null;
        if (this._input.value) {
            selectedDate = new Date(this._input.value);
            selectedDate.setUTCHours(0, 0, 0, 0);
        }
        return selectedDate;
    },
    setValue: (value) => {
        if (value) {
            value.setUTCHours(0, 0, 0, 0);
            this._input.value = value.toISOString().substring(0,10);
        } else {
            this._input.value = '';
        }
        this.updateDisplay(this);
    },
    setInitialDate: (value) => {
        if (value) {
            value.setUTCHours(0, 0, 0, 0)
            this.options.initialDate = value;
            this._input.min = value.toISOString().substring(0,10);
        } else {
            this.options.initialDate = null;
            this._input.min = null;
        }
        this.updateDisplay(this);
    },
    setMinimum: (value) => {
        if (value) {
            value.setUTCHours(0, 0, 0, 0)
            if (this._input.value) {
                var selectedDate = new Date(this._input.value);
                selectedDate.setUTCHours(0, 0, 0, 0);

                if(value > selectedDate) {
                    this._input.value = value.toISOString().substring(0,10);
                }
            }
            this.options.minDate = value;
            this._input.min = value.toISOString().substring(0,10);
        } else {
            this.options.minDate = null;
            this._input.min = null;
        }
        this.updateDisplay(this);
    },
    setMaximum: (value) => {
        if (value) {
            value.setUTCHours(0, 0, 0, 0)
            if (this._input.value) {
                var selectedDate = new Date(this._input.value);
                selectedDate.setUTCHours(0, 0, 0, 0);

                if(value < selectedDate) {
                    this._input.value = value.toISOString().substring(0,10);
                }
            }
            this.options.maxDate = value;
            this._input.max = value.toISOString().substring(0,10);
        } else {
            this.options.maxDate = null;
            this._input.max = null;
        }
        this.updateDisplay(this);
    },
    onRemove: (map) => {},
    enable: () => {
        L.DomUtil.addClass(this._container, 'enabled');
        L.DomUtil.removeClass(this._container, 'disabled');
        this._container.setAttribute('aria-hidden', 'false');
        return this;
    },
    disable: () => {
        L.DomUtil.addClass(this._container, 'disabled');
        L.DomUtil.removeClass(this._container, 'enabled');
        this._container.setAttribute('aria-hidden', 'true');
        return this;
    },
});

L.control.calendar = (opts) => {
    return new L.Control.Calendar(opts);
};

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

function s2KeyToId(key) {
    var id = S2.keyToId(key);
    var faceStr = key.split('/')[0];
    var face = parseInt(faceStr);
    faceLookup[id] = face;
    return id;
}

function getCellFromPoint(point) {
    var s2cell = S2.S2Cell.FromLatLng(point, terrainCellLevel);
    var poly = s2CellToPolygon(s2cell);
    var key = s2cell.toHilbertQuadkey();
    var id = s2KeyToId(key);
    return { s2cell: s2cell, polygon: poly, id: id, key: key };
}

function getCellNeighbors(cell) {
    var s2neighbors = cell.s2cell.getNeighbors();
    var neighbors = s2neighbors.map((item) => { return { s2cell: item, polygon: s2CellToPolygon(item), id: s2KeyToId(item.toHilbertQuadkey()), key: item.toHilbertQuadkey() }});

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
    if ((document.visibilityState === "visible" &&
        (((getCurrentUTCDate() - lastRecolor) / (24 * 60 * 60 * 1000)) >= 1) ||
        (getCurrentUTCDate() < calendarControl.getValue()))
    ) {
        calendarControl.setInitialDate(getCurrentUTCDate());
        calendarControl.setMinimum(getCurrentUTCDate());
        recolorCells();
    }
}

function recolorCells() {
    var now = getCurrentUTCDate();
    var selectedDate = calendarControl.getValue();

    if(selectedDate && selectedDate < now) {
        calendarControl.reset();
        calendarControl.setMinimum(getCurrentUTCDate());
        var nextYear = getCurrentUTCDate();
        nextYear.setDate(nextYear.getDate() - 1);
        nextYear.setFullYear(nextYear.getFullYear() + 1);
        calendarControl.setMaximum(nextYear);
    }

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
    var terrainDate = calendarControl.getValue() || getCurrentUTCDate()
    if (i in visiblePolygons) {
        visiblePolygons[i].setStyle({fillOpacity: terrainOpacity, fillColor: getTerrainColor(i, terrainDate)});
    }
}

function getTerrainColor(cellId, terrainDate) {
    var terrainIndex = (s2IdToNumericToken(cellId) // cell token
        + (terrainDate.getTime() / 1000) / (24 * 60 * 60) // number of days since epoch
        + 1 // add 1 to allow our array to match in-game terrain list order
        ) % terrainList.length; // get current position in rotation
    return terrainList[terrainRotation[terrainIndex]].color; // return color of terrain
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
                //console.log(cell.key + ' : ' + s2IdToNumericToken(cell.id) + ' : ' + cell.id);
            });
            cell.polygon.addTo(map);
        });
        recolorCells();
    }
}

function formatDate(date) {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return dayNames[date.getUTCDay()] + ', ' + monthNames[date.getUTCMonth()] + ' ' + date.getUTCDate();
}

function mapInit() {
    // map layers
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    
    // map controls
    var nextYear = getCurrentUTCDate();
    nextYear.setDate(nextYear.getDate() - 1);
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    calendarControl = L.control.calendar({
        position: 'topleft',
        title: 'Select Date to Show',
        initialDate: getCurrentUTCDate(),
        clearUsesInitialDate: true,
        minDate: getCurrentUTCDate(),
        maxDate: nextYear,
        onSelectionChange: (value) => {
            recolorCells();
        },
        formatDisplay: formatDate
    });
    calendarControl.addTo(map);
    
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

    L.control.zoom({
        position: 'topleft'
    }).addTo(map);
    
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
        var button = L.easyButton({
            id: 'terrain-button',
            states: terrainRotation.map((color, index) => {
                return {
                    stateName: 'terrain' + (index + 1),
                    icon: terrainList[index].icon,
                    title: terrainList[index].name,
                    onClick: (btn) => {
                        var nextTerrain = (index + 1) % terrainList.length;
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

    timerId = setInterval(recolorCellsInterval, 60000);
}

getLocalStorageData();
mapInit();
