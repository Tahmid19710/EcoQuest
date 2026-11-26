
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ModelLibrary } from './model-loader.js';
import { createNaturalTerrain } from './terrain-system.js';
import { createLightingSystem } from './lighting-system.js';
import { createEnvironmentAssistant } from './environment-assistant.js';
import { createMissionSystem } from './mission-system.js';
import { calculateEnvironmentalConsequences } from './environmental-consequences.js';
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

// Currently selected ML Upazila.
let selectedMLArea = null;

// ============================================================
// 1. CONFIGURATION
// ============================================================

const CONFIG = {
    roadWidth: 38,
    rainCount: 2500,
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

const districts = [
    {id:'forest',name:'Green Forest',icon:'🌲',x:-850,z:-650,type:'forest'},
    {id:'downtown',name:'Downtown',icon:'🏙️',x:0,z:-650,type:'downtown'},
    {id:'riverside',name:'Riverside',icon:'🌊',x:850,z:-650,type:'riverside'},
    {id:'central',name:'Central Park',icon:'🌳',x:-850,z:0,type:'park'},
    {id:'residential',name:'Residential',icon:'🏡',x:0,z:0,type:'residential'},
    {id:'industrial',name:'Industrial Zone',icon:'🏭',x:850,z:0,type:'industrial'},
    {id:'farm',name:'Farm & Lake',icon:'🌾',x:0,z:650,type:'farm'}
];

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

let placedItems = [];
let buildTiles = [];
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
#city-game canvas{display:block;width:100%;height:100%}

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
.game-alert{top:12px;right:12px;color:#9df3a4}

.camera-controls{
 position:absolute;
 top:54px;
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

@media(max-width:550px){
 .stats-strip{grid-template-columns:repeat(2,minmax(0,1fr))}
 .eco-shell{padding:2px}
 .brand{width:100%}
 .game-stage{height:65vh;min-height:430px}
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
   ${districts.map(d=>`
    <button class="nav-btn ${d.id==='central'?'active':''}" data-district="${d.id}">
     ${d.icon} ${d.name}
    </button>
   `).join('')}
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
   <div class="stage-location" id="location-label">🌳 Central Park</div>
   <div class="game-alert">● LIVE 3D SIMULATION</div>

   <div class="camera-controls">
    <button id="zoom-in">+</button>
    <button id="zoom-out">−</button>
    <button id="camera-reset">⌂</button>
   </div>

   <div class="movement-hint">
    WASD: Move · Drag: Rotate · Right Drag: Pan · Scroll: Zoom
   </div>

   <div id="city-game"></div>
  </section>

  <footer class="game-footer">
   <div id="status">Loading EcoQuest...</div>
   <div class="footer-info">
    LEVEL <strong id="level">01</strong> · 7 CONNECTED DISTRICTS
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
    for (let i = 0; i < 7000; i++) {

        const x = Math.random() * 512;
        const y = Math.random() * 512;

        const light = Math.random() > 0.5;

        ctx.fillStyle = light
            ? `rgba(195,210,150,${Math.random() * 0.045})`
            : `rgba(35,55,30,${Math.random() * 0.045})`;

        ctx.fillRect(
            x,
            y,
            Math.random() * 4 + 1,
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
        map:noiseTexture('#738d56',14),
        roughness:1
    });

    materials.parkGrass=new THREE.MeshStandardMaterial({
        map:noiseTexture('#638e4a',12),
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

    const road = addPlane(
        x, 0.085, z,
        roadW, roadD,
        asphalt
    );

    road.castShadow = false;
    road.receiveShadow = false;

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

    [-325,325].forEach(z=>{
        createRoad(0,z,3000,CONFIG.roadWidth);
    });

    [-425,425].forEach(x=>{
        createRoad(x,0,2600,CONFIG.roadWidth,true);
    });

    districts.forEach(d=>{
        createRoad(d.x,d.z+235,650,22);
    });

    createCrosswalk(-425,-325,true);
    createCrosswalk(425,325,true);
    createCrosswalk(0,-325,false);
    createCrosswalk(0,325,false);
}

// ============================================================
// 17. CAR — GLB FIRST, PROCEDURAL FALLBACK
// ============================================================

function createCar(x,z,color=0x347d9a){

    const asset=createAsset('car',x,z);

    if(asset) return asset;

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
    scene.add(group);

    return group;
}

// ============================================================
// 18. TRAFFIC SYSTEM
// ============================================================

function createTraffic(){

    const paths=[
        {x:-1450,z:-325,end:1450,speed:20,color:0x377d9c},
        {x:1450,z:325,end:-1450,speed:-16,color:0xc18b4c},
        {x:-1450,z:325,end:1450,speed:13,color:0x6e8b62},
        {x:1450,z:-325,end:-1450,speed:-18,color:0x9a5550},
        {x:-425,z:-1250,end:1250,speed:14,color:0x8d9292},
        {x:425,z:1250,end:-1250,speed:-12,color:0x9c9b77}
    ];

    paths.forEach((p,i)=>{

        const car=createCar(p.x,p.z,p.color);
        const vertical=i>=4;

        if(vertical) car.rotation.y=Math.PI/2;
        else if(p.speed<0) car.rotation.y=Math.PI;

        vehicles.push({mesh:car,path:p,vertical});
    });
}

function updateTraffic(delta){

    vehicles.forEach(({mesh,path,vertical})=>{

        if(vertical){

            mesh.position.z+=path.speed*delta;

            if(path.speed>0&&mesh.position.z>path.end) mesh.position.z=-1300;
            if(path.speed<0&&mesh.position.z<path.end) mesh.position.z=1300;

        }else{

            mesh.position.x+=path.speed*delta;

            if(path.speed>0&&mesh.position.x>path.end) mesh.position.x=-1500;
            if(path.speed<0&&mesh.position.x<path.end) mesh.position.x=1500;
        }
    });
}

// ============================================================
// 19. RIVER AND LAKE
// ============================================================

function createRiver(x,z){

    const water=addPlane(x,0.13,z,130,450,materials.water);
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
    waterSurfaces.push(lake);
}

function updateWater(time){

    waterSurfaces.forEach((water,i)=>{
        water.position.y=0.13+Math.sin(time+i)*0.025;
    });

    waterRipples.forEach((r,i)=>{
        const s=1+Math.sin(time*1.5+i)*0.08;
        r.scale.set(s,1,s);
    });
}

// ============================================================
// 20. DISTRICT ENVIRONMENTS
// ============================================================

function buildForest(d){

    for(let i=0;i<35;i++){

        const side=i%4;
        let x,z;

        if(side===0){
            x=d.x-270+Math.random()*540;
            z=d.z-220;
        }else if(side===1){
            x=d.x-270+Math.random()*540;
            z=d.z+220;
        }else if(side===2){
            x=d.x-260;
            z=d.z-190+Math.random()*380;
        }else{
            x=d.x+260;
            z=d.z-190+Math.random()*380;
        }

        createTree(
            x,z,
            Math.random()<0.35?'pine':'oak',
            0.8+Math.random()*0.5
        );
    }

    createHouseModel(d.x+220,d.z+130,0x9c8062,1.05);
    createLake(d.x-200,d.z);
}

function buildDowntown(d){

    const buildings=[
        [-260,-180,48],
        [-160,-180,60],
        [220,-180,50],
        [270,150,43],
        [-270,150,40]
    ];

    buildings.forEach(([dx,dz,h],i)=>{

        createApartmentModel(
            d.x+dx,d.z+dz,h,
            [0x718d9b,0x9aaba9,0x738a88,0x9a9286,0x657b82][i]
        );
    });

    createHouseModel(d.x,d.z+200,0x9d9b89,0.85);
}

function buildRiverside(d){

    createRiver(d.x-260,d.z);

    createHouseModel(d.x+230,d.z-170,0xbdb59d,1.1);
    createHouseModel(d.x+230,d.z+145,0x8e9e99,1.1);

    createTree(d.x+260,d.z-70,'oak',1.3);
    createTree(d.x+260,d.z+75,'oak',1.1);
}

function buildPark(d){

    createLake(d.x-230,d.z-150);

    for(let i=0;i<22;i++){

        const angle=i/22*Math.PI*2;

        createTree(
            d.x+Math.cos(angle)*260,
            d.z+Math.sin(angle)*205,
            'oak',
            0.8+Math.random()*0.45
        );
    }

    for(let i=0;i<24;i++){

        createFlower(
            d.x-210+Math.random()*420,
            d.z-185+Math.random()*370,
            [0xe5a4c3,0xf2d36c,0xece9df][i%3]
        );
    }

    addPlane(d.x,0.05,d.z+195,450,12,materials.sidewalk);
}

function buildResidential(d){

    createHouseModel(d.x-240,d.z-200,0xd3c3a4,1.1);
    createHouseModel(d.x+240,d.z-200,0xb8c7c0,1.1);
    createHouseModel(d.x-240,d.z+195,0xc6b09a,1.1);
    createHouseModel(d.x+240,d.z+195,0xd6d1bc,1.1);

    createApartmentModel(d.x-240,d.z,30,0x8c9c9b);
    createApartmentModel(d.x+240,d.z,30,0xa6a69b);
}

function buildIndustrial(d){

    createFactoryModel(d.x-235,d.z-175);
    createFactoryModel(d.x+235,d.z-175);

    addBox(
        d.x,9,d.z+190,
        65,18,45,
        createMaterial(0x69726d)
    );

    for(let i=0;i<5;i++){
        createSolarPanel(d.x-145+i*70,d.z+90);
    }
}

function buildFarm(d){

    const barn=new THREE.Group();
    barn.position.set(d.x-235,0,d.z-180);

    addBox(0,6,0,26,12,21,createMaterial(0xa94e3d),barn);

    const roof=addMesh(
        new THREE.ConeGeometry(19,8,4),
        createMaterial(0x593b30),
        0,15,0,barn
    );

    roof.rotation.y=Math.PI/4;
    scene.add(barn);

    for(let row=0;row<7;row++){

        const z=d.z+20+row*23;

        addBox(
            d.x+80,0.12,z,
            300,0.12,2,
            createMaterial(0x80623d)
        );

        for(let col=0;col<13;col++){

            addMesh(
                new THREE.ConeGeometry(1.3,4,4),
                createMaterial(0x729747),
                d.x-55+col*22,2,z
            );
        }
    }

    createLake(d.x+250,d.z-170);
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
                z
            };

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
        }
    }
}

function buildDistricts(){

    districts.forEach(d=>{

        addPlane(
            d.x,0.05,d.z,
            700,700,
            d.type==='park'?materials.parkGrass:materials.grass
        );

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

    stats.green=THREE.MathUtils.clamp(
        stats.green+data.green,0,100
    );

    stats.happiness=THREE.MathUtils.clamp(
        stats.happiness+data.happiness,0,100
    );

    stats.pollution=THREE.MathUtils.clamp(
        stats.pollution+data.pollution,0,100
    );

    // Energy is a balance: solar adds supply, while buildings
    // and street lighting add demand. Construction also generates waste.
    stats.energy=THREE.MathUtils.clamp(
        stats.energy+(data.energy || 0),0,100
    );

    stats.waste=THREE.MathUtils.clamp(
        stats.waste+(data.waste || 0),0,100
    );

    placedItems.push({
        district:tile.district,
        row:tile.row,
        col:tile.col,
        x:tile.x,
        z:tile.z,
        type:selectedTool,
        cost:data.cost,
        object
    });

    updateEnvironment();

    const district=districts.find(d=>d.id===tile.district);

    message(`${data.name} constructed in ${district.name}!`);
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

    stats.green=THREE.MathUtils.clamp(
        stats.green-data.green,0,100
    );

    stats.happiness=THREE.MathUtils.clamp(
        stats.happiness-data.happiness,0,100
    );

    stats.pollution=THREE.MathUtils.clamp(
        stats.pollution-data.pollution,0,100
    );

    stats.energy=THREE.MathUtils.clamp(
        stats.energy-(data.energy || 0),0,100
    );

    stats.waste=THREE.MathUtils.clamp(
        stats.waste-(data.waste || 0),0,100
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

    controls.minDistance=75;
    controls.maxDistance=950;
    controls.minPolarAngle=0.15;
    controls.maxPolarAngle=Math.PI/2.05;

    renderer.domElement.addEventListener('contextmenu',e=>{
        e.preventDefault();
    });

    goToDistrict('central');
}

function goToDistrict(id){

    const d=districts.find(item=>item.id===id);
    if(!d) return;

    currentDistrict=id;

    controls.target.set(d.x,0,d.z);

    camera.position.set(
        d.x+240,
        350,
        d.z+470
    );

    controls.update();

    hud['location-label'].textContent=d.icon+' '+d.name;

    document.querySelectorAll('[data-district]').forEach(btn=>{
        btn.classList.toggle('active',btn.dataset.district===id);
    });

    message('Welcome to '+d.name+'!');
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

    const movement=new THREE.Vector3();

    if(keys.w||keys.arrowup) movement.add(forward);
    if(keys.s||keys.arrowdown) movement.sub(forward);
    if(keys.d||keys.arrowright) movement.add(right);
    if(keys.a||keys.arrowleft) movement.sub(right);

    if(movement.lengthSq()>0){

        movement.normalize().multiplyScalar(CONFIG.cameraSpeed*delta);

        controls.target.add(movement);
        camera.position.add(movement);
    }
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

    updateEnvironment();
    message('Drainage system upgraded!');
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

    const score=(
        (stats.effectiveGreen ?? stats.green)+
        stats.happiness+
        (100-(stats.effectivePollution ?? stats.pollution))+
        stats.energy+
        (100-stats.waste)
    )/5;

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
            placedItems:placedItems.map(item=>({
                district:item.district,
                row:item.row,
                col:item.col,
                x:item.x,
                z:item.z,
                type:item.type,
                cost:item.cost
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

        (data.placedItems||[]).forEach(saved=>{

            if(!tools[saved.type]) return;

            const object=createBuildObject(
                saved.type,saved.x,saved.z
            );

            if(!object) return;

            placedItems.push({
                ...saved,
                object
            });
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

    document.querySelectorAll('[data-district]').forEach(btn=>{

        btn.addEventListener('click',()=>{
            goToDistrict(btn.dataset.district);
        });
    });

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
        scene.fog=new THREE.Fog(0x9db8c0,1400,3500);

        camera=new THREE.PerspectiveCamera(
            48,
            container.clientWidth/container.clientHeight,
            0.1,
            5000
        );

        renderer=new THREE.WebGLRenderer({
            antialias:true,
            powerPreference:'high-performance'
        });

        renderer.setSize(
            container.clientWidth,
            container.clientHeight
        );

        renderer.setPixelRatio(
            Math.min(window.devicePixelRatio,1.5)
        );

        renderer.shadowMap.enabled=true;
        renderer.shadowMap.type=THREE.PCFSoftShadowMap;

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

        // World ground.
        addPlane(
            0,-0.3,0,
            3500,3200,
            materials.grass
        );

        // Generate roads and seven districts.
        buildRoadNetwork();
        buildDistricts();

        // Add procedural vegetation.
        createNaturalTerrain(scene,districts);

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

