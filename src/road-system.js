
import * as THREE from 'three';

// =====================================================
// ECOQUEST — REALISTIC ROAD MATERIAL SYSTEM
// Procedural asphalt and concrete textures
// No external texture files required
// =====================================================

const textureCache = new Map();

function random(seed) {
    let value = seed >>> 0;

    return () => {
        value = (1664525 * value + 1013904223) >>> 0;
        return value / 4294967296;
    };
}

// =====================================================
// ASPHALT TEXTURE
// =====================================================

function createAsphaltTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;

    const ctx = canvas.getContext('2d');
    const rng = random(1729);

    ctx.fillStyle = '#383b3b';
    ctx.fillRect(0, 0, 512, 512);

    // Fine asphalt aggregate.
    for (let i = 0; i < 42000; i++) {
        const x = rng() * 512;
        const y = rng() * 512;
        const brightness = Math.floor(40 + rng() * 65);
        const alpha = 0.08 + rng() * 0.22;
        const size = 0.5 + rng() * 2.2;

        ctx.fillStyle =
            `rgba(${brightness},${brightness},${brightness},${alpha})`;

        ctx.fillRect(x, y, size, size);
    }

    // Worn patches.
    for (let i = 0; i < 90; i++) {
        const x = rng() * 512;
        const y = rng() * 512;
        const rx = 6 + rng() * 28;
        const ry = 3 + rng() * 14;

        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, rng() * Math.PI, 0, Math.PI * 2);
        ctx.fillStyle = rng() > 0.5
            ? 'rgba(12,17,18,0.065)'
            : 'rgba(150,145,130,0.035)';
        ctx.fill();
    }

    // Subtle cracks.
    ctx.lineWidth = 0.7;

    for (let i = 0; i < 17; i++) {
        let x = rng() * 512;
        let y = rng() * 512;

        ctx.beginPath();
        ctx.moveTo(x, y);

        for (let j = 0; j < 5; j++) {
            x += (rng() - 0.5) * 30;
            y += (rng() - 0.5) * 30;
            ctx.lineTo(x, y);
        }

        ctx.strokeStyle = 'rgba(15,18,18,0.18)';
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);

    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;

    return texture;
}

// =====================================================
// CONCRETE TEXTURE
// =====================================================

function createConcreteTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;

    const ctx = canvas.getContext('2d');
    const rng = random(31415);

    ctx.fillStyle = '#999b97';
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 20000; i++) {
        const grey = Math.floor(90 + rng() * 95);
        const alpha = 0.04 + rng() * 0.1;

        ctx.fillStyle =
            `rgba(${grey},${grey},${grey},${alpha})`;

        ctx.fillRect(
            rng() * 512,
            rng() * 512,
            1 + rng() * 3,
            1 + rng() * 3
        );
    }

    // Concrete expansion joints.
    ctx.strokeStyle = 'rgba(45,50,46,0.24)';
    ctx.lineWidth = 2;

    for (let p = 0; p <= 512; p += 128) {
        ctx.beginPath();
        ctx.moveTo(p, 0);
        ctx.lineTo(p, 512);
        ctx.moveTo(0, p);
        ctx.lineTo(512, p);
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);

    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;

    return texture;
}

// =====================================================
// SHARED BASE TEXTURES
// =====================================================

function getBaseTexture(type) {
    if (textureCache.has(type)) {
        return textureCache.get(type);
    }

    const texture = type === 'asphalt'
        ? createAsphaltTexture()
        : createConcreteTexture();

    textureCache.set(type, texture);

    return texture;
}

// =====================================================
// MATERIAL FOR A SPECIFIC ROAD SIZE
// =====================================================

export function makeRoadMaterial(width, length) {
    const map = getBaseTexture('asphalt').clone();

    // Keep texture scale consistent in world units.
    map.repeat.set(
        Math.max(1, width / 16),
        Math.max(1, length / 16)
    );

    map.needsUpdate = true;

    return new THREE.MeshStandardMaterial({
        map,
        roughness:0.94,
        metalness:0.015,
        side:THREE.FrontSide
    });
}

export function makeConcreteMaterial(width, length) {
    const map = getBaseTexture('concrete').clone();

    map.repeat.set(
        Math.max(1, width / 12),
        Math.max(1, length / 12)
    );

    map.needsUpdate = true;

    return new THREE.MeshStandardMaterial({
        map,
        roughness:0.96,
        metalness:0
    });
}

export function makeMarkingMaterial(color = 0xece8dc) {
    return new THREE.MeshStandardMaterial({
        color,
        roughness:0.9,
        metalness:0,
        depthWrite:true
    });
}

console.log('EcoQuest realistic road materials ready.');
