var S2 = require('s2-geometry').S2;
const appName = 'MHNTerrainMap';
const appVersion = '0.9.4';
const terrainList = [
    {   color: '#009933',
        opacity: 0.3,
        name: 'Forest',
        icon: 'fa-tree' },
    {   color: '#ff9900',
        opacity: 0.15,
        name: 'Desert',
        icon: 'fa-area-chart' },
    {   color: '#5522ff',
        opacity: 0.2,
        name: 'Swamp',
        icon: 'fa-tint' },
    /*
    {   color: '#77bbff',
        opacity: 0.3,
        name: 'Snow',
        icon: 'fa-snowflake-o' },
    {   color: '#ff3333',
        opacity: 0.3,
        name: 'Lava',
        icon: 'fa-tint' },
    */
];

/* terrain rotation control (same as in-game terrain list order)
    0 - Forest
    1 - Desert
    2 - Swamp

   default rotation array is [0, 1, 2]
   - manipulating array will manipulate actual rotation in the map without
     having to re-order the terrain list above
*/

const poiType = [
    {
        name: 'Invisible POIs',
        icon: 'fa fa-block fa-circle', // dot,
        buttonIcon: 'fa fa-circle',
        iconSize: [12,12],
        visibility: false
    },
    {
        name: 'Permanent Gathering Points',
        icon: 'fa fa-block fa-square fa-2x rotate-by-45', // Square diamond
        buttonIcon: 'fa fa-square rotate-by-45',
        iconSize: [24,24],
        visibility: true
    },
];

var terrainRotation = [];
var dataVersion = '1.' + terrainList.length;
terrainList.forEach((item, index) => {
    terrainRotation.push(index);
    window.document.styleSheets[window.document.styleSheets.length - 1]
        .insertRule('#terrain-button.terrain' + (index + 1) + '-active { background-color: ' + terrainList[index].color + '; }');
});

var poiDB = new Dexie("MHNPOIDatabase");
poiDB.version(2).stores({
    pois: "[lat+lng],type,parentCellId"
});

var faceLookup = {};
var visiblePolygons = {};
var visiblePOIs = [];
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
var lastRecolor = new Date(0);
var terrainButtons = [];
var calendarControl = null;

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
    redrawPOIs();
}

function getCurrentUTCDate() {
    var today = new Date(Date.now());
    today.setUTCHours(0, 0, 0, 0);
    return today;
}

function recolorCell(i) {
    if (i in visiblePolygons) {
        var terrain = getTerrain(i);
        visiblePolygons[i].setStyle({fillOpacity: terrain.opacity, fillColor: terrain.color});
    }
}

function getTerrainIndex(cellId) {
    var terrainDate = calendarControl.getValue() || getCurrentUTCDate();
    var terrainIndex = (s2IdToNumericToken(cellId) // cell token
        + (terrainDate.getTime() / 1000) / (24 * 60 * 60) // number of days since epoch
        + 1 // add 1 to allow our array to match in-game terrain list order
        ) % terrainList.length; // get current position in rotation
    return terrainIndex;
}

function getTerrain(cellId) {
    return terrainList[terrainRotation[getTerrainIndex(cellId)]]; // terrain definition
}

function getLocalStorageData() {
    if (localStorage.dataVersion === dataVersion) {
        terrainRotation = JSON.parse(localStorage.terrainRotation);
        if (localStorage.poiVisibility) {
            var poiVisibility = JSON.parse(localStorage.poiVisibility);
            poiVisibility.forEach((v,i) => {
                poiType[i].visibility = v;
            });
        }
    } else {
        saveLocalStorageData();
    }
}

function saveLocalStorageData() {
    localStorage.dataVersion = dataVersion;
    localStorage.terrainRotation = JSON.stringify(terrainRotation);
    var poiVisibility = [];
    poiVisibility = poiType.map(t => t.visibility);
    localStorage.poiVisibility = JSON.stringify(poiVisibility);
}

function mapMove() {
    var bounds = map.getBounds();
    clearCells();

    if (map.getZoom() >= 14) {
        const cells = s2GetVisibleCells(bounds);
        cells.forEach((cell) => {
            visiblePolygons[cell.id] = cell.polygon;

            cell.polygon.on('click', e => {
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

function redrawPOIs() {
    clearInvisiblePOIs();
    if (map.getZoom() >= 15) {
        poiDB.pois.where('parentCellId').anyOf(Object.keys(visiblePolygons))
        .and(p => poiType[p.type].visibility)
        .toArray().then((result) => {
            result.forEach((poi) => {
                drawPOI(poi);
            });
        });
    }
}

function drawPOI(poi) {
    if (poiType[poi.type].visibility 
        && !visiblePOIs.some(v => { v.poi.lat == poi.lat && v.poi.lng == poi.lng && v.poi.name == poi.name })
    ) {
        var parentPolygon = visiblePolygons[poi.parentCellId];
        if (parentPolygon) {
            var marker = L.marker([poi.lat, poi.lng],
                {
                    icon: L.divIcon({ 
                        className: '',
                        html: '<div class="' + poiType[poi.type].icon + '" style="color: ' + getTerrain(poi.parentCellId).color + ';"></div>',
                        iconSize: poiType[poi.type].iconSize
                    }),
                    riseOnHover: true,
                    autoPanOnFocus: false,
                    title: poi.name,
                    bubblingMouseEvents: false
                });
            visiblePOIs.push({
                poi: poi,
                marker: marker
            });
            marker.addTo(map);
            marker.bindPopup(poi.name + '<br><img src="' + poi.img + '" width=192 height=256 />');
            /*marker.on('click', e => {
                var currentPOI = poi;
                console.log(currentPOI);
                console.log(marker);
            });*/
            marker.on('contextmenu', e => {
                var currentPOI = poi;
                currentPOI.type = currentPOI.type > 0 ? 0 : 1; // toggle poi type
                poiDB.pois.put(poi).then(() => {
                    marker.setIcon(L.divIcon({ 
                        className: '',
                        html: '<div class="' + poiType[poi.type].icon + '" style="color: ' + getTerrain(poi.parentCellId).color + ';"></div>',
                        iconSize: poiType[poi.type].iconSize
                    }));
                }).catch(e => {
                    alert("Error changing POI type: " + (e.stack || e));
                    console.error("Error changing POI type: " + (e.stack || e));
                });
            });
        }
    }
}

function clearAllPOIs() {
    for(i in visiblePOIs) {
        map.removeLayer(visiblePOIs[i].marker);
    }
    visiblePOIs = [];
}

function clearInvisiblePOIs() {
    visiblePOIs.forEach((p, i) => {
        var poi = p.poi;
        var marker = p.marker;
        if(!poiType[poi.type].visibility || !Object.keys(visiblePolygons).includes(poi.parentCellId)) {
            delete visiblePOIs[i];
            map.removeLayer(marker);
        }
    });
}

function formatDate(date) {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return dayNames[date.getUTCDay()] + ', ' + monthNames[date.getUTCMonth()] + ' ' + date.getUTCDate();
}

function mapInit() {
    var portalUpload = L.DomUtil.get('portalUpload');
    L.DomEvent.on(portalUpload, 'change', (e) => {
        const file = e.target.files[0];
        var reader = new FileReader();
        reader.addEventListener(
            'load',
            () => {
                var result = Papa.parse(reader.result, {
                    header: true,
                    skipEmptyLines: true,
                    transformHeader: (h) => { return h.trim().toLowerCase(); }
                });

                if (result.errors.length > 1 && result.errors.find(e => e.code == "InvalidQuotes")) {
                    var testResult = Papa.parse(reader.result, {
                        header: true,
                        skipEmptyLines: true,
                        quoteChar: '"',
                        escapeChar: '\\',
                        transformHeader: (h) => { return h.trim().toLowerCase(); }
                    });
                    if (testResult.errors.length == 0 || !testResult.errors.find(e => e.code == "InvalidQuotes")) {
                        result = testResult;
                    } else if (testResult.errors.length < result.errors.length) {
                        result = testResult;
                    }
                }

                var hasType = result.meta.fields.includes("type");
                if (result.errors.length > 0)
                    console.log(result);
                if (result.errors.length == 0 || confirm("Errors were found with the file's formatting. Continue importing readable POIs?")) {
                    var newPOIs = result.data.map((val) => {
                        var obj = {
                            lat: parseFloat(val.latitude),
                            lng: parseFloat(val.longitude),
                        };

                        if (hasType && !isNaN(parseInt(val.type))) obj.type = parseInt(val.type) ?? 0;
                        if (val.name) obj.name = val.name;
                        if (val.image) obj.img = val.image;
                        return obj;
                    });
                    var dataErrors = newPOIs.filter((val) => { return isNaN(val.lat) || isNaN(val.lng) || (hasType && val.type && isNaN(val.type)); }).length;

                    if (dataErrors == 0 || confirm("Invalid values were found for certain fields. Continue importing valid data?")) {
                        newPOIs = newPOIs.filter((val) => { return !isNaN(val.lat) && !isNaN(val.lng); });
                        //poiDB.pois.bulkGet(newPOIs.map(val => {return [val.lat, val.lng];})).then(result => {
                        poiDB.pois.toArray().then(result => {
                            result.forEach(r => { 
                                var p = newPOIs.find(p => { return p.lat == r.lat && p.lng == r.lng; });
                                if (p) {
                                    if (!p.name) p.name = r.name ?? '';
                                    if (!p.img) p.img = r.img ?? '';
                                    if (isNaN(p.type)) p.type = r.type ?? 0;
                                }
                            });
                            newPOIs.forEach(p => {
                                if(!p.name) p.name = '';
                                if(!p.img) p.img = '';
                                if(!p.type) p.type = 0;
                                p.parentCellId = getCellFromPoint({ lat: p.lat, lng: p.lng}).id;
                            });
                            poiDB.transaction("rw", poiDB.pois, async () => {
                                await poiDB.pois.bulkPut(newPOIs);
                            }).then(() => {
                                clearAllPOIs();
                                redrawPOIs();
                            }).catch(e => {
                                alert("Error saving POIs: " + (e.stack || e));
                                console.error("Error saving POIs: " + (e.stack || e));
                            })
                        }).catch(e => {
                            alert("Error querying existing POIs: " + (e.stack || e));
                            console.error("Error querying existing POIs: " + (e.stack || e));
                        });    
                    }
                }
            },
            false
        );
        reader.readAsText(file);
        portalUpload.value = '';
    });
    
    // map layers
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    /*map.on('contextmenu', (event) => {
        console.log(event.latlng);
    });*/

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

    // POI controls
    var poiButtons = [];
    poiType.forEach((type, index) => {
        var typeBtn = L.easyButton({
            id: `poi-visibility-button`,
            states: [{
                stateName: `type${index}show`,
                icon: `${type.buttonIcon} poi-hidden`,
                title: "Show " + type.name,
                onClick: function(btn, map) {
                    poiType[index].visibility = true;
                    btn.state(`type${index}hide`);
                    saveLocalStorageData();
                    redrawPOIs();
                }
            },
            {
                stateName: `type${index}hide`,
                icon: `${type.buttonIcon} poi-visible`,
                title: "Hide " + type.name,
                onClick: function(btn, map) {
                    poiType[index].visibility = false;
                    btn.state(`type${index}show`);
                    saveLocalStorageData();
                    redrawPOIs();
                }
            }]
        });
        typeBtn.state(`type${index}${type.visibility ? 'hide' : 'show'}`)
        poiButtons.push(typeBtn);
    });

    poiButtons.push(
        L.easyButton({
            id: 'export-button',
            states: [{
                icon: 'fa-download',
                title: 'Export POI Data',
                onClick: function(btn, map){
                    //const exportFileName = appName + '-' + appVersion + '-POI-' + '.json';
                    const now = new Date();
                    const exportFileName = `${ appName }-${ appVersion }-POI-${ now.getFullYear() }${ now.getMonth() > 8 ? '' : '0' }${ now.getMonth()+1}${now.getDate() > 9 ? '' : '0' }${ now.getDate() }${ now.getTime() }.csv`;
                    poiDB.pois.toArray().then((result) => {
                        const exportPOIs = result.map((poi) => {
                            return {
                                name: poi.name,
                                latitude: poi.lat,
                                longitude: poi.lng,
                                image: poi.img,
                                type: poi.type
                            }
                        })
                        var columnList = ['name','latitude','longitude','type','image'];
                        var serializedData = Papa.unparse(exportPOIs, {
                            header: true,
                            skipEmptyLines: 'greedy',
                            columns: ['name','latitude','longitude','type','image']
                        }) || columnList.join(',');

                        var file = new Blob([serializedData], {type: 'text/csv'});
                        var a = document.createElement('a');
                        a.href = URL.createObjectURL(file);
                        a.download = exportFileName;
                        a.click();
                    });
                }
            }]
        }),
        L.easyButton({
            id: 'import-button',
            states: [{
                icon: 'fa-upload',
                title: 'Import POI Data',
                onClick: function(btn, map) {
                    portalUpload.click();
                }
            }]
        }),
        L.easyButton({
            id: 'clear-data-button',
            states: [{
                icon: 'fa-trash',
                title: 'Clear POI Data',
                onClick: function(btn, map){
                    if (confirm('This will clear all points of interest. Are you sure you want to do this?')) {
                        poiDB.pois.toArray().then((result) => {
                            poiDB.pois.bulkDelete(result.map(r => { return [r.lat, r.lng]} )).then(() => {
                                redrawPOIs();
                            }).catch(e => {
                                alert("Error clearing POIs: " + (e.stack || e));
                            });
                        });

                        /*poiDB.pois.clear().then(() => {
                            redrawPOIs();
                        }).catch(e => {
                            alert("Error clearing POIs: " + (e.stack || e));
                        });*/
                    }
                }
            }]
        })
    );
    L.easyBar(poiButtons).addTo(map);

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
