
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ModelLibrary } from './model-loader.js';
import { createNaturalTerrain } from './terrain-system.js';
import { createLightingSystem } from './lighting-system.js';
import { createEnvironmentAssistant } from './environment-assistant.js';
import { createMissionSystem } from './mission-system.js';
import { calculateEnvironmentalConsequences } from './environmental-consequences.js';
import { applyBuildEffects, getCitySustainabilityScore } from './city-economy.js';
import {
    makeRoadMaterial,
    makeConcreteMaterial,
    makeMarkingMaterial
} from './road-system.js';
import { openMLMap, setMLMapSelectionHandler } from './ml-map-overlay.js';

// ============================================================
// ECOQUEST — REALISTIC 3D CITY BUILDER
// Three.js + GLB Asset Integration
// ============================================================

const app = document.querySelector('#app');

if (!app) throw new Error('Missing #app element in index.html');

// Coarse-pointer devices receive touch controls and a lighter rendering profile.
const IS_TOUCH_DEVICE =
    window.matchMedia('(pointer: coarse)').matches ||
    window.innerWidth <= 700;

// Currently selected ML Upazila.
let selectedMLArea = null;

// ============================================================
// 1. CONFIGURATION
// ============================================================

const CONFIG = {
    roadWidth: 38,
    rainCount: IS_TOUCH_DEVICE ? 900 : 2500,
    cameraSpeed: 300,
    saveKey: 'ecoquest-3d-save-v2'
};

const stats = {
    credits: 500,
    pollution: 38,
    happiness: 65,
    green: 32,
    rainfall: 0,
    floodRisk: 0,
    drainage: 55,
    energy: 45,
    waste: 30,
    effectivePollution: 38,
    effectiveGreen: 32,
    industryPressure: 0,
    imperviousSurface: 0,
    greenInfiltration: 0,
    runoffPressure: 0,
    level: 1
};

const ZONE_COLUMNS=10, ZONE_ROWS=7, ZONE_SPACING=800;
const ZONE_ORIGIN_X=-850, ZONE_ORIGIN_Z=-650;

const DISTRICT_TYPES=[
    {id:'forest',name:'Green Belt & Woodland',icon:'🌲',type:'forest'},
    {id:'downtown',name:'Commercial & Civic Core',icon:'🏙️',type:'downtown'},
    {id:'riverside',name:'River & Canal Communities',icon:'🌊',type:'riverside'},
    {id:'central',name:'Parks & Recreation',icon:'🌳',type:'park'},
    {id:'residential',name:'Residential Neighbourhoods',icon:'🏡',type:'residential'},
    {id:'industrial',name:'Industrial & Logistics Estate',icon:'🏭',type:'industrial'},
    {id:'farm',name:'Agriculture & Orchard Belt',icon:'🌾',type:'farm'}
];

// A deliberate city plan: a compact commercial core, residential pockets,
// a connected industrial estate on the south-east edge, and green/agricultural
// buffers around the perimeter. Every zone has its own identity and name.
const ZONE_LAYOUT=[
    {type:'forest',name:'North Ridge Woodland'},
    {type:'forest',name:'Botanical Reserve'},
    {type:'farm',name:'North Orchard Belt'},
    {type:'farm',name:'Upper Valley Fields'},
    {type:'riverside',name:'North Canal Village'},
    {type:'riverside',name:'East Canal Promenade'},
    {type:'park',name:'North Lake Park'},
    {type:'residential',name:'Garden Suburb North'},
    {type:'forest',name:'Wildlife Buffer'},
    {type:'farm',name:'North-East Market Gardens'},

    {type:'forest',name:'West Woodland Estate'},
    {type:'park',name:'University Green'},
    {type:'residential',name:'University Housing'},
    {type:'residential',name:'West Garden Homes'},
    {type:'downtown',name:'Old Town Market'},
    {type:'downtown',name:'Civic and Finance Quarter'},
    {type:'downtown',name:'East Market Quarter'},
    {type:'riverside',name:'Canal Residential Quarter'},
    {type:'farm',name:'Meadow Farms'},
    {type:'forest',name:'North-East Greenbelt'},

    {type:'residential',name:'West Family Quarter'},
    {type:'residential',name:'School and Community District'},
    {type:'park',name:'Central Botanical Gardens'},
    {type:'downtown',name:'Heritage Commercial Street'},
    {type:'downtown',name:'Central Business District'},
    {type:'downtown',name:'Grand Station Quarter'},
    {type:'downtown',name:'Medical and Civic Quarter'},
    {type:'riverside',name:'Canal View Apartments'},
    {type:'industrial',name:'North Industrial Logistics'},
    {type:'park',name:'Industrial Buffer Park'},

    {type:'residential',name:'South-West Residential Quarter'},
    {type:'park',name:'Stadium and Recreation Park'},
    {type:'residential',name:'South-West Mixed Housing'},
    {type:'downtown',name:'Historic Core'},
    {type:'downtown',name:'Central Plaza District'},
    {type:'park',name:'Riverfront Commons'},
    {type:'residential',name:'South-East Garden Homes'},
    {type:'industrial',name:'Industrial Estate West'},
    {type:'industrial',name:'Manufacturing Park A'},
    {type:'industrial',name:'Manufacturing Park B'},

    {type:'farm',name:'Western Agricultural Edge'},
    {type:'residential',name:'South Garden Suburb'},
    {type:'residential',name:'South School Quarter'},
    {type:'downtown',name:'South Commercial Street'},
    {type:'park',name:'City Botanical Park'},
    {type:'residential',name:'South Apartment Quarter'},
    {type:'residential',name:'Riverside Family Homes'},
    {type:'industrial',name:'Industrial Estate South'},
    {type:'industrial',name:'Factory and Warehouse Quarter'},
    {type:'industrial',name:'Heavy Industry Yard'},

    {type:'farm',name:'South-West Crop Fields'},
    {type:'farm',name:'Orchard and Dairy Belt'},
    {type:'forest',name:'South Forest Reserve'},
    {type:'residential',name:'South-West Family Quarter'},
    {type:'residential',name:'South Central Housing'},
    {type:'park',name:'Sports and Recreation Green'},
    {type:'residential',name:'East Garden Suburb'},
    {type:'industrial',name:'Logistics Distribution Park'},
    {type:'industrial',name:'Industrial Utilities Quarter'},
    {type:'industrial',name:'Freight Terminal District'},

    {type:'forest',name:'Western Greenbelt'},
    {type:'farm',name:'Lower Valley Agriculture'},
    {type:'farm',name:'Southern Orchard Belt'},
    {type:'riverside',name:'Lower River Village'},
    {type:'park',name:'Wetland Nature Park'},
    {type:'residential',name:'South Lakeside Homes'},
    {type:'residential',name:'South-East Residential Quarter'},
    {type:'industrial',name:'Power and Energy Estate'},
    {type:'industrial',name:'Recycling and Materials Park'},
    {type:'industrial',name:'Portside Industrial Estate'}
];

if(ZONE_LAYOUT.length!==ZONE_COLUMNS*ZONE_ROWS){
    throw new Error(`EcoQuest zone plan must contain 70 entries; found ${ZONE_LAYOUT.length}.`);
}

const typeCounts=Object.fromEntries(DISTRICT_TYPES.map(type=>[type.id,0]));
const districts=ZONE_LAYOUT.map((zone,index)=>{
    const row=Math.floor(index/ZONE_COLUMNS);
    const col=index%ZONE_COLUMNS;
    const zoneNo=index+1;
    const base=DISTRICT_TYPES.find(type=>type.type===zone.type);
    if(!base) throw new Error(`Unknown zone type: ${zone.type}`);

    const ordinal=++typeCounts[base.id];
    const id=ordinal===1?base.id:`${base.id}-${String(ordinal).padStart(2,'0')}`;

    return {
        id,
        name:zone.name,
        icon:base.icon,
        type:base.type,
        x:ZONE_ORIGIN_X+col*ZONE_SPACING,
        z:ZONE_ORIGIN_Z+row*ZONE_SPACING,
        zoneNo,row,col,
        variant:zoneNo
    };
});

const zoneOptions=DISTRICT_TYPES.map(type=>{
    const options=districts.filter(zone=>zone.type===type.type).map(zone=>
        `<option value="${zone.id}">Zone ${String(zone.zoneNo).padStart(2,'0')} — ${zone.icon} ${zone.name}</option>`
    ).join('');
    return `<optgroup label="${type.name}">${options}</optgroup>`;
}).join('');

const tools = {
    oak:{name:'Oak Tree',cost:8,green:3,happiness:2,pollution:-1,energy:0,waste:0},
    pine:{name:'Pine Tree',cost:10,green:4,happiness:2,pollution:-1,energy:0,waste:0},
    blossom:{name:'Blossom Tree',cost:12,green:5,happiness:3,pollution:-1,energy:0,waste:0},
    flower:{name:'Flower Garden',cost:5,green:1,happiness:2,pollution:0,energy:0,waste:0},
    house:{name:'House',cost:45,green:0,happiness:4,pollution:1,energy:-1,waste:1},
    apartment:{name:'Apartment',cost:80,green:0,happiness:3,pollution:2,energy:-2,waste:2},
    factory:{name:'Factory',cost:100,green:0,happiness:-3,pollution:8,energy:-5,waste:4},
    bench:{name:'Park Bench',cost:15,green:0,happiness:4,pollution:0,energy:0,waste:0},
    solar:{name:'Solar Panel',cost:25,green:2,happiness:1,pollution:-3,energy:8,waste:0},
    lamp:{name:'Street Lamp',cost:18,green:0,happiness:2,pollution:0,energy:-1,waste:0}
};

// ============================================================
// 2. GAME VARIABLES
// ============================================================

let scene, camera, renderer, controls, clock;
let modelLibrary;
let lightingSystem;
let environmentAssistant;
let missionSystem;


let selectedTool = 'oak';
let currentDistrict = 'central';
let isCityOverview = true;
const riverBridges = [];

let placedItems = [];
let buildTiles = [];
const designBonusClaimed=new Set();
let vehicles = [];
let rainSystem;
let rainArray;
let floodSurfaces = [];
let floodVisualLevel = 0;
let floodTargetLevel = 0;

let waterSurfaces = [];
let waterRipples = [];

let materials = {};
let hud = {};
let economyTimer = 0;

const keys = {};
const virtualMove = { x: 0, y: 0 };

// ============================================================
// 3. INTERFACE CSS
// ============================================================

const css = document.createElement('style');

css.textContent = `
*{box-sizing:border-box}

body{
 margin:0;
 background:#101a14;
 color:#f1f6ee;
 font-family:Inter,"Segoe UI",Arial,sans-serif;
}

button{font-family:inherit}

.eco-shell{
 width:100%;
 max-width:1800px;
 margin:auto;
 padding:8px;
}

.game-interface{
 overflow:hidden;
 border:1px solid #3c6246;
 border-radius:13px;
 background:#15271c;
 box-shadow:0 18px 50px #0008;
}

.top-hud{
 display:flex;
 justify-content:space-between;
 align-items:center;
 flex-wrap:wrap;
 gap:12px;
 padding:12px;
 background:linear-gradient(110deg,#24432d,#102019);
 border-bottom:1px solid #47634a;
}

.brand small{
 font-size:9px;
 letter-spacing:2px;
 color:#9df3a4;
 font-weight:900;
}

.brand h1{margin:5px 0;font-size:25px}
.brand p{margin:0;font-size:10px;color:#b7cbb8}

.stats-strip{
 display:grid;
 grid-template-columns:repeat(11,minmax(62px,1fr));
 gap:5px;
 flex:1;
}

.stat{
 padding:8px 4px;
 border:1px solid #47634a;
 border-radius:7px;
 background:#ffffff09;
 text-align:center;
}

.stat span{
 display:block;
 color:#c2d7c0;
 font-size:9px;
 margin-bottom:5px;
}

.stat strong{color:#9df3a4;font-size:14px}
.stat.warning strong{color:#ffc96b}
.stat.danger strong{color:#ff7777}

.navigation,.toolbar{
 display:flex;
 align-items:center;
 gap:6px;
 padding:9px;
 overflow-x:auto;
 scrollbar-width:thin;
 background:#223b2a;
 border-bottom:1px solid #49674d;
}

.bar-label{
 flex-shrink:0;
 color:#a7e6a5;
 font-size:10px;
 font-weight:900;
 letter-spacing:1px;
}

.nav-btn,.tool-btn,.action-btn{
 flex-shrink:0;
 cursor:pointer;
 border:1px solid #557355;
 border-radius:7px;
 color:white;
 background:#304d36;
 transition:.2s;
}

.nav-btn{
 padding:9px 12px;
 font-size:10px;
 font-weight:800;
}

.tool-btn{min-width:86px;padding:7px}
.tool-btn span{display:block;font-size:10px;font-weight:800}
.tool-btn small{display:block;color:#c4d8bd;font-size:9px;margin-top:4px}

.action-btn{padding:9px 11px;font-size:10px;font-weight:800}

.nav-btn:hover,.tool-btn:hover,.action-btn:hover{
 filter:brightness(1.3);
 transform:translateY(-1px);
}

.nav-btn.active,.tool-btn.active{
 background:#3e8a4b;
 border-color:#b5f2ae;
}

.action-btn.blue{background:#286c8c}
.action-btn.orange{background:#80613a}
.action-btn.red{background:#82433e}

#selected-tool{
 flex-shrink:0;
 font-size:10px;
 color:#a4eca7;
}

.game-stage{
 position:relative;
 height:min(76vh,900px);
 min-height:470px;
 overflow:hidden;
 background:#81996a;
}

#city-game{width:100%;height:100%}
#city-game canvas{
 display:block;width:100%;height:100%;
 touch-action:none;
 -webkit-user-select:none;
 user-select:none;
}
.mobile-joystick{
 display:none;
 position:absolute;
 left:16px;
 bottom:18px;
 z-index:12;
 width:116px;
 height:116px;
 border:1px solid rgba(225,245,220,.55);
 border-radius:50%;
 background:radial-gradient(circle,rgba(116,164,112,.28),rgba(13,35,25,.78));
 box-shadow:0 8px 24px rgba(0,0,0,.35),inset 0 0 18px rgba(220,255,210,.10);
 touch-action:none;
 -webkit-user-select:none;
 user-select:none;
}
.mobile-joystick::before{
 content:"";
 position:absolute;
 inset:12px;
 border:1px dashed rgba(225,245,220,.28);
 border-radius:50%;
 pointer-events:none;
}
.mobile-joystick-knob{
 position:absolute;
 left:50%;
 top:50%;
 width:48px;
 height:48px;
 border:1px solid #d8f3d0;
 border-radius:50%;
 background:linear-gradient(145deg,#7bc879,#28683d);
 box-shadow:0 4px 14px rgba(0,0,0,.38),inset 0 1px 3px rgba(255,255,255,.35);
 transform:translate(-50%,-50%);
 pointer-events:none;
}
.mobile-joystick-label{
 position:absolute;
 left:50%;
 bottom:-19px;
 transform:translateX(-50%);
 color:#eaf5e5;
 font-size:9px;
 font-weight:900;
 letter-spacing:1px;
 text-shadow:0 1px 4px #000;
 pointer-events:none;
 white-space:nowrap;
}

.stage-location,.movement-hint,.game-alert{
 position:absolute;
 z-index:5;
 padding:8px 11px;
 border:1px solid #ffffff3b;
 border-radius:7px;
 background:#14281fe8;
 font-size:10px;
 pointer-events:none;
}

.stage-location{top:12px;left:12px}
.movement-hint{bottom:12px;left:12px;color:#d7e8d3}
.game-alert{top:82px;right:12px;color:#9df3a4}

.zone-selector{
 position:absolute;top:12px;right:12px;z-index:8;
 display:grid;gap:5px;width:min(265px,calc(100% - 24px));
 padding:9px;border:1px solid #b4d3a9;border-radius:9px;
 background:rgba(15,36,24,.94);box-shadow:0 8px 24px #0006;
 backdrop-filter:blur(8px);
}
.zone-selector label{color:#b8efb0;font-size:9px;font-weight:900;letter-spacing:1px}
.zone-selector select{
 width:100%;min-width:0;padding:9px 10px;border:1px solid #668b68;
 border-radius:6px;outline:none;background:#243f2d;color:#f2f8ef;
 font:700 11px Arial,sans-serif;cursor:pointer;
}
.zone-selector select:focus{border-color:#b8efb0;box-shadow:0 0 0 2px #9df3a433}
.zone-selector option,.zone-selector optgroup{background:#203a29;color:#f2f8ef}

.camera-controls{
 position:absolute;
 top:116px;
 right:12px;
 z-index:6;
 display:flex;
 gap:5px;
}

.camera-controls button{
 width:34px;
 height:34px;
 border:1px solid #b3c9a9;
 border-radius:7px;
 background:#183521e8;
 color:white;
 font-size:18px;
 cursor:pointer;
}

.game-footer{
 display:flex;
 justify-content:space-between;
 align-items:center;
 flex-wrap:wrap;
 gap:10px;
 padding:12px;
 background:#193522;
 border-top:1px solid #49674b;
}

#status{font-size:10px;color:#c4e8bf}
.footer-info{font-size:9px;color:#b5cdb1}

@media(max-width:1000px){
 .stats-strip{flex-basis:100%;grid-template-columns:repeat(6,minmax(0,1fr))}
}

@media(max-width:700px), (pointer:coarse){
 .mobile-joystick{display:block}
 .movement-hint{
  display:block;left:132px;bottom:20px;
  max-width:calc(100% - 148px);
  padding:7px 8px;font-size:8px;line-height:1.4;
 }
 .game-stage{height:min(78svh,820px);min-height:480px}
 .zone-selector{width:min(215px,calc(100% - 24px));padding:7px}
 .zone-selector label{font-size:8px}
 .zone-selector select{font-size:10px;padding:8px}
 .camera-controls{top:116px;right:9px}
 .camera-controls button{width:36px;height:36px}
 .eco-light-controls{max-width:calc(100% - 24px)}
 .eco-light-btn{min-height:34px;touch-action:manipulation}
 .tool-btn,.action-btn,.nav-btn,.zone-selector select{touch-action:manipulation}
 .tool-btn{min-width:82px;min-height:48px}
 .action-btn,.nav-btn{min-height:40px}
 .game-footer{padding-bottom:14px}
}
@media(max-width:550px){
 .stats-strip{grid-template-columns:repeat(2,minmax(0,1fr))}
 .eco-shell{padding:2px}
 .brand{width:100%}
 .game-stage{height:72svh;min-height:500px}
 .zone-selector{width:min(205px,calc(100% - 24px))}
 .zone-selector select{font-size:10px;padding:8px}
 .game-alert{top:82px;font-size:9px}
 .camera-controls{top:116px}
 .mobile-joystick{left:12px;bottom:17px;width:108px;height:108px}
 .mobile-joystick-knob{width:46px;height:46px}
}
@media(max-height:500px) and (orientation:landscape){
 .game-stage{height:86svh;min-height:320px}
 .mobile-joystick{width:94px;height:94px;left:12px;bottom:12px}
 .mobile-joystick-knob{width:40px;height:40px}
 .camera-controls{top:108px}
}
`;

document.head.appendChild(css);

// ============================================================
// 4. USER INTERFACE
// ============================================================

app.innerHTML = `
<div class="eco-shell">
 <main class="game-interface">

  <header class="top-hud">
   <div class="brand">
    <small>REALISTIC 3D OPEN WORLD SIMULATOR</small>
    <h1>🌿 EcoQuest</h1>
    <p>Explore. Build. Protect your city.</p>
   </div>

   <div class="stats-strip">
    <div class="stat"><span>💰 Credits</span><strong id="credits">500</strong></div>
    <div class="stat"><span>🏭 Pollution</span><strong id="pollution">38%</strong></div>
    <div class="stat"><span>😊 Happiness</span><strong id="happiness">65%</strong></div>
    <div class="stat"><span>🌳 Green Score</span><strong id="green">32%</strong></div>
    <div class="stat"><span>🌧️ Rainfall</span><strong id="rainfall">0%</strong></div>
    <div class="stat" id="risk-card"><span>🌊 Flood Risk</span><strong id="flood-risk">0%</strong></div>
    <div class="stat"><span>🚰 Drainage</span><strong id="drainage">55%</strong></div>
    <div class="stat"><span>⚡ Energy</span><strong id="energy">45%</strong></div>
    <div class="stat"><span>♻️ Waste</span><strong id="waste">30%</strong></div>
    <div class="stat"><span>🏭 Industry Pressure</span><strong id="industry-pressure">0%</strong></div>
    <div class="stat"><span>🌊 Runoff Pressure</span><strong id="runoff-pressure">0%</strong></div>
   </div>
  </header>

  <nav class="navigation">
   <span class="bar-label">EXPLORE</span>
   <span style="font-size:10px;color:#d2e7ce;font-weight:800">
    70 CONNECTED ZONES · SELECT ANY ZONE FROM THE TOP-RIGHT MENU
   </span>
  </nav>

  <nav class="toolbar">
   <span class="bar-label">BUILD</span>

   <button class="tool-btn active" data-tool="oak"><span>🌳 Oak Tree</span><small>8 Credits</small></button>
   <button class="tool-btn" data-tool="pine"><span>🌲 Pine Tree</span><small>10 Credits</small></button>
   <button class="tool-btn" data-tool="blossom"><span>🌸 Blossom</span><small>12 Credits</small></button>
   <button class="tool-btn" data-tool="flower"><span>🌺 Garden</span><small>5 Credits</small></button>
   <button class="tool-btn" data-tool="house"><span>🏠 House</span><small>45 Credits</small></button>
   <button class="tool-btn" data-tool="apartment"><span>🏢 Apartment</span><small>80 Credits</small></button>
   <button class="tool-btn" data-tool="factory"><span>🏭 Factory</span><small>100 Credits</small></button>
   <button class="tool-btn" data-tool="bench"><span>🪑 Bench</span><small>15 Credits</small></button>
   <button class="tool-btn" data-tool="solar"><span>☀️ Solar</span><small>25 Credits</small></button>
   <button class="tool-btn" data-tool="lamp"><span>💡 Lamp</span><small>18 Credits</small></button>
   <button class="tool-btn" data-tool="remove"><span>🗑️ Remove</span><small>Refund 50%</small></button>

   <span class="bar-label">WEATHER</span>

   <button class="action-btn blue" data-action="rain">🌧️ Rain</button>
   <button class="action-btn" data-action="clear">☀️ Clear</button>
   <button class="action-btn orange" data-action="drainage">🚰 Drainage</button>
   <button class="action-btn" data-action="clean">♻️ Cleanup</button>
   <button class="action-btn" data-action="save">💾 Save</button>
   <button class="action-btn" data-action="load">📂 Load</button>
   <button class="action-btn red" data-action="reset">↻ Reset</button>

   <button class="action-btn" id="ml-map-open-btn" type="button">
    ML FLOOD MAP
   </button>

   <span id="selected-tool">Selected: Oak Tree</span>
  </nav>

  <section class="game-stage">
   <div class="stage-location" id="location-label">ZONE 11 · 🌳 Central Park 01</div>
   <div class="zone-selector">
    <label for="zone-select">🗺️ SELECT A ZONE · 70 AVAILABLE</label>
    <select id="zone-select">
    <option value="">🌐 Free Explore — Full City</option>
    ${zoneOptions}
   </select>
   </div>
   <div class="game-alert">● LIVE 3D SIMULATION</div>

   <div class="camera-controls">
    <button id="zoom-in">+</button>
    <button id="zoom-out">−</button>
    <button id="camera-reset" title="Return to selected zone">⌂</button>
    <button id="camera-overview" title="View the entire 70-zone city">🌐</button>
   </div>

   <div class="movement-hint">
    WASD / Stick: Move · Drag: Rotate · Pinch: Zoom & Pan
   </div>

   <div
    class="mobile-joystick"
    id="mobile-joystick"
    role="group"
    aria-label="Touch movement joystick"
   >
    <div class="mobile-joystick-knob" id="mobile-joystick-knob"></div>
    <span class="mobile-joystick-label">MOVE</span>
   </div>

   <div id="city-game"></div>
  </section>

  <footer class="game-footer">
   <div id="status">Loading EcoQuest...</div>
   <div class="footer-info">
    LEVEL <strong id="level">01</strong> · 70 CONNECTED ZONES · 🌳 TREE +12 · 🚰 DRAINAGE +25 · 🏆 DESIGN +100
   </div>
  </footer>

 </main>
</div>
`;

[
    'credits','pollution','happiness','green',
    'rainfall','flood-risk','drainage','energy',
    'industry-pressure','runoff-pressure','waste',
    'level','status','location-label',
    'selected-tool','risk-card'
].forEach(id=>{
    hud[id]=document.getElementById(id);
});

function message(text){
    hud.status.textContent=text;
}

// ============================================================
// 5. MATERIALS AND TEXTURES
// ============================================================

function noiseTexture(color, repeat = 8) {

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;

    const ctx = canvas.getContext('2d');

    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 512, 512);

    // Very subtle natural surface variation.
    for (let i = 0; i < 2200; i++) {

        const x = Math.random() * 512;
        const y = Math.random() * 512;

        const light = Math.random() > 0.5;

        ctx.fillStyle = light
            ? `rgba(195,210,150,${Math.random() * 0.035})`
            : `rgba(35,55,30,${Math.random() * 0.035})`;

        ctx.fillRect(
            x,
            y,
            Math.random() * 8 + 3,
            Math.random() * 4 + 1
        );
    }

    const texture = new THREE.CanvasTexture(canvas);

    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat, repeat);

    texture.colorSpace = THREE.SRGBColorSpace;

    texture.anisotropy = 8;

    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;

    texture.generateMipmaps = true;
    texture.needsUpdate = true;

    return texture;
}

function createMaterial(color,roughness=0.9,metalness=0){

    return new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness
    });
}

function initializeMaterials(){

    materials.grass=new THREE.MeshStandardMaterial({
        map:noiseTexture('#738d56',7),
        roughness:1
    });

    materials.parkGrass=new THREE.MeshStandardMaterial({
        map:noiseTexture('#638e4a',6),
        roughness:1
    });

    materials.road=new THREE.MeshStandardMaterial({
        map:noiseTexture('#34383b',12),
        roughness:0.96
    });

    materials.sidewalk=createMaterial(0xa9a99c);
    materials.trunk=createMaterial(0x60432c);
    materials.leaves=createMaterial(0x386d3a);
    materials.leavesLight=createMaterial(0x568a43);
    materials.window=createMaterial(0x8ebbc5,0.22,0.25);
    materials.roadLine=createMaterial(0xe9dfb7);

    materials.water=new THREE.MeshPhysicalMaterial({
        color:0x358da8,
        roughness:0.17,
        metalness:0.05,
        clearcoat:0.9
    });

    materials.tile=new THREE.MeshBasicMaterial({
        color:0xc9e6a9,
        transparent:true,
        opacity:0.12,
        side:THREE.DoubleSide,
        depthWrite:false
    });
}

// ============================================================
// 6. BASIC 3D HELPERS
// ============================================================

function addMesh(geometry,material,x,y,z,parent=scene){

    const mesh=new THREE.Mesh(geometry,material);

    mesh.position.set(x,y,z);
    mesh.castShadow=true;
    mesh.receiveShadow=true;

    parent.add(mesh);

    return mesh;
}

function addBox(x,y,z,w,h,d,material,parent=scene){

    return addMesh(
        new THREE.BoxGeometry(w,h,d),
        material,x,y,z,parent
    );
}

function addPlane(x, y, z, w, d, material, parent = scene) {

    const geometry = new THREE.PlaneGeometry(w, d);

    const mesh = new THREE.Mesh(geometry, material);

    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);

    mesh.castShadow = false;
    mesh.receiveShadow = false;

    parent.add(mesh);

    return mesh;
}

// ============================================================
// 7. REALISTIC GLB MODEL ACCESS
// ============================================================

function createAsset(type,x,z){

    if(!modelLibrary?.has(type)) return null;

    try{

        return modelLibrary.create(type,x,z);

    }catch(error){

        console.warn(`GLB placement failed for ${type}`,error);
        return null;
    }
}

// ============================================================
// 8. TREE MODELS — GLB FIRST, PROCEDURAL FALLBACK
// ============================================================

function createTree(x,z,type='oak',scale=1){

    const asset=createAsset(type,x,z);

    if(asset) return asset;

    const group=new THREE.Group();

    group.position.set(x,0,z);
    group.scale.setScalar(scale);

    addMesh(
        new THREE.CylinderGeometry(0.32,0.52,4.5,9),
        materials.trunk,0,2.25,0,group
    );

    if(type==='pine'){

        const pineMaterial=createMaterial(0x285b35);

        for(let i=0;i<4;i++){

            addMesh(
                new THREE.ConeGeometry(2.9-i*0.45,4.8,10),
                pineMaterial,0,4+i*2.1,0,group
            );
        }

    }else{

        const leafMaterial=type==='blossom'
            ?createMaterial(0xe3a0b9)
            :materials.leaves;

        const crown=[
            [0,6,0,2.8],
            [-1.9,5.9,0,1.9],
            [1.9,5.9,0,1.9],
            [0,7.9,0,1.9],
            [0,5.5,1.8,1.7]
        ];

        crown.forEach(([px,py,pz,r])=>{

            addMesh(
                new THREE.SphereGeometry(r,12,10),
                leafMaterial,px,py,pz,group
            );
        });
    }

    scene.add(group);

    return group;
}

// ============================================================
// 9. HOUSE — GLB FIRST, PROCEDURAL FALLBACK
// ============================================================

function createHouseModel(x,z,color=0xc7b69c,scale=1){

    const asset=createAsset('house',x,z);

    if(asset) return asset;

    const group=new THREE.Group();

    group.position.set(x,0,z);
    group.scale.setScalar(scale);

    const wall=createMaterial(color);
    const roof=createMaterial(0x57483a);
    const door=createMaterial(0x67462e);

    addBox(0,4,0,16,8,14,wall,group);
    addBox(0,8.4,0,17,0.8,15,createMaterial(0x9a927e),group);

    const roofMesh=addMesh(
        new THREE.ConeGeometry(12,5,4),
        roof,0,10.8,0,group
    );

    roofMesh.rotation.y=Math.PI/4;

    addBox(0,2,7.1,2.8,4,0.3,door,group);

    [-5,5].forEach(wx=>{

        addBox(wx,5,7.2,3,2.8,0.25,materials.window,group);
        addBox(wx,5,-7.2,3,2.8,0.25,materials.window,group);
    });

    scene.add(group);

    return group;
}

// ============================================================
// 10. APARTMENT — GLB FIRST, PROCEDURAL FALLBACK
// ============================================================

function createApartmentModel(x,z,height=38,color=0x82969a){

    const asset=createAsset('apartment',x,z);

    if(asset) return asset;

    const group=new THREE.Group();

    group.position.set(x,0,z);

    addBox(0,height/2,0,23,height,21,createMaterial(color),group);

    addBox(0,height+0.5,0,25,1,23,createMaterial(0x525d5b),group);

    for(let floor=0;floor<Math.floor(height/4);floor++){

        for(let col=0;col<3;col++){

            const px=-7+col*7;
            const py=3+floor*4;

            addBox(px,py,10.65,4.2,2.4,0.15,materials.window,group);
            addBox(px,py,-10.65,4.2,2.4,0.15,materials.window,group);
        }
    }

    scene.add(group);

    return group;
}

// ============================================================
// 11. FACTORY — GLB FIRST, PROCEDURAL FALLBACK
// ============================================================

function createFactoryModel(x,z){

    const asset=createAsset('factory',x,z);

    if(asset) return asset;

    const group=new THREE.Group();

    group.position.set(x,0,z);

    addBox(0,7,0,35,14,28,createMaterial(0x7d8580),group);

    addBox(0,14.3,0,36,1,29,createMaterial(0x4c5551),group);

    addBox(0,4,14.2,10,8,0.4,createMaterial(0x424d49),group);

    [-13,13].forEach(px=>{

        addMesh(
            new THREE.CylinderGeometry(2,2.5,24,12),
            createMaterial(0x656c68),
            px,25,-8,group
        );
    });

    scene.add(group);

    return group;
}

// ============================================================
// 12. FLOWER GARDEN
// ============================================================

function createFlower(x,z,color=0xe7a5bc,parent=scene){

    const group=new THREE.Group();

    addMesh(
        new THREE.CylinderGeometry(0.06,0.09,1.1,5),
        createMaterial(0x397343),
        0,0.55,0,group
    );

    for(let i=0;i<5;i++){

        const angle=i*Math.PI*2/5;

        addMesh(
            new THREE.SphereGeometry(0.26,8,6),
            createMaterial(color),
            Math.cos(angle)*0.34,
            1.2,
            Math.sin(angle)*0.34,
            group
        );
    }

    addMesh(
        new THREE.SphereGeometry(0.17,8,6),
        createMaterial(0xffd34c),
        0,1.2,0,group
    );

    group.position.set(x,0,z);
    parent.add(group);

    return group;
}

function createFlowerGarden(x,z){

    const group=new THREE.Group();

    for(let i=0;i<9;i++){

        createFlower(
            (Math.random()-.5)*7,
            (Math.random()-.5)*7,
            [0xe7a5bc,0xf0cf67,0xf0e8dc,0xa897dd][i%4],
            group
        );
    }

    group.position.set(x,0,z);
    scene.add(group);

    return group;
}

// ============================================================
// 13. BENCH
// ============================================================

function createBench(x,z){

    const group=new THREE.Group();

    addBox(0,1,0,9,1,2.4,createMaterial(0x84552f),group);
    addBox(0,2.3,-1,9,2.4,0.7,createMaterial(0x9b6841),group);

    [-3.5,3.5].forEach(px=>{
        addBox(px,0.5,0,0.5,1.5,0.5,createMaterial(0x454541),group);
    });

    group.position.set(x,0,z);
    scene.add(group);

    return group;
}

// ============================================================
// 14. SOLAR PANEL
// ============================================================

function createSolarPanel(x,z){

    const group=new THREE.Group();

    addBox(
        0,2,0,11,0.4,7,
        createMaterial(0x22536d,0.25,0.3),
        group
    );

    for(let i=0;i<4;i++){

        addBox(
            -4.5+i*3,2.25,0,
            0.15,0.1,7,
            createMaterial(0xa7d1da),
            group
        );
    }

    [-4,4].forEach(px=>{
        addBox(px,0.9,0,0.4,1.8,0.4,createMaterial(0x747b79),group);
    });

    group.position.set(x,0,z);
    group.rotation.x=-0.18;

    scene.add(group);

    return group;
}

// ============================================================
// 15. STREET LAMP
// ============================================================

function createStreetLamp(x,z){

    const group=new THREE.Group();

    addMesh(
        new THREE.CylinderGeometry(0.2,0.3,10,8),
        createMaterial(0x424a43),
        0,5,0,group
    );

    addBox(1.3,9.8,0,2.7,0.3,0.3,createMaterial(0x424a43),group);

    addMesh(
        new THREE.SphereGeometry(0.55,10,8),
        new THREE.MeshStandardMaterial({
            color:0xffe5a0,
            emissive:0xffc85e,
            emissiveIntensity:0.8
        }),
        2.7,9.7,0,group
    );

    group.position.set(x,0,z);
    scene.add(group);

    return group;
}

// ============================================================
// 16. ROADS
// ============================================================

function createRoad(x, z, length, width, vertical = false) {

    const roadW = vertical ? width : length;
    const roadD = vertical ? length : width;

    const asphalt = makeRoadMaterial(roadW, roadD);
    asphalt.polygonOffset = true;
    asphalt.polygonOffsetFactor = vertical ? -2 : -1;
    asphalt.polygonOffsetUnits = vertical ? -2 : -1;

    const road = addPlane(
        x, 0.085, z,
        roadW, roadD,
        asphalt
    );

    road.castShadow = false;
    road.receiveShadow = false;
    road.renderOrder = 2;

    const white = makeMarkingMaterial(0xe6e6dc);
    const yellow = makeMarkingMaterial(0xe8c65e);
    const curb = makeMarkingMaterial(0x8d908b);

    if (!vertical) {

        [-1, 1].forEach(side => {

            const edgeZ = z + side * (width / 2 + 0.6);

            addBox(
                x, 0.22, edgeZ,
                length, 0.3, 1.2,
                curb
            );

            const sidewalk = addPlane(
                x, 0.24,
                z + side * (width / 2 + 4),
                length, 5,
                makeConcreteMaterial(length, 5)
            );

            sidewalk.receiveShadow = false;

            addBox(
                x, 0.13,
                z + side * (width / 2 - 2),
                length, 0.018, 0.22,
                white
            );
        });

        for (let dx = -length / 2 + 12;
             dx < length / 2 - 4;
             dx += 34) {

            addBox(
                x + dx, 0.135, z,
                15, 0.018, 0.2,
                yellow
            );
        }

    } else {

        [-1, 1].forEach(side => {

            const edgeX = x + side * (width / 2 + 0.6);

            addBox(
                edgeX, 0.22, z,
                1.2, 0.3, length,
                curb
            );

            const sidewalk = addPlane(
                x + side * (width / 2 + 4),
                0.24, z,
                5, length,
                makeConcreteMaterial(5, length)
            );

            sidewalk.receiveShadow = false;

            addBox(
                x + side * (width / 2 - 2),
                0.13, z,
                0.22, 0.018, length,
                white
            );
        });

        for (let dz = -length / 2 + 12;
             dz < length / 2 - 4;
             dz += 34) {

            addBox(
                x, 0.135, z + dz,
                0.2, 0.018, 15,
                yellow
            );
        }
    }

    return road;
}

function createCrosswalk(x, z, vertical = false) {

    const white = makeMarkingMaterial(0xecebe3);

    for (let i = 0; i < 8; i++) {

        const offset = -18 + i * 5;

        if (vertical) {
            addBox(
                x, 0.17, z + offset,
                13, 0.018, 2.8,
                white
            );
        } else {
            addBox(
                x + offset, 0.17, z,
                2.8, 0.018, 13,
                white
            );
        }
    }

    if (vertical) {

        addBox(
            x, 0.17, z - 26,
            16, 0.018, 0.45,
            white
        );

    } else {

        addBox(
            x - 26, 0.17, z,
            0.45, 0.018, 16,
            white
        );
    }
}

function buildRoadNetwork(){

    for(let col=0;col<ZONE_COLUMNS-1;col++){
        const x=ZONE_ORIGIN_X+(col+0.5)*ZONE_SPACING;
        const centerZ=ZONE_ORIGIN_Z+((ZONE_ROWS-1)*ZONE_SPACING)/2;
        createRoad(x,centerZ,ZONE_ROWS*ZONE_SPACING-100,CONFIG.roadWidth,true);
    }

    for(let row=0;row<ZONE_ROWS-1;row++){
        const z=ZONE_ORIGIN_Z+(row+0.5)*ZONE_SPACING;
        const centerX=ZONE_ORIGIN_X+((ZONE_COLUMNS-1)*ZONE_SPACING)/2;
        createRoad(centerX,z,ZONE_COLUMNS*ZONE_SPACING-100,CONFIG.roadWidth);
    }

    districts.forEach(d=>createRoad(d.x,d.z+235,650,22));

    createCrosswalk(-450,-250,true);
    createCrosswalk(350,550,true);
    createCrosswalk(1150,1350,false);
    createCrosswalk(2750,2150,false);
}

// ============================================================
// 17. CAR — GLB FIRST, PROCEDURAL FALLBACK
// ============================================================

function applyCarPaint(mesh,color){
    const excluded=/(glass|window|wheel|tire|rubber|light|lamp|chrome|interior)/i;

    mesh.traverse(child=>{
        if(!child.isMesh||!child.material) return;

        const tintMaterial=material=>{
            const copy=material.clone();
            const label=`${child.name||''} ${material.name||''}`;

            if(copy.color&&!excluded.test(label)){
                const hsl=copy.color.getHSL({h:0,s:0,l:0});
                if(/body|paint|shell|exterior|car/i.test(label) ||
                   (hsl.l>0.28&&(copy.roughness??0.8)>0.28)){
                    copy.color.setHex(color);
                }
            }
            return copy;
        };

        child.material=Array.isArray(child.material)
            ?child.material.map(tintMaterial)
            :tintMaterial(child.material);
    });
}

function createCar(x,z,color=0x347d9a){
    const asset=createAsset('car',x,z);

    if(asset){
        const bounds=new THREE.Box3().setFromObject(asset);
        const size=bounds.getSize(new THREE.Vector3());
        asset.userData.forwardAxis=size.x>=size.z?'x':'z';
        applyCarPaint(asset,color);
        return asset;
    }

    const group=new THREE.Group();
    const body=createMaterial(color,0.32,0.2);

    addBox(0,1.4,0,10,2.2,4.8,body,group);
    addBox(3.4,1.9,0,3.1,0.8,4.5,body,group);
    addBox(-0.8,3,0,4.8,2.3,3.8,createMaterial(0x294653),group);

    const wheelMat=createMaterial(0x191b1b);
    [-3.1,3.1].forEach(px=>{
        [-2.4,2.4].forEach(pz=>{
            const wheel=addMesh(
                new THREE.CylinderGeometry(1,1,0.6,16),
                wheelMat,px,0.95,pz,group
            );
            wheel.rotation.z=Math.PI/2;
        });
    });

    group.position.set(x,0,z);
    group.userData.forwardAxis='x';
    scene.add(group);
    return group;
}

function setCarHeading(mesh,dx,dz){
    if(mesh.userData.forwardAxis==='z'){
        mesh.rotation.y=Math.atan2(dx,dz);
    }else{
        mesh.rotation.y=Math.atan2(-dz,dx);
    }
}

// ============================================================
// 18. TRAFFIC SYSTEM — TWO-WAY, LANE-BASED CITY TRAFFIC
// ============================================================

function createTraffic(){
    const minX=ZONE_ORIGIN_X-ZONE_SPACING/2+30;
    const maxX=ZONE_ORIGIN_X+(ZONE_COLUMNS-1)*ZONE_SPACING+ZONE_SPACING/2-30;
    const minZ=ZONE_ORIGIN_Z-ZONE_SPACING/2+30;
    const maxZ=ZONE_ORIGIN_Z+(ZONE_ROWS-1)*ZONE_SPACING+ZONE_SPACING/2-30;

    const palette=[
        0x1769aa,0xc62828,0xf4f1e8,0x20252b,
        0xd49a22,0x287a4b,0x7b4aa1,0x9b9b9b,
        0x45a4a0,0xe46f32,0x5d6b82,0xc6c9cc
    ];
    let colourIndex=0;

    const addLane=(axis,fixed,direction,min,max,routeIndex)=>{
        const speed=direction*(31+(routeIndex%3)*3);
        const spacing=(max-min)/2.45;

        for(let carIndex=0;carIndex<2;carIndex++){
            const coordinate=direction>0
                ?min+520+carIndex*spacing
                :max-520-carIndex*spacing;

            const x=axis==='x'?coordinate:fixed;
            const z=axis==='x'?fixed:coordinate;
            const colour=palette[colourIndex++%palette.length];
            const car=createCar(x,z,colour);

            setCarHeading(
                car,
                axis==='x'?direction:0,
                axis==='z'?direction:0
            );

            vehicles.push({
                mesh:car,
                path:{axis,fixed,min,max,speed,direction}
            });
        }
    };

    // East/west traffic on three separated arterial roads.
    [0,2,4].forEach((row,index)=>{
        const roadZ=ZONE_ORIGIN_Z+(row+0.5)*ZONE_SPACING;
        addLane('x',roadZ+7,1,minX,maxX,index);
        addLane('x',roadZ-7,-1,minX,maxX,index+1);
    });

    // North/south traffic on three connected avenues.
    [1,4,7].forEach((col,index)=>{
        const roadX=ZONE_ORIGIN_X+(col+0.5)*ZONE_SPACING;
        addLane('z',roadX-7,1,minZ,maxZ,index+2);
        addLane('z',roadX+7,-1,minZ,maxZ,index+1);
    });

    console.log(`EcoQuest traffic: ${vehicles.length} coloured vehicles on marked two-way lanes.`);
}

function updateTraffic(delta){
    vehicles.forEach(({mesh,path})=>{
        const coordinate=path.axis==='x'?mesh.position.x:mesh.position.z;
        let next=coordinate+path.speed*delta;

        if(path.direction>0&&next>path.max){
            next=path.min+(next-path.max);
        }else if(path.direction<0&&next<path.min){
            next=path.max-(path.min-next);
        }

        if(path.axis==='x'){
            mesh.position.x=next;
            mesh.position.z=path.fixed;
        }else{
            mesh.position.z=next;
            mesh.position.x=path.fixed;
        }

        mesh.position.y=getBridgeElevation(path,next);
    });
}

// ============================================================
// 19. RIVER AND LAKE
// ============================================================

function createRiver(x,z){

    const water=addPlane(x,0.13,z,130,450,materials.water);
    water.userData.baseY=0.13;
    waterSurfaces.push(water);

    [-1,1].forEach(side=>{

        addBox(
            x+side*69,0.2,z,
            7,0.4,455,
            createMaterial(0x988b68)
        );
    });

    addBox(x,1.1,z,180,2,23,createMaterial(0x796047));

    [-8,8].forEach(pz=>{
        addBox(x,3,z+pz,180,0.4,0.6,createMaterial(0x5d5144));
    });

    for(let i=0;i<8;i++){

        const ripple=addMesh(
            new THREE.RingGeometry(1.5,2.1,24),
            new THREE.MeshBasicMaterial({
                color:0xb2e3e7,
                transparent:true,
                opacity:0.32,
                side:THREE.DoubleSide
            }),
            x+(Math.random()-.5)*85,
            0.2,
            z+(Math.random()-.5)*380
        );

        ripple.rotation.x=-Math.PI/2;
        waterRipples.push(ripple);
    }
}

function createLake(x,z){

    const lake=addPlane(x,0.14,z,145,100,materials.water);
    lake.userData.baseY=0.14;
    waterSurfaces.push(lake);
}

function createRiverRibbon(curve,halfWidth,segments=420){
    const positions=[];
    const indices=[];
    const leftBank=[];
    const rightBank=[];

    for(let i=0;i<=segments;i++){
        const t=i/segments;
        const center=curve.getPointAt(t);
        const tangent=curve.getTangentAt(t);
        const normal=new THREE.Vector3(-tangent.z,0,tangent.x).normalize();
        const width=halfWidth+Math.sin(t*Math.PI*8)*7;
        const left=center.clone().addScaledVector(normal,width);
        const right=center.clone().addScaledVector(normal,-width);

        positions.push(left.x,0,left.z,right.x,0,right.z);
        leftBank.push(new THREE.Vector3(left.x,0,left.z));
        rightBank.push(new THREE.Vector3(right.x,0,right.z));

        if(i<segments){
            const a=i*2;
            indices.push(a,a+1,a+2,a+1,a+3,a+2);
        }
    }

    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material=materials.water.clone();
    material.side=THREE.DoubleSide;
    material.transparent=false;
    material.opacity=1;
    material.depthWrite=true;
    material.depthTest=true;

    const water=new THREE.Mesh(geometry,material);
    water.position.y=0.18;
    water.userData.baseY=0.18;
    water.receiveShadow=false;
    water.renderOrder=3;
    scene.add(water);
    waterSurfaces.push(water);

    const bankMaterial=createMaterial(0x9b916e,0.95,0);
    [leftBank,rightBank].forEach(points=>{
        const bankCurve=new THREE.CatmullRomCurve3(points);
        const bank=new THREE.Mesh(
            new THREE.TubeGeometry(bankCurve,segments,3,7,false),
            bankMaterial
        );
        bank.position.y=0.12;
        bank.receiveShadow=true;
        scene.add(bank);
    });
}

function createRiverBridge(x,z,axis,span,roadWidth=CONFIG.roadWidth){
    const bridgeWidth=Math.max(34,roadWidth+14);
    const approachLength=84;
    const deckHeight=2.1;
    const deckThickness=1.8;

    const asphalt=makeRoadMaterial(
        axis==='x'?span:bridgeWidth,
        axis==='z'?span:bridgeWidth
    );
    asphalt.polygonOffset=true;
    asphalt.polygonOffsetFactor=-3;
    asphalt.polygonOffsetUnits=-3;

    const concrete=createMaterial(0x777d7b,0.86,0.08);
    const railMaterial=createMaterial(0x555e5d,0.68,0.18);

    addBox(
        x,deckHeight-deckThickness/2,z,
        axis==='x'?span:bridgeWidth,
        deckThickness,
        axis==='z'?span:bridgeWidth,
        concrete
    );

    const deck=addPlane(
        x,deckHeight+0.015,z,
        axis==='x'?span:bridgeWidth,
        axis==='z'?span:bridgeWidth,
        asphalt
    );
    deck.renderOrder=4;

    [-1,1].forEach(side=>{
        if(axis==='x'){
            addBox(x,deckHeight+0.72,z+side*(bridgeWidth/2-1),span,1.35,1.2,railMaterial);
        }else{
            addBox(x+side*(bridgeWidth/2-1),deckHeight+0.72,z,1.2,1.35,span,railMaterial);
        }
    });

    [-0.32,0,0.32].forEach(offset=>{
        if(axis==='x'){
            addBox(x+span*offset,0.98,z,9,1.95,9,concrete);
        }else{
            addBox(x,0.98,z+span*offset,9,1.95,9,concrete);
        }
    });

    const slope=Math.atan2(deckHeight,approachLength);
    [-1,1].forEach(side=>{
        const ramp=addBox(
            axis==='x'?x+side*(span/2+approachLength/2):x,
            deckHeight/2-0.36,
            axis==='z'?z+side*(span/2+approachLength/2):z,
            axis==='x'?approachLength:bridgeWidth,
            0.72,
            axis==='z'?approachLength:bridgeWidth,
            asphalt
        );

        if(axis==='x'){
            ramp.rotation.z=-side*slope;
        }else{
            ramp.rotation.x=side*slope;
        }
    });

    riverBridges.push({
        x,z,axis,span,approachLength,deckHeight,bridgeWidth
    });
}

function buildCityRiver(){
    riverBridges.length=0;

    const riverPoints=[
        [-1250,-1050],[-900,-520],[-350,-180],[250,100],
        [820,560],[1420,760],[1940,470],[2460,650],
        [2920,1120],[3550,1510],[4210,1320],[4740,1650],
        [5290,2220],[5900,2410],[6440,2960],[6900,3650],[7350,4700]
    ].map(([x,z])=>new THREE.Vector3(x,0,z));

    const curve=new THREE.CatmullRomCurve3(riverPoints,false,'centripetal',0.5);
    createRiverRibbon(curve,76,640);

    const sampleCount=960;
    const samples=Array.from(
        {length:sampleCount+1},
        (_,i)=>curve.getPointAt(i/sampleCount)
    );
    const candidates=[];

    const addRoadCrossings=(roadAxis,fixed,min,max,local=false,roadWidth=CONFIG.roadWidth)=>{
        // A single road may intersect a winding river several times.
        // Record every crossing instead of returning after the first one.
        for(let i=0;i<sampleCount;i++){
            const a=samples[i];
            const b=samples[i+1];
            const av=roadAxis==='x'?a.z:a.x;
            const bv=roadAxis==='x'?b.z:b.x;

            if((av-fixed)*(bv-fixed)>0||Math.abs(bv-av)<0.0001) continue;

            const t=(fixed-av)/(bv-av);
            if(t<0||t>1) continue;

            const x=roadAxis==='x'?a.x+(b.x-a.x)*t:fixed;
            const z=roadAxis==='x'?fixed:a.z+(b.z-a.z)*t;
            const along=roadAxis==='x'?x:z;
            if(along<min||along>max) continue;

            const curveT=(i+t)/sampleCount;
            const tangent=curve.getTangentAt(curveT);
            const crossingComponent=roadAxis==='x'
                ?Math.abs(tangent.z)
                :Math.abs(tangent.x);

            if(crossingComponent<0.16) continue;

            // River width plus shoulders and safety margin, projected onto road axis.
            const span=THREE.MathUtils.clamp(
                220/crossingComponent,
                190,
                620
            );

            candidates.push({
                x,z,
                axis:roadAxis,
                span,
                roadWidth,
                local,
                priority:local?1:0,
                crossingComponent
            });
        }
    };

    const minX=ZONE_ORIGIN_X-400;
    const maxX=ZONE_ORIGIN_X+(ZONE_COLUMNS-1)*ZONE_SPACING+400;
    const minZ=ZONE_ORIGIN_Z-400;
    const maxZ=ZONE_ORIGIN_Z+(ZONE_ROWS-1)*ZONE_SPACING+400;

    for(let col=0;col<ZONE_COLUMNS-1;col++){
        const x=ZONE_ORIGIN_X+(col+0.5)*ZONE_SPACING;
        addRoadCrossings('z',x,minZ,maxZ,false,CONFIG.roadWidth);
    }

    for(let row=0;row<ZONE_ROWS-1;row++){
        const z=ZONE_ORIGIN_Z+(row+0.5)*ZONE_SPACING;
        addRoadCrossings('x',z,minX,maxX,false,CONFIG.roadWidth);
    }

    districts.forEach(d=>{
        addRoadCrossings('x',d.z+235,d.x-325,d.x+325,true,22);
    });

    candidates.sort((a,b)=>
        a.priority-b.priority ||
        b.crossingComponent-a.crossingComponent
    );

    const accepted=[];
    candidates.forEach(candidate=>{
        const duplicate=accepted.some(existing=>
            existing.axis===candidate.axis &&
            Math.hypot(existing.x-candidate.x,existing.z-candidate.z)<85
        );
        if(duplicate) return;

        accepted.push(candidate);
        createRiverBridge(
            candidate.x,
            candidate.z,
            candidate.axis,
            candidate.span,
            candidate.roadWidth
        );
    });

    console.log(
        'EcoQuest river: continuous winding channel; '+
        riverBridges.length+' bridge decks cover all detected road crossings.'
    );
}

function getBridgeElevation(path,coordinate){
    for(const bridge of riverBridges){
        if(bridge.axis!==path.axis) continue;

        const crossAxisDistance=path.axis==='x'
            ?Math.abs(path.fixed-bridge.z)
            :Math.abs(path.fixed-bridge.x);
        if(crossAxisDistance>28) continue;

        const center=path.axis==='x'?bridge.x:bridge.z;
        const distance=Math.abs(coordinate-center);
        const deckHalf=bridge.span/2;
        const total=deckHalf+bridge.approachLength;

        if(distance<=deckHalf) return bridge.deckHeight;
        if(distance<=total){
            return bridge.deckHeight*(1-(distance-deckHalf)/bridge.approachLength);
        }
    }
    return 0;
}

function updateWater(time){

    // Water elevation stays fixed so river/lake edges cannot shimmer against roads.
    waterSurfaces.forEach(water=>{
        if(Number.isFinite(water.userData.baseY)){
            water.position.y=water.userData.baseY;
        }
    });

    // Retain the subtle ripple effect without vertically moving the water mesh.
    waterRipples.forEach((r,i)=>{
        const s=1+Math.sin(time*1.5+i)*0.08;
        r.scale.set(s,1,s);
    });
}

// ============================================================
// 20. DISTRICT ENVIRONMENTS
// ============================================================

function createZoneRandom(d,salt=0){
    let state=(Math.imul(d.zoneNo+salt+1,2654435761)+1013904223)>>>0;
    return ()=>{
        state=(Math.imul(state,1664525)+1013904223)>>>0;
        return state/4294967296;
    };
}

function takeZoneSlots(slots,count,random){
    const pool=slots.slice();
    const selected=[];
    while(pool.length&&selected.length<count){
        const index=Math.floor(random()*pool.length);
        selected.push(pool.splice(index,1)[0]);
    }
    return selected;
}

function buildForest(d){
    const random=createZoneRandom(d,11);
    const treeCount=22+Math.floor(random()*21);
    const treeTypes=['oak','oak','pine','blossom'];

    for(let i=0;i<treeCount;i++){
        const angle=random()*Math.PI*2;
        const radius=125+random()*150;
        createTree(
            d.x+Math.cos(angle)*radius,
            d.z+Math.sin(angle)*radius,
            treeTypes[Math.floor(random()*treeTypes.length)],
            0.72+random()*0.72
        );
    }

    const pondSide=random()<0.5?-1:1;
    createLake(
        d.x+pondSide*(155+random()*55),
        d.z+(random()-0.5)*170
    );

    if(random()>0.22){
        createHouseModel(
            d.x-pondSide*(205+random()*25),
            d.z+(random()-0.5)*250,
            [0x9c8062,0xb6a58a,0x879a8b][Math.floor(random()*3)],
            0.85+random()*0.3
        );
    }
}

function buildDowntown(d){
    const random=createZoneRandom(d,23);
    const slots=[
        [-260,-190],[-145,-205],[0,-205],[150,-205],[260,-170],
        [-260,5],[260,5],[-205,195],[-65,205],[95,205],[230,180]
    ];
    const palette=[
        0x718d9b,0x9aaba9,0x738a88,0x9a9286,
        0x657b82,0x8b9cae,0x8e887d,0x879a92
    ];
    const count=4+Math.floor(random()*4);

    takeZoneSlots(slots,count,random).forEach(([dx,dz],index)=>{
        const height=28+Math.floor(random()*48);
        const building=createApartmentModel(
            d.x+dx+(random()-0.5)*24,
            d.z+dz+(random()-0.5)*22,
            height,
            palette[Math.floor(random()*palette.length)]
        );
        if(building) building.rotation.y=(random()-0.5)*0.16;
    });

    if(random()>0.25){
        createHouseModel(
            d.x+(random()-0.5)*180,
            d.z+(random()-0.5)*110,
            [0x9d9b89,0xb7a58f,0x879b91][Math.floor(random()*3)],
            0.8+random()*0.25
        );
    }

    // A distinct paved civic plaza gives each commercial block a different footprint.
    addPlane(
        d.x+(random()-0.5)*70,
        0.065,
        d.z+(random()-0.5)*70,
        115+random()*65,
        90+random()*55,
        materials.sidewalk
    );
}

function buildRiverside(d){
    const random=createZoneRandom(d,37);
    const riverSide=random()<0.5?-1:1;

    const homes=[
        [ -riverSide*220,-175],
        [ -riverSide*220,145],
        [ -riverSide*80,235]
    ];
    const homeCount=2+Math.floor(random()*2);
    takeZoneSlots(homes,homeCount,random).forEach(([dx,dz],index)=>{
        createHouseModel(
            d.x+dx,
            d.z+dz,
            [0xbdb59d,0x8e9e99,0xc5bda9,0x9ba9a0][index],
            0.9+random()*0.28
        );
    });

    for(let i=0;i<5+Math.floor(random()*5);i++){
        const x=d.x-riverSide*(90+random()*80);
        const z=d.z-230+random()*460;
        createTree(x,z,random()<0.35?'pine':'oak',0.8+random()*0.55);
    }
}

function buildPark(d){
    const random=createZoneRandom(d,41);
    const lakeX=d.x+(random()-0.5)*150;
    const lakeZ=d.z+(random()-0.5)*130;
    createLake(lakeX,lakeZ);

    const treeCount=15+Math.floor(random()*15);
    for(let i=0;i<treeCount;i++){
        const angle=random()*Math.PI*2;
        const radius=125+random()*135;
        createTree(
            d.x+Math.cos(angle)*radius,
            d.z+Math.sin(angle)*radius,
            random()<0.28?'blossom':(random()<0.55?'oak':'pine'),
            0.72+random()*0.65
        );
    }

    const flowerCount=14+Math.floor(random()*23);
    const flowerColors=[0xe5a4c3,0xf2d36c,0xece9df,0xa897dd,0xe78d73];
    for(let i=0;i<flowerCount;i++){
        createFlower(
            d.x-215+random()*430,
            d.z-190+random()*380,
            flowerColors[Math.floor(random()*flowerColors.length)]
        );
    }

    if(random()>0.35){
        const pathZ=d.z+(random()-0.5)*260;
        addPlane(d.x,0.06,pathZ,390,7,materials.sidewalk);
    }else{
        const pathX=d.x+(random()-0.5)*260;
        addPlane(pathX,0.06,d.z,7,390,materials.sidewalk);
    }

    createBench(d.x+(random()-0.5)*260,d.z+(random()-0.5)*260);
}

function buildResidential(d){
    const random=createZoneRandom(d,53);
    const houseSlots=[
        [-255,-190],[-90,-205],[90,-205],[255,-190],
        [-255,185],[-90,200],[90,200],[255,185],
        [-245,-5],[245,5]
    ];
    const houseColors=[
        0xd3c3a4,0xb8c7c0,0xc6b09a,0xd6d1bc,
        0xb7a58e,0x9daea2,0xc6bfae,0x8fa09a
    ];
    const count=4+Math.floor(random()*3);
    const selected=takeZoneSlots(houseSlots,count,random);

    selected.forEach(([dx,dz],index)=>{
        createHouseModel(
            d.x+dx+(random()-0.5)*24,
            d.z+dz+(random()-0.5)*24,
            houseColors[Math.floor(random()*houseColors.length)],
            0.88+random()*0.38
        );

        if(random()>0.58){
            createTree(
                d.x+dx+(random()-0.5)*38,
                d.z+dz+35,
                random()<0.4?'blossom':'oak',
                0.7+random()*0.35
            );
        }
    });

    const apartmentCount=Math.floor(random()*3);
    const apartmentSlots=[[-245,0],[245,0],[-120,130],[120,-130]];
    takeZoneSlots(apartmentSlots,apartmentCount,random).forEach(([dx,dz],index)=>{
        createApartmentModel(
            d.x+dx,
            d.z+dz,
            23+Math.floor(random()*15),
            [0x8c9c9b,0xa6a69b,0x879ba5][index%3]
        );
    });
}

function buildIndustrial(d){
    const random=createZoneRandom(d,67);
    const factorySlots=[
        [-245,-180],[0,-205],[245,-180],
        [-245,155],[0,185],[245,155]
    ];
    const factoryCount=2+Math.floor(random()*3);

    takeZoneSlots(factorySlots,factoryCount,random).forEach(([dx,dz])=>{
        const factory=createFactoryModel(d.x+dx,d.z+dz);
        if(factory) factory.rotation.y=(random()-0.5)*0.12;
    });

    // Warehousing, loading yards and storage tanks make the industrial estate varied.
    addBox(
        d.x+(random()-0.5)*100,
        8+random()*3,
        d.z+205,
        75+random()*35,
        16+random()*6,
        48+random()*18,
        createMaterial([0x69726d,0x8b8172,0x777e83][Math.floor(random()*3)])
    );

    const tankCount=2+Math.floor(random()*3);
    for(let i=0;i<tankCount;i++){
        addMesh(
            new THREE.CylinderGeometry(13,13,22+random()*12,16),
            createMaterial([0x9da7a4,0x788b8c,0xa6a18e][i%3],0.65,0.25),
            d.x-145+i*70,
            11,
            d.z+65+(random()-0.5)*35
        );
    }

    const solarCount=3+Math.floor(random()*4);
    for(let i=0;i<solarCount;i++){
        createSolarPanel(
            d.x-190+i*62,
            d.z-65+(random()-0.5)*25
        );
    }

    // A planted buffer separates heavy industry from nearby housing.
    for(let i=0;i<4;i++){
        createTree(
            d.x-285+i*190,
            d.z+285+(random()-0.5)*18,
            i%2?'pine':'oak',
            0.7+random()*0.2
        );
    }
}

function buildFarm(d){
    const random=createZoneRandom(d,79);
    const barnX=d.x+(random()<0.5?-1:1)*(205+random()*30);
    const barnZ=d.z-185+random()*45;
    const barn=new THREE.Group();
    barn.position.set(barnX,0,barnZ);

    const barnColor=[0xa94e3d,0x9e6744,0xb45d48][Math.floor(random()*3)];
    addBox(0,6,0,30,12,23,createMaterial(barnColor),barn);

    const roof=addMesh(
        new THREE.ConeGeometry(20,8,4),
        createMaterial(0x593b30),
        0,15,0,barn
    );
    roof.rotation.y=Math.PI/4;
    scene.add(barn);

    const rows=5+Math.floor(random()*4);
    const columns=9+Math.floor(random()*6);
    const fieldStartX=d.x-170+random()*45;
    const fieldStartZ=d.z-65+random()*35;
    const cropGeometry=new THREE.ConeGeometry(1.3,4,4);
    const cropMaterials=[
        createMaterial(0x729747),
        createMaterial(0x8b9b4c),
        createMaterial(0x668b3f)
    ];

    for(let row=0;row<rows;row++){
        const z=fieldStartZ+row*25;
        addBox(
            d.x+15,0.12,z,
            320,0.12,2,
            createMaterial(0x80623d)
        );

        for(let col=0;col<columns;col++){
            addMesh(
                cropGeometry,
                cropMaterials[(row+col+d.zoneNo)%cropMaterials.length],
                fieldStartX+col*22,
                2,
                z
            );
        }
    }

    const lakeSide=barnX<d.x?1:-1;
    createLake(
        d.x+lakeSide*(215+random()*25),
        d.z+145+(random()-0.5)*55
    );
}

// ============================================================
// 21. BUILDABLE AREAS
// ============================================================

function createBuildGrid(d){

    const columns=5;
    const rows=4;
    const spacing=55;
    const startX=d.x-110;
    const startZ=d.z-82;

    for(let row=0;row<rows;row++){
        for(let col=0;col<columns;col++){
            const x=startX+col*spacing;
            const z=startZ+row*spacing;

            const tile=addPlane(
                x,0.22,z,
                51,51,
                materials.tile
            );

            tile.userData={
                type:'buildTile',
                district:d.id,
                row,
                col,
                x,
                z,
                borderMesh:null
            };
            tile.visible=false;
            buildTiles.push(tile);

            const border=addMesh(
                new THREE.EdgesGeometry(
                    new THREE.BoxGeometry(51,0.12,51)
                ),
                new THREE.LineBasicMaterial({
                    color:0xd3e6a6,
                    transparent:true,
                    opacity:0.3
                }),
                x,0.25,z
            );

            border.userData.decorative=true;
            border.visible=false;
            tile.userData.borderMesh=border;
        }
    }
}

function buildDistricts(){

    districts.forEach(d=>{

        addPlane(
            d.x,0.05,d.z,
            740,740,
            d.type==='park'?materials.parkGrass:materials.grass
        );

        const boundaryMaterial=new THREE.MeshBasicMaterial({
            color:0x315c40,
            transparent:true,
            opacity:0.34
        });
        const halfZone=370;
        addBox(d.x,0.13,d.z-halfZone,740,0.12,2,boundaryMaterial);
        addBox(d.x,0.13,d.z+halfZone,740,0.12,2,boundaryMaterial);
        addBox(d.x-halfZone,0.13,d.z,2,0.12,740,boundaryMaterial);
        addBox(d.x+halfZone,0.13,d.z,2,0.12,740,boundaryMaterial);

        switch(d.type){

            case 'forest':buildForest(d);break;
            case 'downtown':buildDowntown(d);break;
            case 'riverside':buildRiverside(d);break;
            case 'park':buildPark(d);break;
            case 'residential':buildResidential(d);break;
            case 'industrial':buildIndustrial(d);break;
            case 'farm':buildFarm(d);break;
        }

        createBuildGrid(d);

        const canvas=document.createElement('canvas');
        canvas.width=512;
        canvas.height=128;

        const ctx=canvas.getContext('2d');

        ctx.fillStyle='rgba(16,34,22,0.75)';
        ctx.fillRect(0,0,512,128);

        ctx.fillStyle='#ffffff';
        ctx.font='bold 38px Arial';
        ctx.textAlign='center';
        ctx.fillText(d.name.toUpperCase(),256,78);

        const texture=new THREE.CanvasTexture(canvas);

        const label=addMesh(
            new THREE.PlaneGeometry(110,28),
            new THREE.MeshBasicMaterial({
                map:texture,
                transparent:true,
                side:THREE.DoubleSide
            }),
            d.x,45,d.z-285
        );

        label.rotation.x=-Math.PI/2;
    });
}

// ============================================================
// 22. BUILD OBJECT FACTORY
// ============================================================

function createBuildObject(type,x,z){

    switch(type){

        case 'oak':return createTree(x,z,'oak');
        case 'pine':return createTree(x,z,'pine');
        case 'blossom':return createTree(x,z,'blossom');
        case 'flower':return createFlowerGarden(x,z);
        case 'house':return createHouseModel(x,z);
        case 'apartment':return createApartmentModel(x,z,27);
        case 'factory':return createFactoryModel(x,z);
        case 'bench':return createBench(x,z);
        case 'solar':return createSolarPanel(x,z);
        case 'lamp':return createStreetLamp(x,z);

        default:return null;
    }
}

// ============================================================
// 23. PLACEMENT AND REMOVAL
// ============================================================

function findOccupiedTile(tile){

    return placedItems.find(item=>
        item.district===tile.district &&
        item.row===tile.row &&
        item.col===tile.col
    );
}

function getZoneDesignScore(zoneId){
    const items=placedItems.filter(item=>item.district===zoneId);
    if(!items.length) return 0;

    const greenery=items.filter(item=>
        ['oak','pine','blossom','flower'].includes(item.type)
    ).length;
    const amenities=items.filter(item=>
        ['bench','lamp','solar'].includes(item.type)
    ).length;
    const variety=new Set(items.map(item=>item.type)).size;

    return Math.round(
        Math.min(35,greenery*7)+
        Math.min(25,variety*8)+
        Math.min(20,amenities*10)+
        Math.min(20,items.length*2.5)
    );
}

function placeObject(tile){

    const existing=findOccupiedTile(tile);

    if(selectedTool==='remove'){

        if(!existing){
            message('No player-built object on this tile.');
            return;
        }

        removeObject(existing);
        return;
    }

    if(existing){
        message('This tile is occupied. Choose another tile.');
        return;
    }

    const data=tools[selectedTool];

    if(!data) return;

    if(stats.credits<data.cost){
        message(`Not enough credits! You need ${data.cost} credits.`);
        return;
    }

    const object=createBuildObject(selectedTool,tile.x,tile.z);

    if(!object){
        message('Object creation failed.');
        return;
    }

    stats.credits-=data.cost;

    const beforeBuild = { ...stats };
    const afterBuild = applyBuildEffects(stats, data, 1);
    const appliedEffects = {};

    ['green','happiness','pollution','energy','waste'].forEach(key => {
        appliedEffects[key] = afterBuild[key] - beforeBuild[key];
    });

    Object.assign(stats, afterBuild);

    placedItems.push({
        district:tile.district,
        row:tile.row,
        col:tile.col,
        x:tile.x,
        z:tile.z,
        type:selectedTool,
        cost:data.cost,
        effects:appliedEffects,
        object
    });

    const plantingRewards={oak:12,pine:14,blossom:16,flower:7};
    const plantingReward=plantingRewards[selectedTool] || 0;
    stats.credits+=plantingReward;

    const designScore=getZoneDesignScore(tile.district);
    let designBonus=0;
    if(designScore>=80 && !designBonusClaimed.has(tile.district)){
        designBonus=100;
        designBonusClaimed.add(tile.district);
        stats.credits+=designBonus;
    }

    updateEnvironment();

    const district=districts.find(d=>d.id===tile.district);
    const rewards=[];
    if(plantingReward) rewards.push(`+${plantingReward} planting credits`);
    if(designBonus) rewards.push(`🏆 +${designBonus} beautiful-zone design bonus`);
    const rewardText=rewards.length?` ${rewards.join(' · ')}.`:'';

    message(
        `${data.name} built in Zone ${district.zoneNo} — ${district.name}. `+
        `Design score: ${designScore}/100.${rewardText}`
    );
}

function disposeObject(object){

    if(object.userData?.ecoquestAsset) return;

    object.traverse(child=>{
        if(child.geometry) child.geometry.dispose();
    });
}

function removeObject(item){

    scene.remove(item.object);
    disposeObject(item.object);

    placedItems=placedItems.filter(p=>p!==item);

    const data=tools[item.type];

    stats.credits+=Math.floor(item.cost*0.5);

    Object.assign(
        stats,
        applyBuildEffects(stats, item.effects || data, -1)
    );

    updateEnvironment();

    message(`${data.name} removed. 50% refund received.`);
}

// ============================================================
// 24. MOUSE INTERACTION
// ============================================================

function setupInteraction(){

    const raycaster=new THREE.Raycaster();
    const pointer=new THREE.Vector2();

    let downX=0;
    let downY=0;

    renderer.domElement.addEventListener('pointerdown',e=>{
        downX=e.clientX;
        downY=e.clientY;
    });

    renderer.domElement.addEventListener('pointerup',e=>{

        if(Math.hypot(e.clientX-downX,e.clientY-downY)>6) return;

        const rect=renderer.domElement.getBoundingClientRect();

        pointer.x=((e.clientX-rect.left)/rect.width)*2-1;
        pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;

        raycaster.setFromCamera(pointer,camera);

        const hits=raycaster.intersectObjects(buildTiles,false);

        if(!hits.length) return;

        const tile=hits[0].object.userData;

        if(tile.type==='buildTile') placeObject(tile);
    });
}

// ============================================================
// 25. CAMERA
// ============================================================

function setupCamera(){

    controls=new OrbitControls(camera,renderer.domElement);

    controls.enableDamping=true;
    controls.dampingFactor=0.06;
    controls.enablePan=true;
    controls.enableRotate=true;
    controls.enableZoom=true;

    // One-finger drag rotates; two-finger gestures zoom and pan on touchscreens.
    controls.touches.ONE=THREE.TOUCH.ROTATE;
    controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
    controls.screenSpacePanning=true;

    controls.minDistance=60;
    controls.maxDistance=24000;
    controls.minPolarAngle=0.025;
    controls.maxPolarAngle=Math.PI/2.05;

    renderer.domElement.addEventListener('contextmenu',e=>{
        e.preventDefault();
    });

    goToCityOverview();
}

function goToCityOverview(){
    const worldCenterX=ZONE_ORIGIN_X+((ZONE_COLUMNS-1)*ZONE_SPACING)/2;
    const worldCenterZ=ZONE_ORIGIN_Z+((ZONE_ROWS-1)*ZONE_SPACING)/2;
    const worldWidth=ZONE_COLUMNS*ZONE_SPACING+500;
    const worldDepth=ZONE_ROWS*ZONE_SPACING+500;
    const aspect=Math.max(0.5,renderer.domElement.clientWidth/Math.max(1,renderer.domElement.clientHeight));
    const halfFov=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
    const fitForWidth=(worldWidth/2)/(halfFov*aspect);
    const fitForDepth=(worldDepth/2)/halfFov;
    const overviewHeight=Math.max(fitForWidth,fitForDepth)*1.24;

    isCityOverview=true;
    buildTiles.forEach(tile=>{
        tile.visible=false;
        if(tile.userData.borderMesh) tile.userData.borderMesh.visible=false;
    });
    controls.target.set(worldCenterX,0,worldCenterZ);
    camera.position.set(
        worldCenterX+overviewHeight*0.012,
        overviewHeight,
        worldCenterZ+overviewHeight*0.035
    );
    camera.far=45000;
    camera.updateProjectionMatrix();
    controls.update();

    hud['location-label'].textContent='FULL CITY VIEW · 70 UNIQUE CONNECTED ZONES';

    const zoneSelect=document.getElementById('zone-select');
    if(zoneSelect) zoneSelect.value='';

    message('Full city view: all 70 zones are visible. Scroll to zoom, left-drag to rotate, right-drag to pan.');
}

function goToDistrict(id){

    const d=districts.find(item=>item.id===id);
    if(!d) return;

    currentDistrict=id;
    isCityOverview=false;
    buildTiles.forEach(tile=>{
        const active=tile.userData.district===id;
        tile.visible=active;
        if(tile.userData.borderMesh) tile.userData.borderMesh.visible=active;
    });

    controls.target.set(d.x,0,d.z);

    camera.position.set(
        d.x+240,
        350,
        d.z+470
    );

    controls.update();

    hud['location-label'].textContent =
        `ZONE ${String(d.zoneNo).padStart(2,'0')} · ${d.icon} ${d.name}`;

    const zoneSelect=document.getElementById('zone-select');
    if(zoneSelect) zoneSelect.value=id;

    message(`Welcome to Zone ${d.zoneNo}: ${d.name}!`);
}

// ============================================================
// 26. KEYBOARD MOVEMENT
// ============================================================

window.addEventListener('keydown',e=>{
    keys[e.key.toLowerCase()]=true;
});

window.addEventListener('keyup',e=>{
    keys[e.key.toLowerCase()]=false;
});

function updateKeyboard(delta){

    const forward=new THREE.Vector3();

    camera.getWorldDirection(forward);
    forward.y=0;
    forward.normalize();

    const right=new THREE.Vector3()
        .crossVectors(forward,new THREE.Vector3(0,1,0))
        .normalize();

    const forwardInput =
        (keys.w || keys.arrowup ? 1 : 0) -
        (keys.s || keys.arrowdown ? 1 : 0) -
        virtualMove.y;

    const sideInput =
        (keys.d || keys.arrowright ? 1 : 0) -
        (keys.a || keys.arrowleft ? 1 : 0) +
        virtualMove.x;

    const movement=new THREE.Vector3();
    movement.addScaledVector(forward,forwardInput);
    movement.addScaledVector(right,sideInput);

    if(movement.lengthSq()>0){

        movement.normalize().multiplyScalar(CONFIG.cameraSpeed*delta);

        controls.target.add(movement);
        camera.position.add(movement);
    }
}

// ============================================================
// MOBILE TOUCH MOVEMENT
// ============================================================

function setupMobileControls(){

    const joystick=document.getElementById('mobile-joystick');
    const knob=document.getElementById('mobile-joystick-knob');

    if(!joystick || !knob) return;

    let activePointerId=null;

    const resetJoystick=()=>{
        activePointerId=null;
        virtualMove.x=0;
        virtualMove.y=0;
        knob.style.transform='translate(-50%,-50%)';
    };

    const updateJoystick=(event)=>{

        const rect=joystick.getBoundingClientRect();
        const maxRadius=rect.width*0.31;

        let dx=event.clientX-(rect.left+rect.width/2);
        let dy=event.clientY-(rect.top+rect.height/2);

        const distance=Math.hypot(dx,dy);

        if(distance>maxRadius){
            const scale=maxRadius/distance;
            dx*=scale;
            dy*=scale;
        }

        virtualMove.x=THREE.MathUtils.clamp(dx/maxRadius,-1,1);
        virtualMove.y=THREE.MathUtils.clamp(dy/maxRadius,-1,1);

        knob.style.transform=
            `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`;
    };

    joystick.addEventListener('pointerdown',event=>{

        if(event.pointerType==='mouse' && event.button!==0) return;

        event.preventDefault();
        event.stopPropagation();

        activePointerId=event.pointerId;

        if(joystick.setPointerCapture){
            joystick.setPointerCapture(event.pointerId);
        }

        updateJoystick(event);
    });

    joystick.addEventListener('pointermove',event=>{

        if(activePointerId!==event.pointerId) return;

        event.preventDefault();
        event.stopPropagation();

        updateJoystick(event);
    });

    const releaseJoystick=event=>{

        if(activePointerId!==event.pointerId) return;

        event.preventDefault();
        resetJoystick();
    };

    joystick.addEventListener('pointerup',releaseJoystick);
    joystick.addEventListener('pointercancel',releaseJoystick);
    joystick.addEventListener('lostpointercapture',event=>{
        if(activePointerId===event.pointerId) resetJoystick();
    });

    window.addEventListener('blur',resetJoystick);
}

// ============================================================
// 27. RAIN SYSTEM
// ============================================================

function createRain(){

    const count=CONFIG.rainCount;

    rainArray=new Float32Array(count*3);

    for(let i=0;i<count;i++){

        rainArray[i*3]=(Math.random()-.5)*1100;
        rainArray[i*3+1]=Math.random()*600;
        rainArray[i*3+2]=(Math.random()-.5)*1100;
    }

    const geometry=new THREE.BufferGeometry();

    geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(rainArray,3)
    );

    rainSystem=new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
            color:0xcceafa,
            size:1.7,
            transparent:true,
            opacity:0.7
        })
    );

    rainSystem.visible=false;
    scene.add(rainSystem);
}

function updateRain(delta){

    if(!rainSystem) return;

    rainSystem.visible=stats.rainfall>0;

    if(!rainSystem.visible) return;

    const positions=rainSystem.geometry.attributes.position.array;
    const speed=550*delta*(stats.rainfall/100);

    for(let i=0;i<positions.length/3;i++){

        positions[i*3+1]-=speed;

        if(positions[i*3+1]<0){
            positions[i*3+1]=500+Math.random()*150;
        }
    }

    rainSystem.geometry.attributes.position.needsUpdate=true;

    rainSystem.position.set(
        controls.target.x,0,controls.target.z
    );
}

// ============================================================
// 28. FLOOD SYSTEM
// ============================================================

function createFloodSystem(){

    districts.forEach(d=>{

        const flood=addPlane(
            d.x,0.25,d.z,
            650,650,
            new THREE.MeshPhysicalMaterial({
                color:0x1686b9,
                transparent:true,
                opacity:0.28,
                roughness:0.2,
                depthWrite:false,
                side:THREE.DoubleSide
            })
        );

        flood.visible=false;
        floodSurfaces.push(flood);
    });
}

function updateFlood(){

    const risk = THREE.MathUtils.clamp(
        Number(stats.floodRisk) || 0,
        0,
        100
    );

    // Convert ML-adjusted flood risk into
    // a target water level.

    floodTargetLevel = THREE.MathUtils.clamp(
        (risk - 35) / 65,
        0,
        1
    );
}


// Smooth dynamic flood animation.
// Called continuously from the main game loop.

function updateFloodAnimation(delta){

    const dt = THREE.MathUtils.clamp(
        Number(delta) || 0,
        0,
        0.05
    );

    const isRising =
        floodTargetLevel > floodVisualLevel;

    const drainageFactor =
        THREE.MathUtils.clamp(
            stats.drainage / 100,
            0,
            1
        );

    // Rain increases the rising speed.
    const riseSpeed =
        0.8 + (stats.rainfall / 100) * 1.2;

    // Better drainage increases water removal speed.
    const drainSpeed =
        0.15 + drainageFactor * 0.75;

    const speed = isRising
        ? riseSpeed
        : drainSpeed;

    // Frame-rate independent smooth interpolation.
    const blend = 1 - Math.exp(-speed * dt);

    floodVisualLevel +=
        (floodTargetLevel - floodVisualLevel) * blend;

    if (
        Math.abs(floodTargetLevel - floodVisualLevel) < 0.001
    ) {
        floodVisualLevel = floodTargetLevel;
    }

    // Update existing Three.js flood surfaces.
    floodSurfaces.forEach(mesh => {

        const level = floodVisualLevel;

        mesh.visible = level > 0.012;

        if (!mesh.visible) {

            mesh.position.y = 0.25;
            mesh.material.opacity = 0;

            return;
        }

        // Water rises vertically.
        mesh.position.y = 0.25 + level * 0.85;

        // Water opacity increases with flood level.
        mesh.material.opacity =
            THREE.MathUtils.clamp(
                0.04 + level * 0.24,
                0.04,
                0.28
            );
    });
}

// ============================================================
// 29. ENVIRONMENT AND HUD
// ============================================================

function updateMLAreaIndicator() {

    const stage = document.querySelector('.game-stage');
    if (!stage) return;

    if (getComputedStyle(stage).position === 'static') {
        stage.style.position = 'relative';
    }

    let indicator =
        document.getElementById('ml-game-area-indicator');

    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'ml-game-area-indicator';

        indicator.style.cssText = [
            'position:absolute',
            'left:12px',
            'bottom:12px',
            'z-index:9',
            'max-width:calc(100% - 24px)',
            'padding:8px 12px',
            'border:1px solid rgba(151,220,170,.45)',
            'border-radius:8px',
            'background:rgba(10,35,24,.88)',
            'color:#e9f8ed',
            'font:700 11px Arial,sans-serif',
            'pointer-events:none'
        ].join(';');

        stage.appendChild(indicator);
    }

    indicator.style.bottom =
        window.matchMedia('(max-width:700px), (pointer:coarse)').matches
            ? '138px'
            : '12px';

    if (!selectedMLArea) {
        indicator.hidden = true;
        return;
    }

    const meanScore = THREE.MathUtils.clamp(
        Number(selectedMLArea.mean_score) || 0,
        0, 1
    );

    const highShare = THREE.MathUtils.clamp(
        (Number(selectedMLArea.high_very_high_pct) || 0) / 100,
        0, 1
    );

    const index = Math.round(
        (meanScore + highShare) * 50
    );

    indicator.textContent =
        `ML AREA: ${selectedMLArea.upazila}, ${selectedMLArea.district} | INDEX ${index}%`;

    indicator.hidden = false;
}

function renderHUD(){

    const values={
        credits:stats.credits,
        pollution:(stats.effectivePollution ?? stats.pollution)+'%',
        happiness:stats.happiness+'%',
        green:(stats.effectiveGreen ?? stats.green)+'%',
        rainfall:stats.rainfall+'%',
        'flood-risk':stats.floodRisk+'%',
        drainage:stats.drainage+'%',
        energy:stats.energy+'%',
        waste:stats.waste+'%',
        'industry-pressure':(stats.industryPressure || 0)+'%',
        'runoff-pressure':(stats.runoffPressure || 0)+'%'
    };

    Object.entries(values).forEach(([id,value])=>{
        if(hud[id]) hud[id].textContent=value;
    });

    const score=(
        stats.green+
        stats.happiness+
        (100-stats.pollution)+
        stats.drainage+
        stats.energy
    )/5;

    stats.level=score>=90?5:
        score>=80?4:
            score>=70?3:
                score>=55?2:1;

    hud.level.textContent=String(stats.level).padStart(2,'0');

    hud['risk-card'].classList.remove('warning','danger');

    if(stats.floodRisk>=70){
        hud['risk-card'].classList.add('danger');
    }else if(stats.floodRisk>=40){
        hud['risk-card'].classList.add('warning');
    }

    document.querySelectorAll('[data-tool]').forEach(btn=>{
        btn.classList.toggle('active',btn.dataset.tool===selectedTool);
    });

    hud['selected-tool'].textContent=
        selectedTool==='remove'
            ?'Selected: Remove Tool'
            :'Selected: '+tools[selectedTool].name;

    updateMLAreaIndicator();
}


function updateEnvironment(){

    // Derive city-wide consequences from player-built structures
    // and the current weather / infrastructure indicators.
    const consequences = calculateEnvironmentalConsequences({
        stats,
        placedItems,
        selectedMLArea
    });

    stats.industryPressure = consequences.industryPressure;
    stats.imperviousSurface = consequences.imperviousSurface;
    stats.greenInfiltration = consequences.greenInfiltration;
    stats.runoffPressure = consequences.runoffPressure;
    stats.effectivePollution = consequences.effectivePollution;
    stats.effectiveGreen = consequences.effectiveGreen;
    stats.floodRisk = consequences.floodRisk;

    updateFlood();

    if (lightingSystem) {
        lightingSystem.setRainIntensity(stats.rainfall);
    }

    renderHUD();

    // Keep the explainable assistant and missions synchronized
    // with the same derived environmental indicators.
    if (environmentAssistant) {
        environmentAssistant.update();
    }

    if (missionSystem) {
        missionSystem.update();
    }
}


// ============================================================
// 30. WEATHER ACTIONS
// ============================================================

function simulateRain(){

    if(stats.rainfall>=100){
        message('Maximum rainfall reached. Clear the weather.');
        return;
    }

    stats.rainfall=Math.min(100,stats.rainfall+25);

    updateEnvironment();

    if(stats.floodRisk>=70){
        message('CRITICAL FLOOD WARNING! Upgrade drainage.');
    }else if(stats.floodRisk>=40){
        message('Flood risk increasing. Monitor water level.');
    }else{
        message('Rain simulation started.');
    }
}

function clearWeather(){

    stats.rainfall=0;
    updateEnvironment();

    message('Weather cleared.');
}

function improveDrainage(){

    if(stats.credits<20){
        message('You need 20 credits for drainage improvement.');
        return;
    }

    if(stats.drainage>=100){
        message('Drainage already at maximum capacity.');
        return;
    }

    stats.credits-=20;
    stats.drainage=Math.min(100,stats.drainage+15);

    const drainageReward=25;
    stats.credits+=drainageReward;

    updateEnvironment();
    message(`Drainage system upgraded! +${drainageReward} bonus credits.`);
}

function cleanCity(){

    if(stats.credits<25){
        message('You need 25 credits for city cleanup.');
        return;
    }

    stats.credits-=25;
    stats.pollution=Math.max(0,stats.pollution-8);
    stats.waste=Math.max(0,stats.waste-10);
    stats.happiness=Math.min(100,stats.happiness+3);

    updateEnvironment();
    message('City cleanup completed!');
}

// ============================================================
// 31. ECONOMY
// ============================================================

function updateEconomy(){

    const score = getCitySustainabilityScore(stats);

    if(score>=60) stats.credits+=2;

    renderHUD();
}

// ============================================================
// 32. SAVE AND LOAD
// ============================================================

function saveGame(){

    try{

        const data={
            stats,
            designBonusClaimed:[...designBonusClaimed],
            placedItems:placedItems.map(item=>({
                district:item.district,
                row:item.row,
                col:item.col,
                x:item.x,
                z:item.z,
                type:item.type,
                cost:item.cost,
                effects:item.effects || null
            })),
            missions: missionSystem ? missionSystem.getSaveData() : null,
            currentDistrict
        };

        localStorage.setItem(CONFIG.saveKey,JSON.stringify(data));

        message('Game saved successfully!');

    }catch(error){

        console.error(error);
        message('Save failed. Check browser storage.');
    }
}

function loadGame(){

    try{

        const raw=localStorage.getItem(CONFIG.saveKey);

        if(!raw){
            message('No saved game found.');
            return;
        }

        const data=JSON.parse(raw);

        placedItems.forEach(item=>{
            scene.remove(item.object);
            disposeObject(item.object);
        });

        placedItems=[];

        Object.assign(stats,data.stats);

        // Re-map saved builds to the new zone plan using their world coordinates.
        // This keeps older saves in the same physical part of the city.
        designBonusClaimed.clear();

        (data.placedItems||[]).forEach(saved=>{

            if(!tools[saved.type]) return;

            const nearestDistrict=districts.reduce((closest,district)=>{
                const distance=
                    (district.x-saved.x)**2+
                    (district.z-saved.z)**2;

                return !closest||distance<closest.distance
                    ?{id:district.id,distance}
                    :closest;
            },null);

            const object=createBuildObject(
                saved.type,saved.x,saved.z
            );

            if(!object) return;

            placedItems.push({
                ...saved,
                district:nearestDistrict?.id||saved.district,
                object
            });
        });

        // Existing high-score zones have already earned their one-time bonus.
        const restoredZoneIds=new Set(
            placedItems.map(item=>item.district)
        );

        restoredZoneIds.forEach(id=>{
            if(getZoneDesignScore(id)>=80){
                designBonusClaimed.add(id);
            }
        });

        if (missionSystem) {
            missionSystem.loadSaveData(data.missions);
        }

        updateEnvironment();

        goToDistrict(
            districts.some(d=>d.id===data.currentDistrict)
                ?data.currentDistrict
                :'central'
        );

        message('Saved game loaded successfully!');

    }catch(error){

        console.error(error);
        message('Could not load saved game.');
    }
}

// ============================================================
// 33. RESET GAME
// ============================================================

function resetGame(){

    placedItems.forEach(item=>{
        scene.remove(item.object);
        disposeObject(item.object);
    });

    placedItems=[];
    designBonusClaimed.clear();

    Object.assign(stats,{
        credits:500,
        pollution:38,
        happiness:65,
        green:32,
        rainfall:0,
        floodRisk:0,
        drainage:55,
        energy:45,
        waste:30,
        level:1
    });

    selectedTool='oak';

    if (missionSystem) {
        missionSystem.reset();
    }

    updateEnvironment();
    goToDistrict('central');

    message('City simulation reset!');
}

// ============================================================
// 34. LIGHTING
// ============================================================

function setupLighting() {

    lightingSystem = createLightingSystem({
        scene,
        renderer,
        camera,
        initialPreset: 'noon'
    });

    console.log('EcoQuest lighting system initialized.');
}

// ============================================================
// 35. CAMERA BUTTONS
// ============================================================

function setupCameraButtons(){

    document.getElementById('zoom-in').addEventListener('click',()=>{

        camera.position.sub(controls.target)
            .multiplyScalar(0.88)
            .add(controls.target);

        controls.update();
    });

    document.getElementById('zoom-out').addEventListener('click',()=>{

        camera.position.sub(controls.target)
            .multiplyScalar(1.12)
            .add(controls.target);

        controls.update();
    });

    document.getElementById('camera-reset').addEventListener('click',()=>{
        goToDistrict(currentDistrict);
    });

    document.getElementById('camera-overview').addEventListener('click',()=>{
        goToCityOverview();
    });
}

// ============================================================
// 36. INTERFACE EVENTS
// ============================================================

function setupInterfaceEvents(){

    // Receive selected Upazila from the ML map.
    setMLMapSelectionHandler((properties) => {

        if (!properties) {
            selectedMLArea = null;

            updateEnvironment();

            message(
                'ML area cleared. Standard game risk restored.'
            );

            return;
        }

        const meanScore = Number(properties.mean_score);
        const highShare = Number(properties.high_very_high_pct);

        selectedMLArea = {
            district: String(properties.district || ''),
            upazila: String(properties.upazila || ''),
            mean_score: Number.isFinite(meanScore)
                ? meanScore : 0,
            high_very_high_pct: Number.isFinite(highShare)
                ? highShare : 0,
            dominant_class:
                String(properties.dominant_class || 'Unknown')
        };

        updateEnvironment();

        const index = Math.round(
            (
                THREE.MathUtils.clamp(
                    selectedMLArea.mean_score, 0, 1
                ) +
                THREE.MathUtils.clamp(
                    selectedMLArea.high_very_high_pct / 100,
                    0, 1
                )
            ) * 50
        );

        message(
            `ML area active: ${selectedMLArea.upazila}, ` +
            `${selectedMLArea.district} | ` +
            `${selectedMLArea.dominant_class} | ` +
            `Susceptibility index: ${index}%`
        );
    });

    const zoneSelect=document.getElementById('zone-select');
    if(zoneSelect){
        zoneSelect.addEventListener('change',()=>{
            if(zoneSelect.value){
                goToDistrict(zoneSelect.value);
            }else{
                goToCityOverview();
            }
        });
    }

    document.querySelectorAll('[data-tool]').forEach(btn=>{

        btn.addEventListener('click',()=>{

            selectedTool=btn.dataset.tool;

            renderHUD();

            message(
                selectedTool==='remove'
                    ?'Click a player-built tile to remove it.'
                    :tools[selectedTool].name+' selected.'
            );
        });
    });

    document.querySelectorAll('[data-action]').forEach(btn=>{

        btn.addEventListener('click',()=>{

            switch(btn.dataset.action){

                case 'rain':simulateRain();break;
                case 'clear':clearWeather();break;
                case 'drainage':improveDrainage();break;
                case 'clean':cleanCity();break;
                case 'save':saveGame();break;
                case 'load':loadGame();break;
                case 'reset':resetGame();break;
            }
        });
    });

    const mlMapButton = document.getElementById("ml-map-open-btn");

    if (mlMapButton) {
        mlMapButton.addEventListener("click", () => {
            openMLMap();
        });
    }

    setupCameraButtons();
}

// ============================================================
// DAY / NIGHT LIGHTING CONTROL BUTTONS
// ============================================================

function setupLightingControls() {

    const gameStage=document.querySelector('.game-stage');

    if(!gameStage || gameStage.querySelector('.eco-light-controls')){
        return;
    }

    const style=document.createElement('style');

    style.textContent=`
        .eco-light-controls {
            position:absolute;
            z-index:8;
            top:55px;
            left:12px;
            display:flex;
            flex-wrap:wrap;
            gap:5px;
            max-width:min(500px,75%);
            padding:7px;
            border:1px solid rgba(210,235,210,.3);
            border-radius:10px;
            background:rgba(15,33,24,.88);
            backdrop-filter:blur(8px);
        }

        .eco-light-btn {
            padding:8px 11px;
            border:1px solid #547558;
            border-radius:7px;
            background:#294634;
            color:#eaf4e8;
            cursor:pointer;
            font-size:10px;
            font-weight:800;
        }

        .eco-light-btn:hover {
            background:#3d6947;
        }

        .eco-light-btn.active {
            border-color:#b9f1a7;
            background:#438b4a;
            color:white;
        }

        @media(max-width:600px) {
            .eco-light-controls {
                max-width:72%;
            }

            .eco-light-btn {
                padding:6px;
                font-size:9px;
            }
        }
    `;

    document.head.appendChild(style);

    const panel=document.createElement('div');
    panel.className='eco-light-controls';

    const presets=[
        {id:'morning',label:'🌅 Morning'},
        {id:'noon',label:'☀️ Noon'},
        {id:'sunset',label:'🌇 Sunset'},
        {id:'night',label:'🌙 Night'}
    ];

    presets.forEach(preset=>{

        const button=document.createElement('button');

        button.type='button';
        button.className='eco-light-btn';
        button.textContent=preset.label;

        button.classList.toggle(
            'active',
            preset.id==='noon'
        );

        button.addEventListener('click',()=>{

            if(!lightingSystem) return;

            lightingSystem.setPreset(preset.id);

            panel.querySelectorAll('.eco-light-btn').forEach(btn=>{
                btn.classList.remove('active');
            });

            button.classList.add('active');

            message(`Lighting changed to ${preset.label}.`);
        });

        panel.appendChild(button);
    });

    gameStage.appendChild(panel);
}

// ============================================================
// 37. MAIN GAME INITIALIZATION
// ============================================================

async function initializeGame(){

    const container=document.getElementById('city-game');

    try{

        scene=new THREE.Scene();

        scene.background=new THREE.Color(0x9db8c0);
        scene.fog=new THREE.Fog(0x9db8c0,18000,38000);

        camera=new THREE.PerspectiveCamera(
            48,
            container.clientWidth/container.clientHeight,
            0.1,
            45000
        );

        renderer=new THREE.WebGLRenderer({
            antialias:!IS_TOUCH_DEVICE,
            powerPreference:'high-performance'
        });

        renderer.setSize(
            container.clientWidth,
            container.clientHeight
        );

        renderer.setPixelRatio(
            Math.min(
                window.devicePixelRatio,
                IS_TOUCH_DEVICE ? 1.2 : 1.5
            )
        );

        // Keep the city responsive on mobile GPUs while preserving desktop shadows.
        renderer.shadowMap.enabled=!IS_TOUCH_DEVICE;
        renderer.shadowMap.type=IS_TOUCH_DEVICE
            ? THREE.BasicShadowMap
            : THREE.PCFSoftShadowMap;

        renderer.outputColorSpace=THREE.SRGBColorSpace;
        renderer.toneMapping=THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure=1.15;

        container.appendChild(renderer.domElement);

        clock=new THREE.Clock();

        // Initialize scene materials.
        initializeMaterials();

        // Initialize the new lighting system.
        setupLighting();

        // Load realistic GLB models before world generation.
        message('Loading realistic 3D models...');

        modelLibrary=new ModelLibrary(
            scene,
            message,
            renderer
        );

        const loadedCount=await modelLibrary.preload();

        console.log(
            'EcoQuest asset report:',
            modelLibrary.getReport()
        );

        // Continuous ground covering the complete 10 x 7 zone world.
        const worldCenterX=ZONE_ORIGIN_X+((ZONE_COLUMNS-1)*ZONE_SPACING)/2;
        const worldCenterZ=ZONE_ORIGIN_Z+((ZONE_ROWS-1)*ZONE_SPACING)/2;

        addPlane(
            worldCenterX,-0.3,worldCenterZ,
            ZONE_COLUMNS*ZONE_SPACING+500,
            ZONE_ROWS*ZONE_SPACING+500,
            materials.grass
        );

        // Generate the road grid and all 70 zones.
        buildRoadNetwork();
        buildDistricts();

        // Add procedural vegetation.
        createNaturalTerrain(scene,districts);

        // One winding river crosses the city; bridges are placed at road crossings.
        buildCityRiver();

        // Street furniture.
        districts.forEach(d=>{

            for(let i=0;i<4;i++){

                createStreetLamp(
                    d.x-270+i*180,
                    d.z+210
                );
            }
        });

        // Gameplay systems.
        createTraffic();
        createRain();
        createFloodSystem();

        // Camera and interactions.
        setupCamera();
        setupInteraction();
        setupInterfaceEvents();
        setupMobileControls();

        // Morning / Noon / Sunset / Night buttons.
        setupLightingControls();

        // Initialize the proposal-aligned environmental mission system.
        missionSystem = createMissionSystem({
            stage: document.querySelector('.game-stage'),
            getStats: () => ({ ...stats }),
            onReward: (reward) => {
                stats.credits += reward;
                renderHUD();
            },
            onMessage: (text) => message(text)
        });

        // Initialize explainable environmental assistant.
        environmentAssistant = createEnvironmentAssistant({
            getStats: () => ({
                ...stats,
                placedItems: placedItems.map(item => ({ type: item.type })),
                selectedMLArea: selectedMLArea
                    ? { ...selectedMLArea }
                    : null
            })
        });
        // Apply current weather to lighting.
        lightingSystem.setRainIntensity(stats.rainfall);

        // Responsive canvas.
        const resizeObserver=new ResizeObserver(()=>{

            const width=container.clientWidth;
            const height=container.clientHeight;

            if(!width || !height) return;

            camera.aspect=width/height;
            camera.updateProjectionMatrix();

            renderer.setSize(width,height);

            if(isCityOverview&&controls){
                goToCityOverview();
            }
        });

        resizeObserver.observe(container);

        updateEnvironment();

        message(
            `${loadedCount}/7 realistic models loaded. EcoQuest is ready!`
        );

        console.log('EcoQuest 3D initialized.');
        console.log('Three.js version:',THREE.REVISION);

        animate();

    }catch(error){

        console.error(
            'EcoQuest initialization error:',
            error
        );

        container.innerHTML=`
            <div style="padding:30px;color:white">
                <h2>3D Game Initialization Failed</h2>
                <p>${error.message}</p>
                <p>Check the browser console.</p>
            </div>
        `;
    }
}

// ============================================================
// 38. MAIN ANIMATION LOOP
// ============================================================

function animate(){

    requestAnimationFrame(animate);

    const delta=Math.min(clock.getDelta(),0.05);
    const time=clock.elapsedTime;

    updateKeyboard(delta);

    controls.update();

    // Dynamic atmosphere, sky, sun and shadows.
    if(lightingSystem){

        lightingSystem.update(
            delta,
            controls.target
        );
    }

    // Traffic and weather simulation.
    updateTraffic(delta);
    updateRain(delta);
    updateWater(time);

    // Dynamic ML-based flood simulation.
    updateFloodAnimation(delta);

    // Economy update.
    economyTimer+=delta;

    if(economyTimer>=10){

        updateEconomy();

        economyTimer=0;
    }

    // Render final scene.
    renderer.render(scene,camera);
}

// ============================================================
// 39. START ECOQUEST
// ============================================================

initializeGame();

