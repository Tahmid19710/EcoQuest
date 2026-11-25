
import * as THREE from 'three';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// ======================================================
// ECOQUEST — ADVANCED 3D MODEL LOADER
// GLB + KTX2 TEXTURE SUPPORT
// ======================================================

const MODEL_PATHS = {
    oak: '/models/trees/oak.glb',
    pine: '/models/trees/pine.glb',
    blossom: '/models/trees/blossom.glb',

    house: '/models/buildings/house.glb',
    apartment: '/models/buildings/apartment.glb',
    factory: '/models/buildings/factory.glb',

    car: '/models/vehicles/car.glb'
};

const TARGET_HEIGHTS = {
    oak: 16,
    pine: 18,
    blossom: 14,

    house: 15,
    apartment: 38,
    factory: 20,

    car: 5
};

export class ModelLibrary {

    constructor(scene, onStatus = () => {}, renderer = null) {

        this.scene = scene;
        this.onStatus = onStatus;

        this.loader = new GLTFLoader();
        this.loader.setMeshoptDecoder(MeshoptDecoder);

        this.cache = new Map();
        this.failed = new Set();
        this.loading = new Map();

        this.ktx2Loader = null;

        // Initialize compressed texture support.
        if (renderer) {

            this.ktx2Loader = new KTX2Loader();

            this.ktx2Loader
                .setTranscoderPath('/basis/')
                .detectSupport(renderer);

            this.loader.setKTX2Loader(this.ktx2Loader);

            console.log('KTX2 texture support initialized.');

        } else {

            console.warn('WebGL renderer not supplied to ModelLibrary.');
        }
    }

    // ==================================================
    // LOAD MODEL
    // ==================================================

    async load(type) {

        if (this.cache.has(type)) {
            return this.cache.get(type);
        }

        if (this.failed.has(type)) {
            return null;
        }

        if (!MODEL_PATHS[type]) {
            console.warn('Unknown model:', type);
            return null;
        }

        if (this.loading.has(type)) {
            return this.loading.get(type);
        }

        const url = MODEL_PATHS[type];

        const promise = this.loader.loadAsync(url)

            .then(gltf => {

                if (!gltf.scene) {
                    throw new Error('GLB scene is missing.');
                }

                const model = gltf.scene;

                model.updateMatrixWorld(true);

                this.cache.set(type, model);

                console.log(`3D model loaded successfully: ${type}`);

                return model;
            })

            .catch(error => {

                console.error(`Could not load ${type}:`, error);

                this.failed.add(type);

                this.onStatus(
                    `${type} unavailable. Using procedural fallback.`
                );

                return null;
            })

            .finally(() => {

                this.loading.delete(type);

            });

        this.loading.set(type, promise);

        return promise;
    }

    // ==================================================
    // PRELOAD ALL MODELS
    // ==================================================

    async preload() {

        const types = Object.keys(MODEL_PATHS);

        this.onStatus('Loading realistic 3D models...');

        const results = await Promise.all(
            types.map(type => this.load(type))
        );

        const loaded = results.filter(Boolean).length;

        console.log('================================');
        console.log('ECOQUEST 3D ASSET REPORT');
        console.log(`Successfully loaded: ${loaded}/${types.length}`);
        console.log('Failed models:', [...this.failed]);
        console.log('================================');

        this.onStatus(
            `${loaded}/${types.length} 3D models loaded.`
        );

        return loaded;
    }

    // ==================================================
    // MODEL AVAILABILITY
    // ==================================================

    has(type) {

        return this.cache.has(type);
    }

    // ==================================================
    // CREATE MODEL INSTANCE
    // ==================================================

    create(type, x, z) {

        if (!this.cache.has(type)) {
            return null;
        }

        const source = this.cache.get(type);

        const model = clone(source);

        model.updateMatrixWorld(true);

        const initialBounds = new THREE.Box3()
            .setFromObject(model);

        const initialSize = initialBounds.getSize(
            new THREE.Vector3()
        );

        if (initialSize.y <= 0) {
            console.warn('Invalid dimensions:', type);
            return null;
        }

        // Normalize model height.

        const targetHeight = TARGET_HEIGHTS[type] || 10;

        const scale = targetHeight / initialSize.y;

        model.scale.multiplyScalar(scale);

        model.updateMatrixWorld(true);

        // Calculate final bounding box.

        const bounds = new THREE.Box3()
            .setFromObject(model);

        const center = bounds.getCenter(
            new THREE.Vector3()
        );

        // Position at requested world coordinates.

        model.position.x += x - center.x;
        model.position.z += z - center.z;
        model.position.y -= bounds.min.y;

        // Configure shadows.

        model.traverse(child => {

            if (child.isMesh) {

                child.castShadow = true;
                child.receiveShadow = true;

                child.frustumCulled = true;
            }

        });

        model.userData.ecoquestAsset = type;

        model.userData.originalPosition = { x, z };

        this.scene.add(model);

        return model;
    }

    // ==================================================
    // REMOVE INSTANCE
    // ==================================================

    remove(model) {

        if (!model) return;

        this.scene.remove(model);

        // Cached geometry and materials are shared.
        // Do not dispose shared resources here.
    }

    // ==================================================
    // MODEL REPORT
    // ==================================================

    getReport() {

        return {
            total: Object.keys(MODEL_PATHS).length,

            loaded: this.cache.size,

            failed: [...this.failed],

            available: [...this.cache.keys()],

            ktx2Enabled: this.ktx2Loader !== null
        };
    }

    // ==================================================
    // CLEANUP
    // ==================================================

    dispose() {

        if (this.ktx2Loader) {
            this.ktx2Loader.dispose();
        }

        this.cache.clear();
        this.failed.clear();
        this.loading.clear();
    }

}
