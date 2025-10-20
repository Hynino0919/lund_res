import './style.css';
import {Map as OlMap, View} from 'ol'; // <--- 已修正命名冲突
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import {fromLonLat} from 'ol/proj';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import {Style, Circle, Fill, Stroke} from 'ol/style';
import Feature from 'ol/Feature';
import Draw, {createBox} from 'ol/interaction/Draw';
import Select from 'ol/interaction/Select';
import {altKeyOnly, never} from 'ol/events/condition';
import Overlay from 'ol/Overlay';

// 1. 常量和样式定义
const lund_lon_lat = [13.1932, 55.7058];
const lund_center = fromLonLat(lund_lon_lat);

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

// **** 新增 ******
// 为新的边界图层定义样式
const boundaryStyle = new Style({
    stroke: new Stroke({
        color: 'rgb(20,20,21)',
        width: 3
    })
});

// 2. 数据源和图层创建
const restaurantsSource = new VectorSource(); // 餐厅图层的数据源
const restaurantsLayer = new VectorLayer({
    source: restaurantsSource,
    style: poiStyle
});

// **** 新增 ******
const boundarySource = new VectorSource(); // 边界图层的数据源
const boundaryLayer = new VectorLayer({
    source: boundarySource,
    style: boundaryStyle
});
const roadStyle = new Style({
    stroke: new Stroke({
        color: 'rgba(128, 128, 128, 0.8)', // 灰色半透明的线
        width: 1.5
    })
});
// 创建道路图层的数据源
const roadSource = new VectorSource();

// 创建道路图层本身
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

// 3. HTML 元素和 Overlay
const container = document.getElementById('popup');
const content = document.getElementById('popup-content');
const closer = document.getElementById('popup-closer');
const clearButton = document.getElementById('clear-selection');
//
const overlay = new Overlay({
    element: container,
    autoPan: true,
    autoPanAnimation: {duration: 250},
});

// 4. 初始化地图
const map = new OlMap({ // <--- 已修正命名冲突
    target: 'map',
    layers: [
        new TileLayer({source: new OSM()}),
        roadLayer,
        boundaryLayer,      // **** 新增 ****** 把边界图层加在餐厅图层下面
        restaurantsLayer,   // 修改了变量名
        drawLayer,
        resultLayer
    ],
    view: new View({center: lund_center, zoom: 13})
});

map.addOverlay(overlay);


// 5. Select 交互 (只用于高亮显示)
const selectInteraction = new Select({
    style: highlightStyle,
    layers: [restaurantsLayer], // 只高亮餐厅
    condition: never
});
map.addInteraction(selectInteraction);
const selectedFeatures = selectInteraction.getFeatures();

// 6. Draw 交互（绘制矩形）
const draw = new Draw({
    source: drawSource,
    type: 'Circle',
    geometryFunction: createBox(),
    condition: altKeyOnly,
});
draw.setActive(false);
map.addInteraction(draw);


// ... (辅助函数部分没有变化，这里省略) ...
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

// 8. 事件监听和主逻辑
function clearSelectionAndResults() {
    selectedFeatures.clear();
    resultSource.clear();
    drawSource.clear();
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
    const drawnPolygon = event.feature.getGeometry(); // drawnPolygon 已经是一个 Geometry 对象
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
            const name = props.name || '未知名称';
            if (isRestaurantOpen(props.open_hours, checkTime)) {
                openNowCount++;
                openRestaurantNames.push(name);
            }
            const type = props.type || '其他';
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
            <p><strong>Average price</strong> ${avgPrice}</p>
            <p><strong>Lowest price range:</strong> ${minPrice.name} (${minPrice.range})</p>
            <p><strong>Highest price range:</strong> ${maxPrice.name} (${maxPrice.range})</p>
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
        content.innerHTML = '<p>未选中任何POI点。</p>';
        const extent = drawnPolygon.getExtent();
        const centerCoordinate = [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2];
        overlay.setPosition(centerCoordinate);
    }
    drawSource.clear();
});
map.on('singleclick', function (evt) {
    const feature = map.forEachFeatureAtPixel(evt.pixel, function (feature, layer) {
        // 判断是否是餐厅点
        if (layer === restaurantsLayer) {
            return feature;
        }
        return null;
    });

    if (feature) {
        const props = feature.getProperties();
        console.log(props)
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
    }
});

// **********************************************
// 9. 数据加载
// **********************************************
function loadRoadsData() {
    // typeName 已更新为您提供的图层名。
    const wfsUrl = '/geoserver-proxy/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=group6:roads_all_wgs84&outputFormat=application/json';

    fetch(wfsUrl)
        .then(response => response.json())
        .then(data => {
            const features = new GeoJSON().readFeatures(data, {
                dataProjection: 'EPSG:4326', // 修正了WGS84对应的投影代码
                featureProjection: 'EPSG:3857',
            });
            roadSource.addFeatures(features);
        })
        .catch(error => {
            console.error("道路数据加载失败：", error);
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
            draw.setActive(true); // 餐厅数据加载成功后，激活绘制工具
        })
        .catch(error => {
            console.error("fail", error);
        });
}

// **** 新增 ******
// 加载边界数据的函数
function loadBoundaryData() {
    // 这就是修正后的正确地址
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


// 页面加载时，同时加载两种数据
loadRestaurantsData();
loadBoundaryData();
loadRoadsData();
