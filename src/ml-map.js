
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import {
    getHealth,
    getAllUpazilas,
    getFloodGeoJSON,
    getThresholds
} from "./ml-risk.js";

const $ = (id) => document.getElementById(id);

const COLORS = {
    "Low": "#27ae60",
    "Moderate": "#f1c40f",
    "High": "#e67e22",
    "Very High": "#e74c3c"
};

let map = null;
let geoLayer = null;
let allRecords = [];
let thresholds = null;

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
    document.body.style.margin = "0";
    document.body.style.background = "#0b1714";
    document.body.style.color = "#eef7ef";
    document.body.style.fontFamily = "Arial, sans-serif";

    document.body.innerHTML = `
    <div class="eco-header">
      <div>
        <h2>🌍 EcoQuest Flood Intelligence</h2>
        <p>Sylhet Division • XGBoost Flood Susceptibility</p>
      </div>
      <a href="/" class="eco-back">Back to Game</a>
    </div>

    <div class="eco-toolbar">
      <select id="district-filter">
        <option value="">All Districts</option>
      </select>

      <select id="upazila-filter">
        <option value="">Select Upazila</option>
      </select>

      <button id="reset-map">Reset Map</button>
      <span id="api-status">Connecting to ML backend...</span>
    </div>

    <div class="eco-main">
      <div id="ml-map"></div>

      <aside id="ml-details">
        <h3>ML Flood Susceptibility</h3>
        <p>Select an Upazila on the map to view its data.</p>
      </aside>
    </div>

    <div class="eco-legend">
      <span>Relative susceptibility:</span>
      <span><i style="background:#27ae60"></i>Low</span>
      <span><i style="background:#f1c40f"></i>Moderate</span>
      <span><i style="background:#e67e22"></i>High</span>
      <span><i style="background:#e74c3c"></i>Very High</span>
    </div>

    <footer class="eco-footer">
      Research prototype • Historical 2022/2024 flood maps •
      Not a live flood forecast or calibrated flood probability.
    </footer>
  `;

    const style = document.createElement("style");

    style.textContent = `
    * { box-sizing: border-box; }

    .eco-header {
      display:flex;
      justify-content:space-between;
      align-items:center;
      padding:16px 22px;
      background:#173b2a;
      gap:15px;
    }

    .eco-header h2 {
      margin:0;
      font-size:22px;
    }

    .eco-header p {
      margin:6px 0 0;
      color:#b6d1c0;
      font-size:13px;
    }

    .eco-back, .eco-toolbar button {
      background:#2f8051;
      color:white;
      border:0;
      border-radius:7px;
      padding:11px 14px;
      text-decoration:none;
      cursor:pointer;
    }

    .eco-toolbar {
      display:flex;
      align-items:center;
      flex-wrap:wrap;
      gap:12px;
      padding:13px 20px;
      background:#112c21;
    }

    .eco-toolbar select {
      padding:11px;
      border:1px solid #417457;
      background:#1c422e;
      color:white;
      border-radius:7px;
      min-width:170px;
    }

    #api-status {
      font-size:12px;
      color:#c5d9cc;
    }

    .eco-main {
      display:grid;
      grid-template-columns:minmax(0, 1fr) 325px;
      min-height:540px;
      height:calc(100vh - 225px);
    }

    #ml-map {
      width:100%;
      height:100%;
      min-height:500px;
      background:#dbe9dc;
    }

    #ml-details {
      padding:22px;
      background:#142b22;
      overflow-y:auto;
      border-left:1px solid #365740;
    }

    #ml-details h3 {
      margin-top:0;
      line-height:1.4;
    }

    .eco-stat {
      padding:12px;
      background:#204030;
      border-radius:8px;
      margin:10px 0;
    }

    .eco-stat small {
      display:block;
      color:#b6d1c0;
      margin-bottom:6px;
    }

    .eco-stat strong {
      font-size:20px;
    }

    .eco-legend {
      display:flex;
      flex-wrap:wrap;
      gap:16px;
      align-items:center;
      padding:12px 20px;
      background:#163829;
      font-size:13px;
    }

    .eco-legend i {
      display:inline-block;
      width:12px;
      height:12px;
      margin-right:5px;
      border-radius:3px;
    }

    .eco-footer {
      text-align:center;
      font-size:11px;
      padding:10px;
      color:#a7bcb0;
    }

    .leaflet-container {
      font-family:Arial, sans-serif;
    }

    @media(max-width:800px) {
      .eco-main {
        grid-template-columns:1fr;
        height:auto;
      }

      #ml-map {
        height:480px;
      }

      #ml-details {
        min-height:260px;
      }

      .eco-header h2 {
        font-size:17px;
      }
    }
  `;

    document.head.appendChild(style);
}

function addDetail(label, value) {
    const box = document.createElement("div");
    box.className = "eco-stat";

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
    const level = category(score);

    addDetail("Mean susceptibility score", score.toFixed(4));

    addDetail("Mean score category", level);

    addDetail(
        "Dominant pixel class",
        properties.dominant_class ||
        ["Low", "Moderate", "High", "Very High"].reduce(
            (best, name) =>
                Number(properties[
                    {
                        Low: "low_pct",
                        Moderate: "moderate_pct",
                        High: "high_pct",
                        "Very High": "very_high_pct"
                    }[name]
                    ]) >
                Number(properties[
                    {
                        Low: "low_pct",
                        Moderate: "moderate_pct",
                        High: "high_pct",
                        "Very High": "very_high_pct"
                    }[best]
                    ])
                    ? name
                    : best,
            "Low"
        )
    );

    addDetail(
        "High + Very High pixel share",
        percentage(properties.high_very_high_pct)
    );

    addDetail(
        "Observed flooded pixels — 2022",
        percentage(properties.observed_flood22_pct)
    );

    addDetail(
        "Observed flooded pixels — 2024",
        percentage(properties.observed_flood24_pct)
    );

    addDetail(
        "Census population",
        Number(properties.population).toLocaleString()
    );

    addDetail(
        "Valid raster coverage",
        percentage(properties.coverage_pct)
    );
}

function fillDistricts() {
    const districts = [
        ...new Set(allRecords.map((row) => row.district))
    ].sort();

    const select = $("district-filter");

    for (const district of districts) {
        const option = document.createElement("option");
        option.value = district;
        option.textContent = district;
        select.appendChild(option);
    }
}

function fillUpazilas() {
    const district = $("district-filter").value;
    const select = $("upazila-filter");

    select.replaceChildren();

    const initial = document.createElement("option");
    initial.value = "";
    initial.textContent = "Select Upazila";
    select.appendChild(initial);

    for (const record of allRecords) {
        if (district && record.district !== district) continue;

        const option = document.createElement("option");
        option.value = record.district + "|" + record.upazila;
        option.textContent = record.upazila;
        select.appendChild(option);
    }
}

function findLayer(district, upazila) {
    let selected = null;

    geoLayer.eachLayer((layer) => {
        const p = layer.feature.properties;

        if (p.district === district && p.upazila === upazila) {
            selected = layer;
        }
    });

    return selected;
}

function selectUpazila(district, upazila) {
    const layer = findLayer(district, upazila);
    if (!layer) return;

    $("district-filter").value = district;
    fillUpazilas();
    $("upazila-filter").value = district + "|" + upazila;

    showDetails(layer.feature.properties);

    map.fitBounds(layer.getBounds(), {
        padding: [35, 35],
        maxZoom: 11
    });

    layer.bringToFront();
}

function createMap(geojson) {
    map = L.map("ml-map", {
        preferCanvas: true,
        zoomControl: true
    });

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            maxZoom: 18,
            attribution: "&copy; OpenStreetMap contributors"
        }
    ).addTo(map);

    const canvas = L.canvas({ padding: 0.5 });

    geoLayer = L.geoJSON(geojson, {
        renderer: canvas,

        style(feature) {
            const level = category(
                Number(feature.properties.mean_score)
            );

            return {
                color: "#294238",
                weight: 1,
                fillColor: COLORS[level],
                fillOpacity: 0.72
            };
        },

        onEachFeature(feature, layer) {
            const p = feature.properties;

            layer.bindTooltip(
                p.upazila + " (" + p.district + ")",
                { sticky: true }
            );

            layer.on("click", () => {
                selectUpazila(p.district, p.upazila);
            });
        }
    }).addTo(map);

    map.fitBounds(geoLayer.getBounds(), {
        padding: [25, 25]
    });
}

async function initialize() {
    createLayout();

    try {
        const health = await getHealth();

        if (health.status !== "healthy") {
            throw new Error("Backend is not healthy.");
        }

        $("api-status").textContent = "Loading geographic ML data...";

        const [result, geojson, config] = await Promise.all([
            getAllUpazilas(),
            getFloodGeoJSON(),
            getThresholds()
        ]);

        if (
            result.count !== 38 ||
            geojson.features?.length !== 38
        ) {
            throw new Error("Expected 38 Upazilas.");
        }

        allRecords = result.results;
        thresholds = config;

        fillDistricts();
        fillUpazilas();
        createMap(geojson);

        $("district-filter").addEventListener("change", () => {
            fillUpazilas();

            const district = $("district-filter").value;

            if (!district) {
                map.fitBounds(geoLayer.getBounds());
                return;
            }

            const selected = L.featureGroup();

            geoLayer.eachLayer((layer) => {
                if (layer.feature.properties.district === district) {
                    selected.addLayer(layer);
                }
            });

            if (selected.getLayers().length) {
                map.fitBounds(selected.getBounds());
            }
        });

        $("upazila-filter").addEventListener("change", (event) => {
            if (!event.target.value) return;

            const [district, upazila] = event.target.value.split("|");
            selectUpazila(district, upazila);
        });

        $("reset-map").addEventListener("click", () => {
            $("district-filter").value = "";
            fillUpazilas();
            map.fitBounds(geoLayer.getBounds());
        });

        $("api-status").textContent =
            "Connected • 38 Upazilas • XGBoost susceptibility";

        console.log("EcoQuest ML Map initialized successfully.");

    } catch (error) {
        console.error("EcoQuest ML Map Error:", error);

        $("api-status").textContent = "Connection failed";

        $("ml-details").textContent =
            "Could not load map: " + error.message +
            ". Check FastAPI on port 8000.";
    }
}

initialize();
