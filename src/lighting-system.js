
import * as THREE from 'three';

// ======================================================
// ECOQUEST — REALISTIC LIGHTING & SKY SYSTEM
// Three.js
// Day / Sunset / Night / Weather Atmosphere
// ======================================================

const PRESETS = {
    morning: {
        sunHeight: 0.28,
        sunAngle: -0.9,
        sunlight: 2.35,
        ambient: 1.15,
        skyTop: 0x548dc2,
        skyHorizon: 0xf0c9a1,
        fog: 0xabc0b9,
        sunColor: 0xffd2a0,
        groundColor: 0x61734f,
        exposure: 1.2
    },

    noon: {
        sunHeight: 0.78,
        sunAngle: -0.7,
        sunlight: 2.8,
        ambient: 1.45,
        skyTop: 0x3884c6,
        skyHorizon: 0xb8dff0,
        fog: 0xb7caca,
        sunColor: 0xfff3df,
        groundColor: 0x687852,
        exposure: 1.15
    },

    sunset: {
        sunHeight: 0.16,
        sunAngle: 1.15,
        sunlight: 2.1,
        ambient: 0.9,
        skyTop: 0x405e94,
        skyHorizon: 0xf5a66e,
        fog: 0xb69b94,
        sunColor: 0xffa65c,
        groundColor: 0x665649,
        exposure: 1.1
    },

    night: {
        sunHeight: 0.55,
        sunAngle: 2.2,
        sunlight: 0.28,
        ambient: 0.4,
        skyTop: 0x07152d,
        skyHorizon: 0x233b57,
        fog: 0x18283c,
        sunColor: 0x8ca9dd,
        groundColor: 0x172338,
        exposure: 0.95
    }
};

const clamp = THREE.MathUtils.clamp;

export function createLightingSystem({
                                         scene,
                                         renderer,
                                         camera,
                                         initialPreset = 'noon'
                                     }) {

    if (!scene || !renderer || !camera) {
        throw new Error(
            'Lighting system requires scene, renderer and camera.'
        );
    }

    // ====================================================
    // RENDERER CONFIGURATION
    // ====================================================

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    renderer.toneMappingExposure = 1.15;

    // ====================================================
    // AMBIENT SKY AND GROUND LIGHT
    // ====================================================

    const ambientLight = new THREE.HemisphereLight(
        0xc4ddff,
        0x62724f,
        1.45
    );

    scene.add(ambientLight);

    // ====================================================
    // MAIN SUN / MOON LIGHT
    // ====================================================

    const sun = new THREE.DirectionalLight(
        0xfff2db,
        2.8
    );

    sun.castShadow = true;

    sun.shadow.mapSize.set(2048, 2048);

    sun.shadow.camera.left = -310;
    sun.shadow.camera.right = 310;
    sun.shadow.camera.top = 310;
    sun.shadow.camera.bottom = -310;

    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 1500;

    sun.shadow.bias = -0.0001;
    sun.shadow.normalBias = 0.035;

    sun.shadow.radius = 3;

    scene.add(sun);
    scene.add(sun.target);

    // ====================================================
    // ATMOSPHERIC FOG
    // ====================================================

    const fog = new THREE.Fog(
        0xb7caca,
        550,
        2500
    );

    scene.fog = fog;

    // ====================================================
    // PROCEDURAL GRADIENT SKY
    // ====================================================

    const skyUniforms = {
        topColor: {
            value: new THREE.Color(0x3884c6)
        },
        horizonColor: {
            value: new THREE.Color(0xb8dff0)
        }
    };

    const skyMaterial = new THREE.ShaderMaterial({
        uniforms: skyUniforms,

        vertexShader: `
      varying vec3 vDirection;

      void main() {
        vDirection = normalize(position);

        vec4 viewPosition =
          modelViewMatrix * vec4(position, 1.0);

        gl_Position =
          projectionMatrix * viewPosition;
      }
    `,

        fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;

      varying vec3 vDirection;

      void main() {
        float height =
          clamp(vDirection.y * 0.5 + 0.5, 0.0, 1.0);

        float gradient =
          smoothstep(0.30, 0.95, height);

        vec3 color =
          mix(horizonColor, topColor, gradient);

        gl_FragColor = vec4(color, 1.0);
      }
    `,

        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        toneMapped: false
    });

    const sky = new THREE.Mesh(
        new THREE.SphereGeometry(2400, 32, 20),
        skyMaterial
    );

    sky.frustumCulled = false;
    sky.renderOrder = -1000;

    scene.add(sky);

    // ====================================================
    // PRESET STATE
    // ====================================================

    let currentPreset =
        PRESETS[initialPreset] ? initialPreset : 'noon';

    let rainIntensity = 0;

    const currentSunColor =
        new THREE.Color(0xfff2db);

    const targetSunColor =
        new THREE.Color();

    const targetFogColor =
        new THREE.Color();

    const targetTopColor =
        new THREE.Color();

    const targetHorizonColor =
        new THREE.Color();

    const targetGroundColor =
        new THREE.Color();

    const sunDirection = new THREE.Vector3();

    const lastTarget = new THREE.Vector3();

    // ====================================================
    // APPLY PRESET
    // ====================================================

    function setPreset(name) {
        if (!PRESETS[name]) return false;

        currentPreset = name;

        console.log(
            `EcoQuest Lighting: ${name}`
        );

        return true;
    }

    function setRainIntensity(value) {
        rainIntensity = clamp(value, 0, 100) / 100;
    }

    // ====================================================
    // UPDATE LIGHTING
    // ====================================================

    function update(
        delta = 0.016,
        cameraTarget = null
    ) {

        const preset = PRESETS[currentPreset];

        const blend = 1 - Math.exp(
            -2.6 * Math.min(delta, 0.1)
        );

        // Overcast effect during rainfall.
        const overcast = rainIntensity * 0.65;

        const desiredSunlight =
            preset.sunlight * (1 - overcast * 0.65);

        const desiredAmbient =
            preset.ambient * (1 - overcast * 0.28);

        sun.intensity = THREE.MathUtils.lerp(
            sun.intensity,
            desiredSunlight,
            blend
        );

        ambientLight.intensity = THREE.MathUtils.lerp(
            ambientLight.intensity,
            desiredAmbient,
            blend
        );

        // Sun color.
        targetSunColor.setHex(
            preset.sunColor
        );

        sun.color.lerp(
            targetSunColor,
            blend
        );

        // Hemisphere ground color.
        targetGroundColor.setHex(
            preset.groundColor
        );

        ambientLight.groundColor.lerp(
            targetGroundColor,
            blend
        );

        // Fog becomes cooler and denser in rain.
        targetFogColor
            .setHex(preset.fog)
            .lerp(
                new THREE.Color(0x667f91),
                overcast
            );

        fog.color.lerp(
            targetFogColor,
            blend
        );

        const desiredFogNear =
            550 - overcast * 220;

        const desiredFogFar =
            2500 - overcast * 650;

        fog.near = THREE.MathUtils.lerp(
            fog.near,
            desiredFogNear,
            blend
        );

        fog.far = THREE.MathUtils.lerp(
            fog.far,
            desiredFogFar,
            blend
        );

        // Sky becomes darker in heavy rain.
        targetTopColor
            .setHex(preset.skyTop)
            .lerp(
                new THREE.Color(0x394c65),
                overcast
            );

        targetHorizonColor
            .setHex(preset.skyHorizon)
            .lerp(
                new THREE.Color(0x748491),
                overcast
            );

        skyUniforms.topColor.value.lerp(
            targetTopColor,
            blend
        );

        skyUniforms.horizonColor.value.lerp(
            targetHorizonColor,
            blend
        );

        // Adjust renderer exposure.
        const exposure =
            preset.exposure * (1 - overcast * 0.18);

        renderer.toneMappingExposure =
            THREE.MathUtils.lerp(
                renderer.toneMappingExposure,
                exposure,
                blend
            );

        // =================================================
        // POSITION SUN NEAR CURRENT CAMERA REGION
        // =================================================

        if (cameraTarget) {
            lastTarget.copy(cameraTarget);
        } else {
            lastTarget.copy(camera.position);
            lastTarget.y = 0;
        }

        sunDirection.set(
            Math.cos(preset.sunAngle),
            preset.sunHeight,
            Math.sin(preset.sunAngle)
        ).normalize();

        const sunDistance = 650;

        sun.position.copy(lastTarget).addScaledVector(
            sunDirection,
            sunDistance
        );

        sun.target.position.copy(lastTarget);

        sun.target.updateMatrixWorld();
        sun.updateMatrixWorld();

        // Center the sky around the camera so it
        // doesn't end when exploring distant districts.
        sky.position.copy(camera.position);

        // Keep shadow calculations centered on the
        // currently viewed area.
        sun.shadow.camera.updateProjectionMatrix();
    }

    // ====================================================
    // GET CURRENT STATUS
    // ====================================================

    function getStatus() {
        return {
            preset: currentPreset,
            rainfall: Math.round(rainIntensity * 100),
            shadows: renderer.shadowMap.enabled
        };
    }

    // ====================================================
    // CLEANUP
    // ====================================================

    function dispose() {
        scene.remove(sun);
        scene.remove(sun.target);
        scene.remove(ambientLight);
        scene.remove(sky);

        sky.geometry.dispose();
        skyMaterial.dispose();

        sun.dispose();
    }

    // Initialize lighting immediately.
    update(1);

    return {
        setPreset,
        setRainIntensity,
        update,
        getStatus,
        dispose
    };
}
