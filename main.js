import './style.css';
import {Map as OlMap, View} from 'ol';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import {fromLonLat, toLonLat} from 'ol/proj';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import {Style, Circle, Fill, Stroke} from 'ol/style';
import Feature from 'ol/Feature';
import Draw, {createBox} from 'ol/interaction/Draw';
import Select from 'ol/interaction/Select';
import {altKeyOnly, never} from 'ol/events/condition';
import Overlay from 'ol/Overlay';
import Point from 'ol/geom/Point';
import {Feature as OlFeature} from 'ol';

// 1. constant variable and style
const lund_lon_lat = [13.1932, 55.7058];
const lund_center = fromLonLat(lund_lon_lat);
const ORIGIN_LONLAT = [13.20072, 55.70886];
const AUTO_FIT_ROUTE = false;

const poiStyle = new Style({
    image: new Circle({
        radius: 3,
        fill: new Fill({color: 'rgba(255, 0, 0, 0.7)'}),
        stroke: new Stroke({color: 'red', width: 2})
    })
});
const highlightStyle = new Style({
    image: new Circle({
        radius: 4,
        fill: new Fill({color: 'rgba(255, 255, 0, 0.8)'}),
        stroke: new Stroke({color: 'yellow', width: 3})
    }),
});

const boundaryStyle = new Style({
    stroke: new Stroke({
        color: 'rgb(20,20,21)',
        width: 3
    })
});

const roadStyle = new Style({
    stroke: new Stroke({
        color: 'rgba(128, 128, 128, 0.8)', // 灰色半透明的线
        width: 1.5
    })
});

const routeLineStyle = new Style({
    stroke: new Stroke({ color: '#1168ff', width: 6 })
});

// 2. data source and create layer
const restaurantsSource = new VectorSource();
const restaurantsLayer = new VectorLayer({
    source: restaurantsSource,
    style: poiStyle
});

const boundarySource = new VectorSource(); // 边界图层的数据源
const boundaryLayer = new VectorLayer({
    source: boundarySource,
    style: boundaryStyle
});

const roadSource = new VectorSource();
const roadLayer = new VectorLayer({
    source: roadSource,
    style: roadStyle
});

const drawSource = new VectorSource();
const drawLayer = new VectorLayer({
    source: drawSource,
    style: new Style({
        stroke: new Stroke({color: 'rgba(0, 0, 255, 0.7)', width: 2}),
        fill: new Fill({color: 'rgba(0, 0, 255, 0.2)'})
    })
});

const resultSource = new VectorSource();
const resultLayer = new VectorLayer({
    source: resultSource
});

const originSource = new VectorSource();
const originLayer = new VectorLayer({
    source: originSource,
    style: new Style({
        image: new Circle({
            radius: 6,
            fill: new Fill({color: 'white'}),
            stroke: new Stroke({color: '#000', width: 2})
        })
    })
});

originSource.addFeature(new OlFeature({
    geometry: new Point(fromLonLat(ORIGIN_LONLAT)),
    name: 'GIS Centre'
}));

const routeSource = new VectorSource();
const routeLayer = new VectorLayer({
    source: routeSource,
    style: routeLineStyle
});

// 3. HTML and Overlay
const container = document.getElementById('popup');
const content = document.getElementById('popup-content');
const closer = document.getElementById('popup-closer');
const clearButton = document.getElementById('clear-selection');
const overlay = new Overlay({
    element: container,
    autoPan: false,
    autoPanAnimation: {duration: 250},
});

// 4. init map
const map = new OlMap({
    target: 'map',
    layers: [
        new TileLayer({source: new OSM()}),
        roadLayer,
        boundaryLayer,
        restaurantsLayer,
        drawLayer,
        resultLayer,
        originLayer,
        routeLayer
    ],
    view: new View({center: lund_center, zoom: 13})
});

map.addOverlay(overlay);

// 5. Select
const selectInteraction = new Select({
    style: highlightStyle,
    layers: [restaurantsLayer],
    condition: never
});
map.addInteraction(selectInteraction);
const selectedFeatures = selectInteraction.getFeatures();

// 6. Draw
const draw = new Draw({
    source: drawSource,
    type: 'Circle',
    geometryFunction: createBox(),
    condition: altKeyOnly,
});
draw.setActive(false);
map.addInteraction(draw);


// 7. spatial calculation functions
function parsePriceRange(rangeStr) {
    if (typeof rangeStr !== 'string' || !rangeStr.includes('-')) return null;
    const parts = rangeStr.split('-').map(Number);
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
    return {
        min: parts[0],
        max: parts[1],
        avg: (parts[0] + parts[1]) / 2
    };
}

function isRestaurantOpen(openHoursStr, checkTime) {
    if (typeof openHoursStr !== 'string') return false;
    const dayMap = { 'Su': 0, 'Mo': 1, 'Tu': 2, 'We': 3, 'Th': 4, 'Fr': 5, 'Sa': 6 };
    const checkDay = checkTime.getDay();
    const checkMinutes = checkTime.getHours() * 60 + checkTime.getMinutes();
    const rules = openHoursStr.split(';').map(s => s.trim());
    for (const rule of rules) {
        const parts = rule.split(' ');
        if (parts.length < 2) continue;
        const dayPart = parts[0];
        const timePart = parts.slice(1).join(' ');
        let dayMatch = false;
        if (dayPart.includes('-')) {
            const [startDayStr, endDayStr] = dayPart.split('-');
            const startDay = dayMap[startDayStr];
            const endDay = dayMap[endDayStr];
            if (startDay !== undefined && endDay !== undefined && checkDay >= startDay && checkDay <= endDay) {
                dayMatch = true;
            }
        } else {
            if (dayMap[dayPart] === checkDay) {
                dayMatch = true;
            }
        }
        if (!dayMatch) continue;
        const timeRanges = timePart.split(',').map(s => s.trim());
        for (const timeRange of timeRanges) {
            if (!timeRange.includes('-')) continue;
            const [startTimeStr, endTimeStr] = timeRange.split('-');
            const [startH, startM] = startTimeStr.split(':').map(Number);
            const [endH, endM] = endTimeStr.split(':').map(Number);
            if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) continue;
            const startMinutes = startH * 60 + startM;
            let endMinutes = endH * 60 + endM;
            if (endMinutes < startMinutes) {
                endMinutes += 24 * 60;
            }
            if (checkMinutes >= startMinutes && checkMinutes < endMinutes) {
                return true;
            }
        }
    }
    return false;
}

// 8. listen
function clearSelectionAndResults() {
    selectedFeatures.clear();
    resultSource.clear();
    drawSource.clear();
    routeSource.clear();
    overlay.setPosition(undefined);
}

if (clearButton) {
    clearButton.addEventListener('click', clearSelectionAndResults);
}

closer.onclick = function () {
    overlay.setPosition(undefined);
    closer.blur();
    return false;
};

draw.on('drawstart', clearSelectionAndResults);
draw.on('drawend', function (event) {
    const drawnPolygon = event.feature.getGeometry();
    const allFeatures = restaurantsSource.getFeatures();
    const selected = [];
    allFeatures.forEach(feature => {
        if (drawnPolygon.intersectsCoordinate(feature.getGeometry().getCoordinates())) {
            selected.push(feature);
            selectedFeatures.push(feature);
        }
    });

    if (selected.length > 0) {
        let openNowCount = 0;
        const openRestaurantNames = [];
        const cuisineMap = new Map();
        let totalPriceSum = 0;
        let validPriceCount = 0;
        let minPrice = { value: Infinity, name: '', range: 'N/A' };
        let maxPrice = { value: -Infinity, name: '', range: 'N/A' };
        let minRating = { value: Infinity, name: '' };
        let maxRating = { value: -Infinity, name: '' };

        const checkTime = new Date();

        selected.forEach(feature => {
            const props = feature.getProperties();
            const name = props.name || 'NA';
            if (isRestaurantOpen(props.open_hours, checkTime)) {
                openNowCount++;
                openRestaurantNames.push(name);
            }
            const type = props.type || 'Other';
            if (!cuisineMap.has(type)) {
                cuisineMap.set(type, []);
            }
            cuisineMap.get(type).push(name);
            const priceInfo = parsePriceRange(props.price_rang);
            if (priceInfo) {
                totalPriceSum += priceInfo.avg;
                validPriceCount++;
                if (priceInfo.min < minPrice.value) {
                    minPrice = { value: priceInfo.min, name: name, range: props.price_rang };
                }
                if (priceInfo.max > maxPrice.value) {
                    maxPrice = { value: priceInfo.max, name: name, range: props.price_rang };
                }
            }
            const rating = parseFloat(props.rating);
            if (!isNaN(rating)) {
                if (rating < minRating.value) {
                    minRating = { value: rating, name: name };
                }
                if (rating > maxRating.value) {
                    maxRating = { value: rating, name: name };
                }
            }
        });

        const avgPrice = validPriceCount > 0 ? (totalPriceSum / validPriceCount).toFixed(2) : 'N/A';
        let cuisineHtml = '';
        cuisineMap.forEach((names, type) => {
            cuisineHtml += `<li><b>${type}</b>: ${names.join(', ')}</li>`;
        });
        const openNamesHtml = openRestaurantNames.length > 0 ? `<br><small style="color: #555;">(${openRestaurantNames.join(', ')})</small>` : '';

        content.innerHTML = `
            <h3>Selection Results</h3>
            <h4>Time now: ${checkTime.toLocaleString()}</h4>
            <p><strong>Selected restaurants:</strong> ${selected.length}</p>
            <p><strong>Open now:</strong> ${openNowCount} ${openNamesHtml}</p>
            <hr>
            <p><strong>Cuisine summary:</strong></p>
            <ul>${cuisineHtml || '<li>No data</li>'}</ul>
            <hr>
            <p><strong>Average price:</strong> ${avgPrice} kr</p>
            <p><strong>Lowest price range:</strong> ${minPrice.name} (${minPrice.range}) kr</p>
            <p><strong>Highest price range:</strong> ${maxPrice.name} (${maxPrice.range}) kr</p>
            <hr>
            <p><strong>Lowest rating:</strong> ${minRating.name} (${minRating.value})</p>
            <p><strong>Highest rating:</strong> ${maxRating.name} (${maxRating.value})</p>
        `;

        const extent = drawnPolygon.getExtent();
        const centerCoordinate = [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2];
        overlay.setPosition(centerCoordinate);

        const resultStyle = new Style({
            stroke: new Stroke({ color: 'rgba(255, 165, 0, 1)', width: 3 }),
        });
        const resultFeature = new Feature({ geometry: drawnPolygon.clone() });
        resultFeature.setStyle(resultStyle);
        resultSource.addFeature(resultFeature);

    } else {
        content.innerHTML = '<p>No POI selected。</p>';
        const extent = drawnPolygon.getExtent();
        const centerCoordinate = [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2];
        overlay.setPosition(centerCoordinate);
    }
    drawSource.clear();
});

async function fetchRouteFoot(lon1, lat1, lon2, lat2) {
    const url =
        `https://router.project-osrm.org/route/v1/foot/${lon1},${lat1};${lon2},${lat2}` +
        `?overview=full&geometries=geojson&alternatives=true&steps=false` +
        `&radiuses=150;150`;

    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No route');

    let best = data.routes[0];
    for (const r of data.routes) if (r.distance < best.distance) best = r;
    return best;
}

map.on('singleclick', async function (evt) {
    const feature = map.forEachFeatureAtPixel(evt.pixel, function (feature, layer) {
        if (layer === restaurantsLayer) {
            return feature;
        }
        return null;
    });
    if (feature) {
        const props = feature.getProperties();
        const name = props.name || 'N/A';
        const openHours = props.open_hours || 'N/A';
        const rating = props.rating || 'N/A';
        const price = props.price_rang || 'N/A';
        const type = props.type || 'N/A';
        content.innerHTML = `
      <h3>${name}</h3>
      <p><strong>Type:</strong>${type}</p>
      <p><strong>Opening hours:</strong> ${openHours}</p>
      <p><strong>Rating:</strong> ${rating}</p>
      <p><strong>Price:</strong> ${price}</p>
    `;
        overlay.setPosition(evt.coordinate);
        try {
            const dest3857 = feature.getGeometry().getCoordinates();
            const [dlon, dlat] = toLonLat(dest3857);     // → [lon, lat]
            const [olon, olat] = ORIGIN_LONLAT;

            const route = await fetchRouteFoot(olon, olat, dlon, dlat);

            routeSource.clear();
            const routeFeat = new GeoJSON().readFeature(route.geometry, {
                dataProjection: 'EPSG:4326',
                featureProjection: 'EPSG:3857'
            });
            routeFeat.set('distance_km', (route.distance / 1000).toFixed(2));
            routeFeat.set('duration_min', Math.round(route.duration / 60));
            routeSource.addFeature(routeFeat);
            if (AUTO_FIT_ROUTE) {
                map.getView().fit(routeSource.getExtent(), { padding: [40, 40, 40, 40], maxZoom: 17 });
            }
        } catch (e) {
            console.error(e);
            alert('Routing failed. Try again later.');
        }
    }
});

// 9. load data
function loadRoadsData() {
    const wfsUrl = '/geoserver-proxy/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=group6:roads_all_wgs84&outputFormat=application/json';

    fetch(wfsUrl)
        .then(response => response.json())
        .then(data => {
            const features = new GeoJSON().readFeatures(data, {
                dataProjection: 'EPSG:4326',
                featureProjection: 'EPSG:3857',
            });
            roadSource.addFeatures(features);
        })
        .catch(error => {
            console.error("error", error);
        });
}

function loadRestaurantsData() {
    const wfsUrl = '/geoserver-proxy/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=group6:restaurantsnew&outputFormat=application/json';

    fetch(wfsUrl)
        .then(response => response.json())
        .then(data => {
            const features = new GeoJSON().readFeatures(data, {
                dataProjection: 'EPSG:4326',
                featureProjection: 'EPSG:3857',
            });
            restaurantsSource.addFeatures(features);
            draw.setActive(true);
        })
        .catch(error => {
            console.error("fail", error);
        });
}

function loadBoundaryData() {
    const wfsUrl = '/geoserver-proxy/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=group6:export&outputFormat=application/json';

    fetch(wfsUrl)
        .then(response => response.json())
        .then(data => {
            const features = new GeoJSON().readFeatures(data, {
                dataProjection: 'EPSG:4326',
                featureProjection: 'EPSG:3857',
            });
            boundarySource.addFeatures(features);
        })
        .catch(error => {
            console.error("fail", error);
        });
}

loadRestaurantsData();
loadBoundaryData();
loadRoadsData();
