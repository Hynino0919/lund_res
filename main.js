import './style.css';
import {Map, View} from 'ol';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import {fromLonLat} from 'ol/proj';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import {Style, Circle, Fill, Stroke, Text} from 'ol/style';
import Feature from 'ol/Feature';
import Draw, {createBox} from 'ol/interaction/Draw';
import Select from 'ol/interaction/Select';
import {altKeyOnly, never} from 'ol/events/condition';
import Overlay from 'ol/Overlay';
import XYZ from 'ol/source/XYZ';


// 1. 常量和样式定义

// 隆德的中心坐标
const lund_lon_lat = [13.1932, 55.7058];
const lund_center = fromLonLat(lund_lon_lat);

// POI 的普通样式 (红色)
const poiStyle = new Style({
    image: new Circle({
        radius: 7,
        fill: new Fill({color: 'rgba(255, 0, 0, 0.7)'}),
        stroke: new Stroke({color: 'red', width: 2})
    })
});

// POI 的【高亮】样式 (黄色)
const highlightStyle = new Style({
    image: new Circle({
        radius: 9,
        fill: new Fill({color: 'rgba(255, 255, 0, 0.8)'}),
        stroke: new Stroke({color: 'yellow', width: 3})
    }),
});


// 2. 数据源和图层创建
// POI 数据源 (异步加载 GeoJSON)
const vectorSource = new VectorSource({
    format: new GeoJSON({
        defaultDataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857'
    })
});

// POI 图层
const vectorLayer = new VectorLayer({
    source: vectorSource,
    style: poiStyle
});

// 临时绘制图形的图源和图层 (蓝色矩形)
const drawSource = new VectorSource();
const drawLayer = new VectorLayer({
    source: drawSource,
    style: new Style({
        stroke: new Stroke({
            color: 'rgba(0, 0, 255, 0.7)',
            width: 2
        }),
        fill: new Fill({
            color: 'rgba(0, 0, 255, 0.2)'
        })
    })
});

// 结果显示图源和图层 (橙色矩形边框)
const resultSource = new VectorSource();
const resultLayer = new VectorLayer({
    source: resultSource
});


// 3. HTML 元素和 Overlay
const container = document.getElementById('popup');
const content = document.getElementById('popup-content');
const closer = document.getElementById('popup-closer');
const clearButton = document.getElementById('clear-selection');

// 创建 Overlay 实例
const overlay = new Overlay({
    element: container,
    autoPan: true,
    autoPanAnimation: {
        duration: 250,
    },
});

// 5. 初始化地图
const map = new Map({
    target: 'map',
    layers: [
        new TileLayer({
            source: new OSM()
        }),
        vectorLayer,  // POI
        drawLayer,    // 临时绘制
        resultLayer   // 结果矩形
    ],
    view: new View({
        center: lund_center,
        zoom: 13
    })
});

map.addOverlay(overlay); // 将 Overlay 添加到地图

// 6. Select 交互 (只用于高亮显示，不响应点击)
const selectInteraction = new Select({
    style: highlightStyle,
    layers: [vectorLayer],
    condition: never // 永远不响应点击事件
});
map.addInteraction(selectInteraction);
const selectedFeatures = selectInteraction.getFeatures();


// 8. Draw 交互（绘制矩形）
const draw = new Draw({
    source: drawSource,
    type: 'Circle',
    geometryFunction: createBox(),
    condition: altKeyOnly, // 只有按住 Alt 键时才激活
});

draw.setActive(false); // 关键：默认禁用 Draw 交互，等待数据加载
map.addInteraction(draw);


// **********************************************
// 5. 函数定义和事件监听
// **********************************************

// 定义清空函数
function clearSelectionAndResults() {
    selectedFeatures.clear();   // 清空黄色高亮
    resultSource.clear();       // 清空橙色结果矩形
    drawSource.clear();         // 清除蓝色的临时绘制矩形（用于清空未完成的绘制）
    overlay.setPosition(undefined); // 关闭弹窗
}

// 监听清空按钮点击事件
if (clearButton) {
    clearButton.addEventListener('click', clearSelectionAndResults);
}

// 监听 Overlay 关闭按钮事件
closer.onclick = function () {
    overlay.setPosition(undefined);
    closer.blur();
    return false;
};


// 9.5 监听绘制开始事件，清除残留
draw.on('drawstart', function(event) {
    clearSelectionAndResults();
});


// 9. 监听绘制结束事件并执行选择逻辑
draw.on('drawend', function (event) {
    const drawnPolygon = event.feature.getGeometry();

    // 确保在执行选择逻辑前，所有结果都已清除 (Drawstart 已经处理，这里可简化)
    // clearSelectionAndResults(); // Drawstart 已处理，此行可选

    let totalFeatures = 0;
    let totalPrice = 0;

    const allFeatures = vectorSource.getFeatures();

    allFeatures.forEach(feature => {
        const pointGeometry = feature.getGeometry();
        const price = feature.get('price');

        if (drawnPolygon.intersectsCoordinate(pointGeometry.getCoordinates())) {
            selectedFeatures.push(feature);

            if (typeof price === 'number') {
                totalPrice += price;
                totalFeatures += 1;
            }
        }
    });

    // 3. 计算并显示结果
    if (totalFeatures > 0) {
        const avgPrice = (totalPrice / totalFeatures).toFixed(2);
        const extent = drawnPolygon.getExtent();
        const centerCoordinate = [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2];

        // 1. 设置弹窗内容
        content.innerHTML = `
      <h3>矩形选择结果</h3>
      <p>选中点数量: ${totalFeatures} 个</p>
      <p>平均价格: <b>¥${avgPrice}</b></p>
    `;

        // 2. 显示弹窗（Overlay）
        overlay.setPosition(centerCoordinate);

        // 3. 保留橙色结果矩形边框
        const resultStyle = new Style({
            stroke: new Stroke({
                color: 'rgba(255, 165, 0, 1)',
                width: 3
            }),
        });
        const resultFeature = new Feature({ geometry: drawnPolygon.clone() });
        resultFeature.setStyle(resultStyle);
        resultSource.addFeature(resultFeature);

    } else {
        // 未选中任何点，仅显示反馈弹窗
        content.innerHTML = '<p>未选中任何POI点。</p>';
        const extent = drawnPolygon.getExtent();
        const centerCoordinate = [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2];
        overlay.setPosition(centerCoordinate);
    }

    // 清除绘制的临时矩形
    drawSource.clear();
});

function loadGeoServerData() {
    // 使用 Vite 代理地址进行 Fetch 请求
    const wfsUrl = '/geoserver-proxy/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=group6:restaurantsnew&outputFormat=application/json';

    fetch(wfsUrl)
        .then(response => {
            if (!response.ok) {
                // 如果 GeoServer 或代理返回非 200 状态码
                throw new Error(`HTTP 错误: ${response.status} ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            // 检查数据是否是 FeatureCollection，防止解析非 GeoJSON 的内容
            if (data && data.type === "FeatureCollection") {
                // 使用 GeoJSON 格式化器解析数据
                const features = new GeoJSON().readFeatures(data, {
                    dataProjection: 'EPSG:4326',
                    featureProjection: 'EPSG:3857',
                });

                // 将要素添加到 source
                vectorSource.addFeatures(features);

                // 启用绘制 (相当于 featuresloadend)
                draw.setActive(true);
            } else {
                throw new Error("GeoServer返回的数据不是有效的 GeoJSON FeatureCollection。");
            }
        })
        .catch(error => {
            // 处理加载或解析错误，并禁用绘制
            draw.setActive(false);
            alert(`GeoServer 数据加载失败，请检查控制台。错误: ${error.message}`);
            console.error("GeoServer 数据加载或解析失败：", error);
        });
}
loadGeoServerData();
