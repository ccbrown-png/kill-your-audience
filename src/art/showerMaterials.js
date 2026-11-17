import * as THREE from 'three';
import { bakeTexture, bakeNormalMap, GLSL_NOISE } from './bake.js';
import { isHighQuality } from './quality.js';
import {
  TILE_SIZE,
  GROUT_WIDTH,
  TILE_COLOR,
  GROUT_COLOR,
  TILE_COLOR_VARIATION,
  TILE_GRIME,
  TILE_TEXELS_PER_METER_HIGH,
  TILE_TEXELS_PER_METER_LOW,
  REFLECTION_STRENGTH,
} from '../config.js';

/*
 * THE SHOWER'S MATERIALS: tile walls, enamel tub, chrome, caulk.
 *
 * The tile walls get one big texture that covers all three walls without repeating ("an atlas"),
 * unrolled like peeling the wallpaper off and laying it flat: front wall, then left, then back.
 * Because every spot of wall has its own pixels, grime can be where it would really be:
 * mildew in the two inside corners and along the tub, soap scum under the shelf and where the
 * spray hits, rusty drips under the handles.
 */

// --- Where things are on the walls, measured from bathtub.glb (meters) ---
// Inside faces of the three tile walls, and the open edge of the stall.
export const WALLS = {
  open: -0.015, // x of the open (curtain) edge
  left: -0.742, // x of the left wall's inner face
  front: -0.026, // z of the front wall's inner face (behind the player at the start)
  back: -1.498, // z of the back (faucet) wall's inner face
  top: 2.143,
  rim: 0.469, // height of the tub rim, where the tiles start
};
// Unrolled distance along the walls: front wall, then the left wall, then the back wall.
const S_FRONT_CORNER = WALLS.open - WALLS.left; // 0.727
const S_BACK_CORNER = S_FRONT_CORNER + (WALLS.front - WALLS.back); // 2.199
const S_END = S_BACK_CORNER + (WALLS.open - WALLS.left); // 2.926
const ATLAS_S0 = -0.03; // a little extra at both ends for the wall's edge faces
const ATLAS_SW = S_END + 0.03 - ATLAS_S0;
const ATLAS_H = 2.16;

/** Gives the BathTiles mesh flat shading and UVs that point into the unrolled-wall atlas. */
export function unwrapTileWalls(mesh) {
  let geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  geometry.deleteAttribute('normal');
  geometry.computeVertexNormals(); // non-indexed, so every face gets its own flat normal
  const position = geometry.attributes.position;
  const uv = new Float32Array(position.count * 2);
  const centroid = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let tri = 0; tri < position.count; tri += 3) {
    centroid.set(0, 0, 0);
    for (let k = 0; k < 3; k++) centroid.add(v.fromBufferAttribute(position, tri + k));
    centroid.divideScalar(3);
    for (let k = 0; k < 3; k++) {
      v.fromBufferAttribute(position, tri + k);
      // Decide the wall from the triangle's middle, so a whole face uses one formula.
      let s;
      if (centroid.z > -0.1) s = WALLS.open - v.x;
      else if (centroid.z < -1.45) s = S_BACK_CORNER + (v.x - WALLS.left);
      else if (centroid.x < -0.6) s = S_FRONT_CORNER + (WALLS.front - v.z);
      else s = centroid.z > -0.75 ? -(v.z - WALLS.front) : S_END + (WALLS.back - v.z);
      uv[(tri + k) * 2] = (s - ATLAS_S0) / ATLAS_SW;
      uv[(tri + k) * 2 + 1] = v.y / ATLAS_H;
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  for (const name of Object.keys(geometry.attributes)) {
    if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
  }
  mesh.geometry = geometry;
}

const colorVec = (hex) => new THREE.Color(hex);

// GLSL shared by the three tile bakes: which tile a point is on, how high the surface is, grime.
const TILE_COMMON = /* glsl */ `
  uniform vec2 atlasOrigin; uniform vec2 atlasSize;
  uniform float tileSize; uniform float groutWidth; uniform float rimY; uniform float topY;
  uniform vec3 tileColor; uniform vec3 groutColor; uniform float variation; uniform float grime;
  uniform vec2 corners; // unrolled distance of the two inside corners
  uniform vec3 shelf; // unrolled distance, height, half width of the shelf
  uniform vec2 handles; // unrolled distance and height of the middle handle
  varying vec2 vUv;

  vec2 atlasPoint(vec2 uv) { return atlasOrigin + uv * atlasSize; }

  // Which wall, which tile, where inside the tile, and how far to the nearest grout line.
  void tileAt(vec2 p, out vec2 id, out vec2 local, out float edge) {
    float lx; float wall;
    if (p.x < corners.x) { wall = 0.0; lx = corners.x - p.x; }
    else if (p.x < corners.y) { wall = 1.0; lx = p.x - corners.x; }
    else { wall = 2.0; lx = p.x - corners.y; }
    vec2 l = vec2(lx, p.y - rimY - 0.004);
    id = floor(l / tileSize) + vec2(wall * 101.0, 0.0);
    local = mod(l, tileSize);
    vec2 d = min(local, tileSize - local);
    edge = min(d.x, d.y);
    edge = min(edge, abs(p.x - corners.x));
    edge = min(edge, abs(p.x - corners.y));
  }

  // 1 on the flat glaze, 0 down in the grout, a rounded shoulder in between.
  float glazeMask(float edge) {
    float t = smoothstep(groutWidth * 0.5, groutWidth * 0.5 + 0.0024, edge);
    return 1.0 - (1.0 - t) * (1.0 - t);
  }

  // A chipped edge on roughly one tile in nine. Returns 0..1.
  float chipMask(vec2 id, vec2 local, vec2 p) {
    float h = hash12(id + 4.7);
    if (h > 0.11) return 0.0;
    float side = floor(hash12(id + 8.1) * 4.0);
    float along = (0.12 + 0.76 * hash12(id + 2.3)) * tileSize;
    vec2 c = side < 1.0 ? vec2(along, 0.0) : side < 2.0 ? vec2(along, tileSize) : side < 3.0 ? vec2(0.0, along) : vec2(tileSize, along);
    float r = 0.0016 + 0.0028 * hash12(id + 5.5);
    float d = distance(local, c) + (vnoise(p * 2600.0) - 0.5) * 0.0012;
    return 1.0 - smoothstep(r - 0.0005, r, d);
  }

  // Surface height in millimeters.
  float surfaceHeight(vec2 p) {
    vec2 id; vec2 local; float edge;
    tileAt(p, id, local, edge);
    float g = glazeMask(edge);
    float h = mix(-1.1 + 0.3 * vnoise(p * 1400.0), 0.0, g);
    vec2 c = local / tileSize - 0.5;
    h += ((hash12(id) - 0.5) * 0.3 + (0.14 - dot(c, c) * 0.4)) * g; // tiles sit a hair uneven, slightly domed
    h += (fbm(p * 55.0) - 0.5) * 0.12 * g; // glaze ripple
    h -= chipMask(id, local, p) * 0.75;
    return h;
  }

  // 0..1 amounts of each kind of dirt at a point.
  float mildewAmount(vec2 p) {
    float corner = min(abs(p.x - corners.x), abs(p.x - corners.y));
    float field = exp(-corner / 0.11) + 0.9 * exp(-max(p.y - rimY, 0.0) / 0.08) + 0.5 * exp(-max(topY - p.y, 0.0) / 0.1);
    field *= 0.55 + 0.9 * fbm(p * 9.0);
    return clamp((field - 0.28) * 2.0 * grime, 0.0, 1.0);
  }
  float scumAmount(vec2 p) {
    float streak = fbm(vec2(p.x * 70.0, p.y * 3.0)) * fbm(vec2(p.x * 13.0, p.y * 1.5 + 4.0));
    // Under the shelf: drips run down from it.
    float under = smoothstep(shelf.z + 0.06, shelf.z - 0.02, abs(p.x - shelf.x)) * smoothstep(shelf.y + 0.01, shelf.y - 0.05, p.y) * exp(-(shelf.y - p.y) / 0.6);
    // Where the spray hits: back wall low, and the far end of the left wall.
    float spray = smoothstep(corners.y - 0.5, corners.y + 0.2, p.x) * smoothstep(1.5, 0.6, p.y);
    float band = exp(-max(p.y - rimY, 0.0) / 0.12);
    return clamp((under * 1.5 + spray * 0.8 + band * 0.7) * streak * 2.2 * grime, 0.0, 1.0);
  }
  float rustAmount(vec2 p) {
    float r = 0.0;
    for (int i = -1; i <= 1; i++) {
      float sx = handles.x + float(i) * 0.115;
      float wob = (vnoise(vec2(p.y * 14.0, float(i) * 3.1)) - 0.5) * 0.006;
      float w = bell((p.x - sx - wob) / 0.0065) + 0.35 * bell((p.x - sx - wob * 2.0) / 0.018);
      float below = smoothstep(handles.y - 0.01, handles.y - 0.04, p.y) * smoothstep(rimY - 0.01, rimY + 0.05, p.y);
      r += w * below * (0.4 + 0.6 * hash11(float(i) + 7.0)) * (0.6 + 0.5 * vnoise(vec2(p.y * 30.0, float(i))));
    }
    return clamp(r * grime, 0.0, 1.0);
  }
  float mineralAmount(vec2 p) {
    return clamp(exp(-max(p.y - rimY, 0.0) / 0.03) * (0.4 + fbm(p * 80.0)) * grime, 0.0, 1.0);
  }
`;

function tileUniforms() {
  const shelfS = S_BACK_CORNER + (-0.387 - WALLS.left);
  const handleS = S_BACK_CORNER + (-0.389 - WALLS.left);
  return {
    atlasOrigin: { value: new THREE.Vector2(ATLAS_S0, 0) },
    atlasSize: { value: new THREE.Vector2(ATLAS_SW, ATLAS_H) },
    tileSize: { value: TILE_SIZE },
    groutWidth: { value: GROUT_WIDTH },
    rimY: { value: WALLS.rim },
    topY: { value: WALLS.top },
    tileColor: { value: colorVec(TILE_COLOR) },
    groutColor: { value: colorVec(GROUT_COLOR) },
    variation: { value: TILE_COLOR_VARIATION },
    grime: { value: TILE_GRIME },
    corners: { value: new THREE.Vector2(S_FRONT_CORNER, S_BACK_CORNER) },
    shelf: { value: new THREE.Vector3(shelfS, 1.29, 0.175) },
    handles: { value: new THREE.Vector2(handleS, 0.745) },
  };
}

function bakeTileTextures(renderer) {
  const perMeter = isHighQuality() ? TILE_TEXELS_PER_METER_HIGH : TILE_TEXELS_PER_METER_LOW;
  const width = Math.round(ATLAS_SW * perMeter);
  const height = Math.round(ATLAS_H * perMeter);
  const uniforms = tileUniforms();

  const map = bakeTexture(renderer, {
    width, height, color: true, repeat: false, uniforms,
    fragment: TILE_COMMON + /* glsl */ `
      void main() {
        vec2 p = atlasPoint(vUv);
        vec2 id; vec2 local; float edge;
        tileAt(p, id, local, edge);
        float g = glazeMask(edge);

        vec3 glaze = tileColor * (1.0 + (hash12(id + 3.1) - 0.5) * variation * 2.0);
        glaze *= vec3(1.0 + (hash12(id + 7.0) - 0.5) * variation * 0.5, 1.0, 1.0 + (hash12(id + 9.0) - 0.5) * variation * 0.8);
        glaze *= 0.965 + 0.06 * fbm(p * 24.0 + id);
        vec3 grout = groutColor * (0.82 + 0.3 * vnoise(p * 900.0)) * (0.85 + 0.25 * fbm(p * 30.0));
        float gc = smoothstep(groutWidth * 0.5, groutWidth * 0.5 + 0.0007, edge); // crisp color edge
        vec3 col = mix(grout, glaze * (0.93 + 0.07 * g), gc);
        col = mix(col, vec3(0.74, 0.71, 0.64), chipMask(id, local, p)); // bare bisque under the glaze

        float mildew = mildewAmount(p);
        float spots = smoothstep(0.32, 0.12, worley(p * 420.0).x) * step(0.4, fbm(p * 60.0));
        col = mix(col, vec3(0.07, 0.08, 0.055), mildew * mix(0.85, spots * 0.9, g));
        col = mix(col, vec3(0.66, 0.64, 0.55), scumAmount(p) * 0.5);
        col = mix(col, vec3(0.36, 0.18, 0.07), clamp(rustAmount(p) * 1.4, 0.0, 0.9));
        col = mix(col, vec3(0.88, 0.87, 0.82), mineralAmount(p) * (1.0 - g * 0.6) * 0.6);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const normalMap = bakeNormalMap(renderer, {
    width, height, repeat: false, strength: 1.4,
    uniforms: tileUniforms(),
    heightFn: TILE_COMMON.replace('varying vec2 vUv;', '') + /* glsl */ `
      float height(vec2 uv) { return surfaceHeight(atlasPoint(uv)); }
    `,
  });

  const roughAo = bakeTexture(renderer, {
    width, height, repeat: false, uniforms: tileUniforms(),
    fragment: TILE_COMMON + /* glsl */ `
      void main() {
        vec2 p = atlasPoint(vUv);
        vec2 id; vec2 local; float edge;
        tileAt(p, id, local, edge);
        float g = glazeMask(edge);
        float gc = smoothstep(groutWidth * 0.5, groutWidth * 0.5 + 0.0007, edge);
        float rough = mix(0.86, 0.1 + 0.05 * hash12(id + 1.7) + 0.05 * fbm(p * 40.0), gc);
        rough = mix(rough, 0.75, chipMask(id, local, p));
        rough = mix(rough, 0.55, scumAmount(p));
        rough = mix(rough, 0.9, mildewAmount(p) * (1.0 - g * 0.5));
        rough = mix(rough, 0.7, mineralAmount(p) * 0.6);
        float corner = min(abs(p.x - corners.x), abs(p.x - corners.y));
        float ao = mix(0.8, 1.0, smoothstep(groutWidth * 0.5, groutWidth * 0.5 + 0.001, edge)) * (1.0 - 0.25 * exp(-corner / 0.04)) * (1.0 - 0.3 * exp(-max(p.y - rimY, 0.0) / 0.03));
        gl_FragColor = vec4(ao, rough, 0.0, 1.0);
      }
    `,
  });

  return { map, normalMap, roughAo };
}

/*
 * LIVE WATER ON THE TILES
 * Added on top of the standard material with onBeforeCompile (three.js lets you splice extra
 * shader code into its built-in materials). While the water runs, `wetness` climbs from 0 to 1:
 * condensation beads appear, and drops run down the tile leaving darker, glossier trails.
 */
const WET_UNIFORMS_GLSL = /* glsl */ `
  uniform float uTime; uniform float uWet; uniform vec2 uAtlasOrigin; uniform vec2 uAtlasSize;
  varying vec3 vWallS; varying vec3 vWallUp;
`;
const WET_FRAGMENT_GLSL = /* glsl */ `
  // Drops running down: thin columns, each with a drop sliding down and a wet trail behind it.
  vec3 runningDrops(vec2 p, float t) {
    float colW = 0.021;
    float col = floor(p.x / colW);
    float h = hash11(col * 1.37 + 0.3);
    if (h < 0.4) return vec3(0.0);
    float speed = 0.025 + 0.09 * hash11(col + 9.1);
    float cycle = 2.4;
    float head = 2.2 - mod(t * speed + hash11(col + 4.2) * cycle, cycle);
    float x = (col + 0.25 + 0.5 * hash11(col + 2.9)) * colW + (vnoise(vec2(p.y * 25.0, col)) - 0.5) * 0.004;
    float dx = p.x - x;
    float dy = p.y - head;
    float r = 0.0026 + 0.0016 * hash11(col + 6.6);
    float drop = 1.0 - smoothstep(r * 0.6, r, length(vec2(dx, dy * 0.75)));
    float trail = (1.0 - smoothstep(r * 0.25, r * 0.6, abs(dx))) * step(0.0, dy) * exp(-dy / 0.35);
    return vec3(drop, trail, dx / r);
  }
  // Condensation beads: one bead per small cell, more cells fill in as the walls get wetter.
  vec3 beads(vec2 p, float wet) {
    vec2 cell = p / 0.0048;
    vec2 i = floor(cell); vec2 f = fract(cell);
    vec2 o = hash22(i) * 0.6 + 0.2;
    // Beads gather in patches rather than an even grid, like real condensation.
    float patchy = smoothstep(0.38, 0.72, fbm(p * 11.0 + 3.0));
    float present = step(hash12(i + 3.3), wet * 0.85 * patchy);
    float r = 0.14 + 0.2 * hash12(i + 1.1);
    vec2 d = (f - o) / r;
    float dome = present * max(0.0, 1.0 - dot(d, d));
    return vec3(dome, d * present * step(dot(d, d), 1.0));
  }
`;

function addWetShader(material, high) {
  const uniforms = {
    uTime: { value: 0 },
    uWet: { value: 0 },
    uAtlasOrigin: { value: new THREE.Vector2(ATLAS_S0, 0) },
    uAtlasSize: { value: new THREE.Vector2(ATLAS_SW, ATLAS_H) },
  };
  material.userData.wetUniforms = uniforms;
  if (!high) return uniforms;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWallS; varying vec3 vWallUp;`)
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec3 wn = normalize(mat3(modelMatrix) * objectNormal);
        vWallS = normalize((viewMatrix * vec4(normalize(cross(vec3(0.0, 1.0, 0.0), wn) + 1e-5), 0.0)).xyz);
        vWallUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${WET_UNIFORMS_GLSL}\n${GLSL_NOISE}\n${WET_FRAGMENT_GLSL}`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec2 wallP = uAtlasOrigin + vMapUv * uAtlasSize;
        vec3 runD = runningDrops(wallP, uTime) * uWet;
        vec3 bd = beads(wallP, uWet);
        float wetTrail = clamp(runD.y * 0.9 + runD.x, 0.0, 1.0);
        diffuseColor.rgb *= 1.0 - 0.18 * wetTrail - 0.08 * uWet;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.04, clamp(wetTrail + bd.x * 1.5, 0.0, 1.0));
        roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.6, uWet);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        vec2 slope = bd.yz * 0.32 + vec2(runD.z, 0.4) * runD.x * 0.45;
        normal = normalize(normal + slope.x * vWallS + slope.y * vWallUp);`,
      );
  };
  material.customProgramCacheKey = () => 'wet-tile';
  return uniforms;
}

/** Off-white enamel tub, with a rust stain under the spout and a grey ring where the water sits. */
function createEnamel() {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xe6e3da,
    roughness: 0.32,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: REFLECTION_STRENGTH,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\n${GLSL_NOISE}`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec2 drainP = vWPos.xz - vec2(-0.389, -1.25);
        float floorMask = smoothstep(0.3, 0.17, vWPos.y);
        // Rust: a streak from under the spout running to the drain, and a ring around the drain.
        float streak = bell((vWPos.x + 0.389 + (vnoise(vec2(vWPos.z * 9.0, 2.0)) - 0.5) * 0.03) / 0.022);
        streak *= smoothstep(-1.5, -1.42, vWPos.z) * smoothstep(-1.08, -1.3, vWPos.z) * (0.5 + 0.6 * fbm(vWPos.xz * 40.0));
        float ring = bell((length(drainP) - 0.045) / 0.02) * floorMask * (0.4 + 0.8 * fbm(vWPos.xz * 60.0));
        float rust = clamp(streak + ring, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.3, 0.16), rust * 0.55);
        // Grey soap-and-grime ring at the old water line, and general grime on the floor.
        float waterLine = bell((vWPos.y - 0.27) / 0.012) * (0.5 + fbm(vWPos.xz * 30.0));
        diffuseColor.rgb *= 1.0 - 0.18 * waterLine - 0.1 * floorMask * fbm(vWPos.xz * 12.0);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.6, clamp(rust + waterLine * 0.5, 0.0, 1.0));`,
      );
  };
  material.customProgramCacheKey = () => 'enamel';
  return material;
}

/** Chrome with faint hard-water spots, so it isn't a perfect mirror. */
function createChrome() {
  const material = new THREE.MeshStandardMaterial({
    color: 0xe4e8ea,
    metalness: 1,
    roughness: 0.1,
    envMapIntensity: REFLECTION_STRENGTH * 2.2,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\n${GLSL_NOISE}`)
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        vec2 spotP = vWPos.xy * 310.0 + vWPos.zz * 170.0;
        float spot = smoothstep(0.3, 0.1, worley(spotP).x) * step(0.55, vnoise(vWPos.xz * 90.0 + vWPos.y * 40.0));
        roughnessFactor = mix(roughnessFactor, 0.45, spot);`,
      );
  };
  material.customProgramCacheKey = () => 'chrome-spots';
  return material;
}

/** Old silicone caulk: yellowed, with black mildew creeping into it. */
function createCaulk() {
  const material = new THREE.MeshStandardMaterial({ color: 0xd9d3bf, roughness: 0.55 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\n${GLSL_NOISE}`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float m = fbm(vec2(vWPos.x + vWPos.z, vWPos.y) * 45.0);
        float dots = smoothstep(0.35, 0.15, worley(vec2(vWPos.x + vWPos.z * 1.3, vWPos.y) * 700.0).x);
        float mold = clamp((m - 0.38) * 3.0, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.065, 0.05), clamp(mold * 0.8 + dots * mold, 0.0, 0.95));`,
      );
  };
  material.customProgramCacheKey = () => 'caulk';
  return material;
}

export function createShowerMaterials(renderer, chromeEnv) {
  const high = isHighQuality();
  const { map, normalMap, roughAo } = bakeTileTextures(renderer);
  const tile = new THREE.MeshStandardMaterial({
    map,
    normalMap,
    normalScale: new THREE.Vector2(1, 1),
    roughnessMap: roughAo,
    aoMap: roughAo,
    aoMapIntensity: 1,
    roughness: 1,
    envMapIntensity: REFLECTION_STRENGTH * 1.4,
  });
  const wet = addWetShader(tile, high);

  const enamel = createEnamel();
  const chrome = createChrome();
  chrome.envMap = chromeEnv;
  const caulk = createCaulk();

  let wetness = 0;
  return {
    tile,
    enamel,
    chrome,
    caulk,
    /** @param {number} targetWet 0..1 how wet the walls are heading toward */
    update(dt, time, targetWet, wettingTime) {
      wetness += Math.sign(targetWet - wetness) * Math.min(Math.abs(targetWet - wetness), dt / wettingTime);
      wet.uTime.value = time;
      wet.uWet.value = wetness;
    },
    getWetness: () => wetness,
  };
}
