import * as THREE from 'three';
import { GLSL_NOISE } from './bake.js';
import { isHighQuality } from './quality.js';
import { CURTAIN_COLOR, CURTAIN_SEE_THROUGH, CURTAIN_FOLD_DEPTH, CURTAIN_OPEN_EDGE_Z, REFLECTION_STRENGTH } from '../config.js';

/*
 * THE SHOWER CURTAIN
 *
 * Rebuilt in code as a sheet of vinyl hanging from rings on a chrome rod. The sheet is a grid
 * of points; each point is pushed sideways by a few overlapping waves:
 *   - tight pleats at the top, one fold between every pair of rings,
 *   - looser, wandering folds lower down where the vinyl relaxes,
 *   - a belly that sags in toward you (curtains always cling inward in a hot shower),
 *   - the hem swinging in over the tub rim, so it hangs inside the tub like a real one.
 * The mesh keeps the name "ShowerCurtain", so the gaze ray and spider spawns still find it.
 *
 * WHY IT USED TO RENDER BLACK: the curtain and rod in bathtub.glb use a metal/roughness texture
 * that marks parts of them as fully metallic. Metal has no color of its own, it only reflects its
 * surroundings, and the scene had no environment map, so metal reflected nothing: black. This
 * curtain is non-metallic vinyl, and the rod is chrome lit by the new environment map.
 */

// Measured from bathtub.glb, in world meters.
const ROD_X = -0.058;
const ROD_Y = 2.078;
const FRONT_Z = -0.026; // front wall, where the bunched curtain starts
const BACK_Z = -1.498; // back wall, where the rod ends
const RIM_INNER_X = -0.1; // inside edge of the tub rim
const RIM_Y = 0.469;
const HEM_Y = 0.3;

// Where the curtain's free edge is (CURTAIN_OPEN_EDGE_Z in config.js). The original reached
// z = -0.98; pulling it back to -0.78 widens the gap so the vanity and the Raid can are visible.
export const CURTAIN_EDGE_Z = CURTAIN_OPEN_EDGE_Z;
const RING_COUNT = 12;
const RING_RADIUS = 0.021;
const ROD_RADIUS = 0.0115;

function buildClothGeometry(high) {
  const segZ = high ? 150 : 80;
  const segY = high ? 110 : 56;
  const geometry = new THREE.PlaneGeometry(1, 1, segZ, segY);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;

  const topY = ROD_Y - ROD_RADIUS - RING_RADIUS * 1.75;
  const width = FRONT_Z - CURTAIN_EDGE_Z; // meters along the rod
  const spacing = width / (RING_COUNT - 1);
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    const u = uv.getX(i); // 0 = wall end, 1 = free edge
    const t = 1 - uv.getY(i); // 0 = top, 1 = hem
    const along = u * width;
    const y = THREE.MathUtils.lerp(topY, HEM_Y, t);

    // Pleats between rings, strongest at the top.
    const pleat = Math.sin((along / spacing) * Math.PI) * CURTAIN_FOLD_DEPTH * (1 - t * 0.55);
    // Lower folds: longer, drifting sideways as they go down, so they don't look stamped.
    const drift = Math.sin(t * 4.1 + u * 3.0) * 0.6 + t * 1.3;
    const relaxed = Math.sin((along / (spacing * 1.6)) * Math.PI + drift) * CURTAIN_FOLD_DEPTH * 0.9 * t
      + Math.sin((along / (spacing * 0.75)) * Math.PI + drift * 1.7) * CURTAIN_FOLD_DEPTH * 0.25 * t;
    // Belly sagging in toward the player, mostly at mid height.
    const belly = -0.07 * Math.sin(Math.PI * Math.min(1, t * 1.1)) * Math.sin(Math.PI * (0.15 + u * 0.8));
    // Below the rim height the vinyl has to be inside the tub.
    const tuck = THREE.MathUtils.smoothstep(y, RIM_Y + 0.28, RIM_Y + 0.02) * (RIM_INNER_X - 0.035 - ROD_X);
    // The free edge curls a little.
    const curl = Math.pow(u, 12) * 0.03 * Math.sin(t * 5);
    // The free edge swings back toward the wall a little at the bottom, like a pulled-open curtain.
    const flare = Math.pow(u, 3) * t * 0.05;

    let x = ROD_X + pleat + relaxed + belly + tuck + curl;
    // Keep the cloth clear of the rim no matter how the waves add up.
    if (y < RIM_Y + 0.03) x = Math.min(x, RIM_INNER_X - 0.012);
    v.set(x, y, FRONT_Z - along + flare);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function createCurtainMaterial(high) {
  // High quality: real frosted see-through (transmission blurs what's behind it, like vinyl).
  // Low quality: plain transparency, which is cheaper but looks more like clear plastic.
  const material = new THREE.MeshPhysicalMaterial({
    color: CURTAIN_COLOR,
    roughness: high ? 0.5 : 0.42,
    metalness: 0,
    transparent: !high,
    opacity: high ? 1 : 1 - CURTAIN_SEE_THROUGH,
    transmission: high ? CURTAIN_SEE_THROUGH * 1.6 : 0,
    thickness: 0.0006,
    ior: 1.4,
    side: THREE.DoubleSide,
    clearcoat: 0.6,
    clearcoatRoughness: 0.3,
    envMapIntensity: REFLECTION_STRENGTH,
    emissive: 0x2a3440,
    emissiveIntensity: 1,
  });
  const uniforms = { uGlow: { value: 1 } };
  material.userData.uniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGlow = uniforms.uGlow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nuniform float uGlow;\n${GLSL_NOISE}`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // Mildew climbing up from the hem: pink-orange bloom with black specks, and a grey tide line.
        vec2 cp = vec2(vWPos.z, vWPos.y);
        float fromHem = vWPos.y - ${HEM_Y.toFixed(3)};
        float mildew = clamp((exp(-fromHem / 0.09) * (0.5 + fbm(cp * 14.0)) - 0.25) * 1.6, 0.0, 1.0);
        float specks = smoothstep(0.3, 0.1, worley(cp * 380.0).x) * step(0.45, fbm(cp * 30.0)) * exp(-fromHem / 0.22);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.32, 0.27), mildew * 0.6);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.05, 0.04), specks * 0.85);
        diffuseColor.rgb *= 1.0 - 0.12 * bell((fromHem - 0.16) / 0.03);
        diffuseColor.a = mix(diffuseColor.a, 1.0, clamp(mildew * 0.5 + specks, 0.0, 1.0));
        // A faint frosted mottle so it isn't a perfect plastic sheet.
        diffuseColor.rgb *= 0.95 + 0.08 * fbm(cp * 6.0);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // Light from the bathroom glowing through the vinyl, brighter higher up, nearer the light.
        totalEmissiveRadiance *= uGlow * (0.45 + 0.9 * smoothstep(0.4, 2.0, vWPos.y));`,
      );
    if (high) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        // Water beads on the lower half.
        vec2 bc = cp / 0.009; vec2 bi = floor(bc); vec2 bf = fract(bc) - (hash22(bi) * 0.6 + 0.2);
        float br = 0.16 + 0.22 * hash12(bi + 2.0);
        float has = step(hash12(bi + 5.0), 0.55 * smoothstep(1.5, 0.6, vWPos.y));
        vec2 bd = bf / br;
        float inside = has * step(dot(bd, bd), 1.0);
        normal = normalize(normal + vec3(bd * inside * 0.6, 0.0));`,
      );
    }
  };
  material.customProgramCacheKey = () => (high ? 'curtain-hi' : 'curtain-lo');
  return material;
}

/** Rebuilds the curtain in place. Returns an update function for the glow flicker. */
export function dressCurtain(level, chrome) {
  const curtain = level.getObjectByName('ShowerCurtain');
  if (!curtain || !curtain.isMesh) {
    console.warn('No "ShowerCurtain" mesh in bathtub.glb, skipping the curtain art.');
    return { update: () => {} };
  }
  const high = isHighQuality();

  // The new cloth is built in world space; move it into the curtain object's own space.
  curtain.updateWorldMatrix(true, false);
  const toLocal = curtain.matrixWorld.clone().invert();
  const cloth = buildClothGeometry(high).applyMatrix4(toLocal);
  curtain.geometry.dispose();
  curtain.geometry = cloth;
  curtain.material = createCurtainMaterial(high);
  curtain.castShadow = true;
  curtain.receiveShadow = false;

  const art = new THREE.Group();
  art.name = 'CurtainHardware';
  art.matrixAutoUpdate = false;
  art.matrix.copy(toLocal);
  curtain.add(art);

  // The rod, wall to wall, with a flange at each end.
  const rodLength = FRONT_Z - BACK_Z;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(ROD_RADIUS, ROD_RADIUS, rodLength, 20), chrome);
  rod.rotation.x = Math.PI / 2;
  rod.position.set(ROD_X, ROD_Y, (FRONT_Z + BACK_Z) / 2);
  rod.castShadow = true;
  art.add(rod);
  for (const z of [FRONT_Z, BACK_Z]) {
    const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.028, 0.012, 24), chrome);
    flange.rotation.x = Math.PI / 2;
    flange.position.set(ROD_X, ROD_Y, z + (z === FRONT_Z ? -0.006 : 0.006));
    art.add(flange);
  }

  // Rings: one shared torus shape drawn 13 times in one go (an InstancedMesh).
  const ring = new THREE.TorusGeometry(RING_RADIUS, 0.0022, 8, 28);
  const rings = new THREE.InstancedMesh(ring, chrome, RING_COUNT);
  const grommets = new THREE.InstancedMesh(
    new THREE.TorusGeometry(0.0055, 0.0018, 6, 16),
    new THREE.MeshStandardMaterial({ color: 0xb8bcbc, metalness: 0.8, roughness: 0.35 }),
    RING_COUNT,
  );
  const matrix = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const width = FRONT_Z - CURTAIN_EDGE_Z;
  for (let i = 0; i < RING_COUNT; i++) {
    const z = FRONT_Z - (i / (RING_COUNT - 1)) * width;
    // Each ring hangs off the rod, tilted a little differently, like they've been yanked.
    q.setFromEuler(new THREE.Euler(0, Math.PI / 2 + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.2));
    matrix.compose(new THREE.Vector3(ROD_X, ROD_Y - RING_RADIUS + ROD_RADIUS, z), q, new THREE.Vector3(1, 1, 1));
    rings.setMatrixAt(i, matrix);
    q.setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
    matrix.compose(new THREE.Vector3(ROD_X, ROD_Y - ROD_RADIUS - RING_RADIUS * 1.6, z), q, new THREE.Vector3(1, 1, 1));
    grommets.setMatrixAt(i, matrix);
  }
  rings.castShadow = true;
  art.add(rings, grommets);

  const glow = curtain.material.userData.uniforms.uGlow;
  return {
    /** @param {number} level 0..1 how bright the room light outside is right now */
    update(lightLevel) {
      glow.value = lightLevel;
    },
  };
}
