import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  POST_PROCESSING_ENABLED,
  POST_TINT_STRENGTH,
  POST_TINT_COLOR,
  POST_GRAIN_STRENGTH,
  POST_VIGNETTE_STRENGTH,
} from '../config.js';

// PLACEHOLDER: the look of the final image. The game only uses render() and setSize().

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

      color += (random(vUv + fract(time)) - 0.5) * grain;

      float fromCenter = distance(vUv, vec2(0.5));
      color *= 1.0 - vignette * smoothstep(0.3, 0.8, fromCenter);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

export function createPostProcessing(renderer, scene, camera) {
  if (!POST_PROCESSING_ENABLED) {
    return {
      render: () => renderer.render(scene, camera),
      setSize: () => {},
    };
  }

  const composer = new EffectComposer(renderer);
  // Rendering through the composer loses the browser's edge smoothing, so ask for it here.
  composer.renderTarget1.samples = 4;
  composer.renderTarget2.samples = 4;

  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new OutputPass()); // converts to screen colors, so the grade works on what you see
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  return {
    render() {
      grade.uniforms.time.value = performance.now() / 1000;
      composer.render();
    },
    setSize: (width, height) => composer.setSize(width, height),
  };
}
