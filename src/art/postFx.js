import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { isHighQuality } from './quality.js';
import { VIEWMODEL_LAYER } from './layers.js';
import {
  POST_PROCESSING_ENABLED,
  POST_TINT_STRENGTH,
  POST_TINT_COLOR,
  POST_GRAIN_STRENGTH,
  POST_VIGNETTE_STRENGTH,
  EXPOSURE,
  BLOOM_STRENGTH,
  BLOOM_THRESHOLD,
  BLOOM_RADIUS,
  AO_STRENGTH,
  AO_RADIUS,
} from '../config.js';

/*
 * THE FINAL IMAGE, STEP BY STEP
 *  1. Draw the bathroom.
 *  2. (high quality) Ambient occlusion: darken creases and corners where light can't reach.
 *  3. Draw the hands and the can on top, with their own depth, so walls never poke through them.
 *  4. Bloom: very bright pixels (the bulb, chrome glints) bleed a soft glow.
 *  5. Tone mapping: squeeze the bright-to-dark range into what a screen can show.
 *  6. The grade: cold blue tint, film grain, vignette.
 */

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    tintStrength: { value: POST_TINT_STRENGTH },
    tintColor: { value: new THREE.Vector3(...POST_TINT_COLOR) },
    grain: { value: POST_GRAIN_STRENGTH },
    vignette: { value: POST_VIGNETTE_STRENGTH },
    time: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float tintStrength;
    uniform vec3 tintColor;
    uniform float grain;
    uniform float vignette;
    uniform float time;
    varying vec2 vUv;

    float random(vec2 point) {
      return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec3 color = texture2D(tDiffuse, vUv).rgb;

      float brightness = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(color, brightness * tintColor, tintStrength);

      // Grain is stronger in the shadows, like film.
      float g = random(vUv * 1.7 + fract(time * 7.13)) - 0.5;
      color += g * grain * (1.25 - brightness * 0.6);

      float fromCenter = distance(vUv, vec2(0.5));
      color *= 1.0 - vignette * smoothstep(0.3, 0.8, fromCenter);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

/** Draws only the viewmodel layer over what's already there, after clearing depth. */
class ViewmodelPass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = false;
  }

  render(renderer, writeBuffer, readBuffer) {
    const oldAutoClear = renderer.autoClear;
    const oldBackground = this.scene.background;
    renderer.autoClear = false;
    this.scene.background = null;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    this.scene.background = oldBackground;
    renderer.autoClear = oldAutoClear;
  }
}

export function createPostProcessing(renderer, scene, camera) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // A second camera that always matches the main one but only sees the viewmodel layer.
  const viewCamera = new THREE.PerspectiveCamera();
  viewCamera.layers.set(VIEWMODEL_LAYER);
  viewCamera.matrixWorldAutoUpdate = false;
  function syncViewCamera() {
    camera.updateMatrixWorld();
    viewCamera.matrixWorld.copy(camera.matrixWorld);
    viewCamera.matrixWorldInverse.copy(camera.matrixWorldInverse);
    viewCamera.projectionMatrix.copy(camera.projectionMatrix);
    viewCamera.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
  }

  if (!POST_PROCESSING_ENABLED) {
    return {
      render() {
        syncViewCamera();
        renderer.render(scene, camera);
        const oldAutoClear = renderer.autoClear;
        const oldBackground = scene.background;
        renderer.autoClear = false;
        scene.background = null;
        renderer.clearDepth();
        renderer.render(scene, viewCamera);
        scene.background = oldBackground;
        renderer.autoClear = oldAutoClear;
      },
      setSize: () => {},
    };
  }

  const width = window.innerWidth;
  const height = window.innerHeight;
  const composer = new EffectComposer(renderer);
  // Rendering through the composer loses the browser's edge smoothing, so ask for it here.
  composer.renderTarget1.samples = 4;
  composer.renderTarget2.samples = 4;

  composer.addPass(new RenderPass(scene, camera));

  let ao = null;
  if (isHighQuality() && AO_STRENGTH > 0) {
    ao = new GTAOPass(scene, camera, width, height);
    ao.output = GTAOPass.OUTPUT.Default;
    ao.blendIntensity = AO_STRENGTH;
    ao.updateGtaoMaterial({ radius: AO_RADIUS, distanceExponent: 1.5, thickness: 0.6, scale: 1, samples: 12 });
    ao.updatePdMaterial({ radius: 6, samples: 12 });
    // AO reads depth from every mesh, see-through or not, so steam puffs and falling water would
    // darken the walls behind them. Hide anything transparent while the AO pass looks at the scene.
    const renderAo = ao.render.bind(ao);
    const hidden = [];
    ao.render = (...args) => {
      scene.traverseVisible((obj) => {
        const m = obj.material;
        if (m && (Array.isArray(m) ? m.every((x) => x.transparent) : m.transparent)) hidden.push(obj);
        else if (obj.isSprite || obj.isPoints || obj.userData.noAO) hidden.push(obj);
      });
      for (const obj of hidden) obj.visible = false;
      renderAo(...args);
      for (const obj of hidden) obj.visible = true;
      hidden.length = 0;
    };
    composer.addPass(ao);
  }

  composer.addPass(new ViewmodelPass(scene, viewCamera));

  let bloom = null;
  if (BLOOM_STRENGTH > 0) {
    bloom = new UnrealBloomPass(new THREE.Vector2(width / 2, height / 2), BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD);
    composer.addPass(bloom);
  }

  composer.addPass(new OutputPass()); // tone mapping and screen colors, so the grade works on what you see
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  return {
    render() {
      syncViewCamera();
      grade.uniforms.time.value = performance.now() / 1000;
      composer.render();
    },
    setSize(w, h) {
      composer.setSize(w, h);
      ao?.setSize(w, h);
      bloom?.setSize(w / 2, h / 2);
    },
  };
}
