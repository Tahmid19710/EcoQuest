import L from "leaflet";
import "leaflet/dist/leaflet.css";

import {
    getHealth,
    getAllUpazilas,
    getFloodGeoJSON,
    getThresholds,
    getModelInfo,
    getModelFeatureImportance
} from "./ml-risk.js";

const COLORS = {
    "Low": "#27ae60",
    "Moderate": "#f1c40f",
    "High": "#e67e22",
    "Very High": "#e74c3c"
};

let overlay = null;
let map = null;
let geoLayer = null;
let selectedLayer = null;

let allRecords = [];
let thresholds = null;
let cachedGeoJSON = null;
let dataPromise = null;
let isOpen = false;
let previousOverflow = "";
let selectionHandler = null;
let modelInfo = null;
let featureImportance = null;

function $(id) {
    return overlay?.querySelector(`#${id}`);
}

export function setMLMapSelectionHandler(handler) {
    selectionHandler =
        typeof handler === "function" ? handler : null;
}

function category(score) {
    if (score <= thresholds.Low_Max) return "Low";
    if (score <= thresholds.Moderate_Max) return "Moderate";
    if (score <= thresholds.High_Max) return "High";
    return "Very High";
}

function percentage(value) {
    return Number(value ?? 0).toFixed(2) + "%";
}

function createLayout() {
    if (overlay) return;

    overlay = document.createElement("div");
    overlay.id = "ecoquest-ml-overlay";

    overlay.innerHTML = `
        <header class="ml-header">
            <div>
                <h2>EcoQuest Flood Intelligence</h2>
                <p>Sylhet Division | XGBoost Susceptibility Analysis</p>
            </div>
            <button id="ml-close" type="button">Close Map ✕</button>
        </header>

        <div class="ml-toolbar">
            <select id="ml-district">
                <option value="">All Districts</option>
            </select>
            <select id="ml-upazila">
                <option value="">Select Upazila</option>
            </select>
            <button id="ml-reset" type="button">Reset Map</button>
            <span id="ml-status">Connecting to ML backend...</span>
        </div>

        <main class="ml-main">
            <div id="ml-map"></div>
            <aside id="ml-details">
                <h3>Flood Susceptibility</h3>
                <p>Select an Upazila to inspect its ML statistics.</p>
            </aside>
        </main>

        <div class="ml-legend">
            <span><i style="background:#27ae60"></i>Low</span>
            <span><i style="background:#f1c40f"></i>Moderate</span>
            <span><i style="background:#e67e22"></i>High</span>
            <span><i style="background:#e74c3c"></i>Very High</span>
        </div>

        <footer class="ml-footer">
            Susceptibility map uses precomputed geographic analysis.
            Binary XGBoost inference is a separate feature-input endpoint;
            neither is a real-time flood forecast.
        </footer>
    `;

    const style = document.createElement("style");
    style.id = "ecoquest-ml-overlay-style";

    style.textContent = `
        #ecoquest-ml-overlay {
            position:fixed; inset:0; z-index:10000; display:none;
            flex-direction:column; background:#0b1714; color:#eef7ef;
            font-family:Arial,sans-serif;
        }
        #ecoquest-ml-overlay * { box-sizing:border-box; }
        .ml-header {
            display:flex; justify-content:space-between; align-items:center;
            gap:15px; padding:14px 22px; background:#173b2a;
        }
        .ml-header h2 { margin:0; font-size:21px; }
        .ml-header p { margin:5px 0 0; font-size:12px; color:#b6d1c0; }
        .ml-header button,.ml-toolbar button {
            border:0; border-radius:7px; padding:10px 14px;
            background:#2f8051; color:white; cursor:pointer; font-weight:bold;
        }
        .ml-header button:hover,.ml-toolbar button:hover { background:#439d65; }
        .ml-toolbar {
            display:flex; align-items:center; flex-wrap:wrap; gap:10px;
            padding:12px 18px; background:#112c21;
        }
        .ml-toolbar select {
            padding:10px; border:1px solid #417457; background:#1c422e;
            color:white; border-radius:7px; min-width:160px;
        }
        #ml-status { font-size:12px; color:#c5d9cc; }
        .ml-main {
            display:grid; grid-template-columns:minmax(0,1fr) 340px;
            flex:1; min-height:0;
        }
        #ml-map { width:100%; height:100%; min-height:300px; background:#dbe9dc; }
        #ecoquest-ml-overlay .leaflet-container {
            width:100%; height:100%; font-family:Arial,sans-serif;
        }
        #ml-details {
            padding:18px; overflow-y:auto; background:#142b22;
            border-left:1px solid #365740;
        }
        #ml-details h3 { margin-top:0; line-height:1.4; }
        .ml-stat { padding:11px; margin:10px 0; border-radius:8px; background:#204030; }
        .ml-stat small { display:block; color:#b6d1c0; margin-bottom:6px; }
        .ml-stat strong { font-size:18px; }
        .ml-section-title { margin:22px 0 8px; font-size:14px; }
        .ml-model-note { color:#b6d1c0; font-size:11px; line-height:1.5; }
        .ml-importance-row { margin:10px 0; font-size:11px; }
        .ml-importance-label { display:flex; justify-content:space-between; gap:8px; margin-bottom:5px; }
        .ml-bar { height:7px; overflow:hidden; border-radius:8px; background:#345542; }
        .ml-bar span { display:block; height:100%; background:#83d99a; }
        .ml-legend {
            display:flex; flex-wrap:wrap; gap:18px; padding:11px 20px;
            background:#163829; font-size:12px;
        }
        .ml-legend i {
            display:inline-block; width:11px; height:11px;
            margin-right:5px; border-radius:3px;
        }
        .ml-footer {
            padding:9px; text-align:center; font-size:11px;
            color:#a7bcb0; background:#10271c;
        }
        @media(max-width:800px) {
            .ml-main { display:flex; flex-direction:column; overflow-y:auto; }
            #ml-map { height:55vh; min-height:380px; flex-shrink:0; }
            #ml-details { min-height:230px; overflow:visible; }
            .ml-header h2 { font-size:16px; }
            .ml-toolbar select { min-width:130px; flex:1; }
        }
    `;

    document.head.appendChild(style);
    document.body.appendChild(overlay);

    $("ml-close").addEventListener("click", closeMLMap);

    $("ml-reset").addEventListener("click", () => {
        if (!geoLayer || !map) return;
        $("ml-district").value = "";
        fillUpazilas();
        if (selectedLayer) {
            geoLayer.resetStyle(selectedLayer);
            selectedLayer = null;
        }
        map.fitBounds(geoLayer.getBounds(), { padding:[25,25] });
        showWelcome();
        if (selectionHandler) selectionHandler(null);
    });

    $("ml-district").addEventListener("change", () => {
        fillUpazilas();
        if (!geoLayer || !map) return;
        const district = $("ml-district").value;
        if (!district) {
            map.fitBounds(geoLayer.getBounds());
            return;
        }
        const selected = L.featureGroup();
        geoLayer.eachLayer(layer => {
            if (layer.feature.properties.district === district) selected.addLayer(layer);
        });
        if (selected.getLayers().length) {
            map.fitBounds(selected.getBounds(), { padding:[25,25] });
        }
    });

    $("ml-upazila").addEventListener("change", event => {
        if (!event.target.value) return;
        const [district, upazila] = event.target.value.split("|");
        selectUpazila(district, upazila);
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && isOpen) closeMLMap();
    });
}

function showImportance(panel) {
    const heading = document.createElement("h4");
    heading.className = "ml-section-title";
    heading.textContent = "Global XGBoost Feature Importance";
    panel.appendChild(heading);

    if (!featureImportance?.features?.length) {
        const note = document.createElement("p");
        note.className = "ml-model-note";
        note.textContent = "Feature importance is unavailable until the saved model loads.";
        panel.appendChild(note);
        return;
    }

    const max = Math.max(...featureImportance.features.map(item => item.gain_importance_pct), 0.0001);

    featureImportance.features.forEach(item => {
        const row = document.createElement("div");
        row.className = "ml-importance-row";

        const label = document.createElement("div");
        label.className = "ml-importance-label";

        const name = document.createElement("span");
        name.textContent = item.feature;

        const value = document.createElement("strong");
        value.textContent = item.gain_importance_pct.toFixed(2) + "%";

        label.append(name, value);

        const bar = document.createElement("div");
        bar.className = "ml-bar";
        const fill = document.createElement("span");
        fill.style.width = (item.gain_importance_pct / max * 100) + "%";
        bar.appendChild(fill);

        row.append(label, bar);
        panel.appendChild(row);
    });

    const note = document.createElement("p");
    note.className = "ml-model-note";
    note.textContent = featureImportance.note;
    panel.appendChild(note);
}

function showModelSummary(panel) {
    const heading = document.createElement("h4");
    heading.className = "ml-section-title";
    heading.textContent = "Model Status";
    panel.appendChild(heading);

    const status = document.createElement("p");
    status.className = "ml-model-note";
    status.textContent = modelInfo?.loaded
        ? "XGBoost model loaded and ready for feature-based inference."
        : "XGBoost model is not loaded. Check backend model status.";
    panel.appendChild(status);

    const metrics = modelInfo?.mean_spatial_cv;
    if (metrics) {
        const summary = document.createElement("p");
        summary.className = "ml-model-note";
        summary.textContent =
            `5-fold spatial CV — AUC ${Number(metrics.auc).toFixed(4)}, ` +
            `Accuracy ${Number(metrics.accuracy).toFixed(4)}, ` +
            `F1 ${Number(metrics.f1).toFixed(4)}.`;
        panel.appendChild(summary);
    }
}

function showWelcome() {
    const panel = $("ml-details");
    panel.replaceChildren();

    const heading = document.createElement("h3");
    heading.textContent = "Flood Susceptibility";

    const paragraph = document.createElement("p");
    paragraph.textContent =
        "Select an Upazila on the map to inspect its precomputed susceptibility statistics.";

    panel.append(heading, paragraph);
    showModelSummary(panel);
    showImportance(panel);
}

function addDetail(label, value) {
    const box = document.createElement("div");
    box.className = "ml-stat";
    const small = document.createElement("small");
    small.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = String(value);
    box.append(small, strong);
    $("ml-details").appendChild(box);
}

function showDetails(properties) {
    const panel = $("ml-details");
    panel.replaceChildren();

    const title = document.createElement("h3");
    title.textContent = properties.upazila + ", " + properties.district;
    panel.appendChild(title);

    const score = Number(properties.mean_score);
    addDetail("Mean susceptibility score", score.toFixed(4));
    addDetail("Mean score category", category(score));

    const classFields = {
        Low:"low_pct",
        Moderate:"moderate_pct",
        High:"high_pct",
        "Very High":"very_high_pct"
    };

    const dominant = properties.dominant_class ||
        Object.keys(classFields).reduce((best, name) =>
            Number(properties[classFields[name]]) > Number(properties[classFields[best]])
                ? name : best
        , "Low");

    addDetail("Dominant pixel class", dominant);
    addDetail("High + Very High pixel share", percentage(properties.high_very_high_pct));
    addDetail("Observed flooded pixels - 2022", percentage(properties.observed_flood22_pct));
    addDetail("Observed flooded pixels - 2024", percentage(properties.observed_flood24_pct));
    addDetail("Census population", Number(properties.population).toLocaleString());
    addDetail("Valid raster coverage", percentage(properties.coverage_pct));

    showModelSummary(panel);
    showImportance(panel);
}

function fillDistricts() {
    const select = $("ml-district");
    select.innerHTML = '<option value="">All Districts</option>';
    const districts = [...new Set(allRecords.map(row => row.district))].sort();

    districts.forEach(district => {
        const option = document.createElement("option");
        option.value = district;
        option.textContent = district;
        select.appendChild(option);
    });
}

function fillUpazilas() {
    const district = $("ml-district").value;
    const select = $("ml-upazila");
    select.innerHTML = '<option value="">Select Upazila</option>';

    allRecords.forEach(record => {
        if (district && record.district !== district) return;
        const option = document.createElement("option");
        option.value = record.district + "|" + record.upazila;
        option.textContent = record.upazila;
        select.appendChild(option);
    });
}

function findLayer(district, upazila) {
    let selected = null;
    if (!geoLayer) return null;
    geoLayer.eachLayer(layer => {
        const p = layer.feature.properties;
        if (p.district === district && p.upazila === upazila) selected = layer;
    });
    return selected;
}

function selectUpazila(district, upazila) {
    const layer = findLayer(district, upazila);
    if (!layer) return;

    if (selectedLayer) geoLayer.resetStyle(selectedLayer);
    selectedLayer = layer;

    $("ml-district").value = district;
    fillUpazilas();
    $("ml-upazila").value = district + "|" + upazila;

    const properties = layer.feature.properties;
    showDetails(properties);

    if (selectionHandler) {
        selectionHandler({
            district: properties.district,
            upazila: properties.upazila,
            mean_score: Number(properties.mean_score),
            high_very_high_pct: Number(properties.high_very_high_pct),
            dominant_class: properties.dominant_class ||
                category(Number(properties.mean_score))
        });
    }

    layer.setStyle({ color:"#ffffff", weight:3, fillOpacity:0.9 });
    layer.bringToFront();
    map.fitBounds(layer.getBounds(), { padding:[35,35], maxZoom:11 });
}

function createMap() {
    if (map) {
        map.remove();
        map = null;
    }

    map = L.map($("ml-map"), { preferCanvas:true, zoomControl:true });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom:18,
        attribution:"&copy; OpenStreetMap contributors"
    }).addTo(map);

    const canvas = L.canvas({padding:0.5});
    geoLayer = L.geoJSON(cachedGeoJSON, {
        renderer:canvas,
        style(feature) {
            const level = category(Number(feature.properties.mean_score));
            return {
                color:"#294238",
                weight:1,
                fillColor:COLORS[level],
                fillOpacity:0.72
            };
        },
        onEachFeature(feature, layer) {
            const p = feature.properties;
            layer.bindTooltip(p.upazila + " (" + p.district + ")", {sticky:true});
            layer.on("click", () => selectUpazila(p.district, p.upazila));
        }
    }).addTo(map);

    map.fitBounds(geoLayer.getBounds(), { padding:[25,25] });
}

async function loadMLData() {
    if (cachedGeoJSON) return;
    if (!dataPromise) {
        dataPromise = (async () => {
            $("ml-status").textContent = "Checking ML backend...";
            const health = await getHealth();
            if (health.status !== "healthy") throw new Error("ML backend is not healthy.");

            $("ml-status").textContent = "Loading geographic and model data...";
            const [result, geojson, config, info, importance] = await Promise.all([
                getAllUpazilas(),
                getFloodGeoJSON(),
                getThresholds(),
                getModelInfo(),
                getModelFeatureImportance().catch(error => ({
                    features: [],
                    note: error.message
                }))
            ]);

            if (result.count !== 38 || geojson.features?.length !== 38) {
                throw new Error("Expected 38 Upazilas.");
            }

            allRecords = result.results;
            thresholds = config;
            cachedGeoJSON = geojson;
            modelInfo = info;
            featureImportance = importance;

            fillDistricts();
            fillUpazilas();
            console.log("EcoQuest ML data loaded:", result.count, "Upazilas");
        })().finally(() => {
            dataPromise = null;
        });
    }
    await dataPromise;
}

export async function openMLMap() {
    createLayout();
    isOpen = true;

    if (!overlay.style.display || overlay.style.display === "none") {
        previousOverflow = document.body.style.overflow;
    }

    overlay.style.display = "flex";
    document.body.style.overflow = "hidden";

    try {
        await loadMLData();
        createMap();
        showWelcome();
        $("ml-status").textContent = "38 Upazilas loaded | XGBoost model: " +
            (modelInfo?.loaded ? "READY" : "UNAVAILABLE");
        setTimeout(() => map?.invalidateSize(true), 100);
    } catch (error) {
        console.error("EcoQuest ML map error:", error);
        $("ml-status").textContent = "Backend connection failed: " + error.message;
        showWelcome();
    }
}

function closeMLMap() {
    if (!overlay) return;
    overlay.style.display = "none";
    document.body.style.overflow = previousOverflow;
    isOpen = false;
}
