
import * as THREE from 'three';

// ======================================================
// ECOQUEST — NATURAL VEGETATION SYSTEM
// Optimized 3D grass, shrubs and scattered rocks
// Compatible with the expanded 70-zone world
// ======================================================

const DISTRICT_SIZE = 700;

const SETTINGS = {
    enabled: true,

    grassDensity: {
        forest: 360,
        downtown: 75,
        riverside: 240,
        park: 340,
        residential: 150,
        industrial: 55,
        farm: 220
    },

    bushDensity: {
        forest: 22,
        downtown: 3,
        riverside: 12,
        park: 18,
        residential: 8,
        industrial: 3,
        farm: 12
    },

    rockDensity: {
        forest: 18,
        downtown: 1,
        riverside: 13,
        park: 5,
        residential: 2,
        industrial: 8,
        farm: 6
    }
};

// ======================================================
// DETERMINISTIC RANDOM NUMBER GENERATOR
// ======================================================

function seededRandom(seed) {
    let state = seed >>> 0;

    return () => {
        state = (1664525 * state + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

// ======================================================
// GRASS BLADE GEOMETRY
// Three angled grass blades in one geometry
// ======================================================

function createGrassGeometry() {
    const vertices = [];

    for (let blade = 0; blade < 3; blade++) {
        const angle = blade * Math.PI / 3;

        const width = 0.24;
        const height = blade === 1 ? 1.8 : 1.35;

        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const points = [
            [-width, 0, 0],
            [width, 0, 0],
            [0.12, height, 0.08]
        ];

        points.forEach(([x, y, z]) => {
            vertices.push(
                x * cos - z * sin,
                y,
                x * sin + z * cos
            );
        });
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(vertices, 3)
    );

    geometry.computeVertexNormals();

    return geometry;
}

// ======================================================
// DISTRICT PLACEMENT RULES
// Keep roads and central buildable areas clear
// ======================================================

function isSafePosition(district, x, z) {
    const localX = x - district.x;
    const localZ = z - district.z;

    if (
        Math.abs(localX) > DISTRICT_SIZE / 2 - 24 ||
        Math.abs(localZ) > DISTRICT_SIZE / 2 - 24
    ) {
        return false;
    }

    // Central construction area.
    if (
        localX > -160 && localX < 170 &&
        localZ > -155 && localZ < 145
    ) {
        return false;
    }

    // Local district road.
    if (Math.abs(localZ - 235) < 40) {
        return false;
    }

    // Riverside water channel.
    if (
        district.type === 'riverside' &&
        Math.abs(localX + 260) < 95 &&
        Math.abs(localZ) < 245
    ) {
        return false;
    }

    // Central Park lake.
    if (
        district.type === 'park' &&
        Math.hypot(localX + 230, localZ + 150) < 100
    ) {
        return false;
    }

    // Farm lake and fields.
    if (district.type === 'farm') {
        if (Math.hypot(localX - 250, localZ + 170) < 95) {
            return false;
        }

        if (
            localX > -100 && localX < 255 &&
            localZ > -5 && localZ < 190
        ) {
            return false;
        }
    }

    // Additional space for buildings.
    const buildingAreas = {
        downtown: [
            [-260, -180], [-160, -180],
            [220, -180], [270, 150],
            [-270, 150], [0, 200]
        ],
        residential: [
            [-240, -200], [240, -200],
            [-240, 195], [240, 195],
            [-240, 0], [240, 0]
        ],
        industrial: [
            [-235, -175], [235, -175],
            [0, 190]
        ]
    };

    for (const [bx, bz] of buildingAreas[district.type] || []) {
        if (
            Math.abs(localX - bx) < 48 &&
            Math.abs(localZ - bz) < 48
        ) {
            return false;
        }
    }

    // Prefer edges and natural landscape,
    // rather than the centre of the build grid.
    return true;
}

// ======================================================
// CREATE VALID RANDOM POINTS
// ======================================================

function createPoints(district, count, random) {
    const points = [];

    let attempts = 0;
    const maximumAttempts = count * 30;

    while (points.length < count && attempts < maximumAttempts) {
        attempts++;

        const x =
            district.x + (random() - 0.5) * (DISTRICT_SIZE - 45);

        const z =
            district.z + (random() - 0.5) * (DISTRICT_SIZE - 45);

        if (!isSafePosition(district, x, z)) {
            continue;
        }

        points.push({ x, z });
    }

    return points;
}

// ======================================================
// INSTANCED GRASS
// ======================================================

function createGrass(scene, district, random) {
    const count = SETTINGS.grassDensity[district.type] || 100;

    const points = createPoints(district, count, random);

    if (!points.length) return null;

    const geometry = createGrassGeometry();

    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 1,
        metalness: 0,
        side: THREE.DoubleSide
    });

    const mesh = new THREE.InstancedMesh(
        geometry,
        material,
        points.length
    );

    const dummy = new THREE.Object3D();

    const colors = [
        new THREE.Color(0x527c39),
        new THREE.Color(0x668e45),
        new THREE.Color(0x76974e),
        new THREE.Color(0x466e35),
        new THREE.Color(0x8a9e56)
    ];

    points.forEach((point, index) => {
        const size = 0.7 + random() * 1.5;

        dummy.position.set(
            point.x,
            0.08,
            point.z
        );

        dummy.rotation.set(
            0,
            random() * Math.PI * 2,
            0
        );

        dummy.scale.set(
            size,
            size,
            size
        );

        dummy.updateMatrix();

        mesh.setMatrixAt(index, dummy.matrix);

        mesh.setColorAt(
            index,
            colors[Math.floor(random() * colors.length)]
        );
    });

    mesh.instanceMatrix.needsUpdate = true;

    if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
    }

    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;

    scene.add(mesh);

    return mesh;
}

// ======================================================
// INSTANCED NATURAL SHRUBS
// ======================================================

function createShrubs(scene, district, random) {
    const count = SETTINGS.bushDensity[district.type] || 5;

    const points = createPoints(district, count, random);

    if (!points.length) return null;

    const geometry = new THREE.IcosahedronGeometry(1, 1);

    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 1,
        flatShading: false
    });

    const mesh = new THREE.InstancedMesh(
        geometry,
        material,
        points.length
    );

    const dummy = new THREE.Object3D();

    const colors = [
        new THREE.Color(0x365f35),
        new THREE.Color(0x47763e),
        new THREE.Color(0x5b8546),
        new THREE.Color(0x718e4a)
    ];

    points.forEach((point, index) => {
        const size = 1.4 + random() * 1.8;

        dummy.position.set(
            point.x,
            size * 0.72,
            point.z
        );

        dummy.rotation.set(
            random() * 0.25,
            random() * Math.PI * 2,
            random() * 0.25
        );

        dummy.scale.set(
            size,
            size * 0.72,
            size
        );

        dummy.updateMatrix();

        mesh.setMatrixAt(index, dummy.matrix);

        mesh.setColorAt(
            index,
            colors[Math.floor(random() * colors.length)]
        );
    });

    mesh.instanceMatrix.needsUpdate = true;

    if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
    }

    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;

    scene.add(mesh);

    return mesh;
}

// ======================================================
// SCATTERED ROCKS
// ======================================================

function createRocks(scene, district, random) {
    const count = SETTINGS.rockDensity[district.type] || 3;

    const points = createPoints(district, count, random);

    if (!points.length) return null;

    const geometry = new THREE.IcosahedronGeometry(1, 0);

    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 1,
        flatShading: true
    });

    const mesh = new THREE.InstancedMesh(
        geometry,
        material,
        points.length
    );

    const dummy = new THREE.Object3D();

    const colors = [
        new THREE.Color(0x85867b),
        new THREE.Color(0x777a70),
        new THREE.Color(0xa19d8c),
        new THREE.Color(0x666b64)
    ];

    points.forEach((point, index) => {
        const size = 0.8 + random() * 1.4;

        dummy.position.set(
            point.x,
            size * 0.3,
            point.z
        );

        dummy.rotation.set(
            random() * 0.5,
            random() * Math.PI,
            random() * 0.5
        );

        dummy.scale.set(
            size * 1.4,
            size * 0.65,
            size
        );

        dummy.updateMatrix();

        mesh.setMatrixAt(index, dummy.matrix);

        mesh.setColorAt(
            index,
            colors[Math.floor(random() * colors.length)]
        );
    });

    mesh.instanceMatrix.needsUpdate = true;

    if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
    }

    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;

    scene.add(mesh);

    return mesh;
}

// ======================================================
// PUBLIC FUNCTION — ADD VEGETATION TO ALL DISTRICTS
// ======================================================

export function createNaturalTerrain(scene, districts) {
    if (!SETTINGS.enabled) {
        return { dispose() {} };
    }

    const objects = [];

    districts.forEach((district, index) => {
        const random = seededRandom(2026 + index * 7919);

        const grass = createGrass(scene, district, random);
        const bushes = createShrubs(scene, district, random);
        const rocks = createRocks(scene, district, random);

        if (grass) objects.push(grass);
        if (bushes) objects.push(bushes);
        if (rocks) objects.push(rocks);
    });

    console.log(
        `EcoQuest Terrain System: ${objects.length} instanced groups created.`
    );

    return {
        objects,

        dispose() {
            objects.forEach(object => {
                scene.remove(object);

                object.geometry.dispose();
                object.material.dispose();
            });

            objects.length = 0;
        }
    };
}
