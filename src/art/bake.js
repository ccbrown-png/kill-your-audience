import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/*
 * HOW PROCEDURAL TEXTURES ARE MADE
 *
 * Instead of downloading image files, every texture is painted by a small GPU program (a
 * fragment shader) once, when the game loads. The shader runs for every pixel of an empty
 * texture and decides its color from math: noise for grime, a grid for tiles, and so on.
 * The result stays on the graphics card, so painting a 3000-pixel texture takes milliseconds.
 */

// Shared GLSL helpers: hashing (repeatable random numbers) and smooth noise.
export const GLSL_NOISE = /* glsl */ `
  // Bell curve: 1 at x = 0, fading to 0 either side. (Never use pow(x, 2.0) in GLSL: it's
  // undefined for negative x, and on some GPUs that one bad pixel blacks out the whole screen.)
  float bell(float x) { return exp(-x * x); }
  float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return v;
  }
  // Distance to the nearest random point in a grid of cells (Worley noise). x = distance, y = cell id.
  vec2 worley(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); float best = 9.0; float id = 0.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(x, y); vec2 o = hash22(i + g); float d = length(g + o - f);
      if (d < best) { best = d; id = hash12(i + g); }
    }
    return vec2(best, id);
  }
`;

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/**
 * Paints a texture with a fragment shader. The shader gets `vUv` (0..1 across the texture) and
 * writes gl_FragColor. Color textures are stored as sRGB so dark tones don't band.
 * @param {THREE.WebGLRenderer} renderer
 * @param {{ width: number, height: number, fragment: string, uniforms?: object, color?: boolean, repeat?: boolean }} options
 */
export function bakeTexture(renderer, { width, height, fragment, uniforms = {}, color = false, repeat = true }) {
  const target = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer: false,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping,
    wrapT: repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping,
    colorSpace: color ? THREE.SRGBColorSpace : THREE.NoColorSpace,
  });
  target.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: GLSL_NOISE + fragment,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new FullScreenQuad(material);
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  quad.render(renderer);
  renderer.setRenderTarget(previous);
  quad.dispose();
  material.dispose();
  return target.texture;
}

/**
 * Turns a height function into a normal map. `heightFn` is GLSL defining `float height(vec2 uv)`.
 * `strength` scales how steep the bumps look.
 */
export function bakeNormalMap(renderer, { width, height, heightFn, strength = 1, uniforms = {}, repeat = true }) {
  return bakeTexture(renderer, {
    width,
    height,
    repeat,
    uniforms: { texel: { value: new THREE.Vector2(1 / width, 1 / height) }, strength: { value: strength }, ...uniforms },
    fragment: /* glsl */ `
      uniform vec2 texel; uniform float strength; varying vec2 vUv;
      ${heightFn}
      void main() {
        float hl = height(vUv - vec2(texel.x, 0.0)); float hr = height(vUv + vec2(texel.x, 0.0));
        float hd = height(vUv - vec2(0.0, texel.y)); float hu = height(vUv + vec2(0.0, texel.y));
        vec3 n = normalize(vec3((hl - hr) * strength, (hd - hu) * strength, 1.0));
        gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
      }
    `,
  });
}

/** A canvas you can draw on with the 2D API, returned as a texture. Used for printed labels. */
export function canvasTexture(width, height, draw, { color = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 8;
  return texture;
}
