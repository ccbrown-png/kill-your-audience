import * as THREE from 'three';
import { meshSDF, smin, smax, sdEllipsoid, sdTaperedCapsule } from './sdfMesher.js';
import { GLSL_NOISE, canvasTexture } from './bake.js';
import { isHighQuality } from './quality.js';
import { FEET_SPACING, FEET_FALLBACK_FLOOR_Y, SKIN_TONE, SKIN_WETNESS } from '../config.js';

/*
 * FEET
 *
 * Two bare feet standing in the tub, only ever seen when you look down. Each foot is one
 * sculpted surface (see sdfMesher.js): heel, the arch (lifted on the inside), the ball of the
 * foot, the instep, five toes that arch up and press their pads down, the two ankle bones, the
 * Achilles tendon, and the very start of the shin. The shin dissolves away (a dither fade) a
 * hand's width above the ankle, so there is never a cut edge and never anything above it.
 * Wet skin, toenails, a film of water round the feet and a few traces of soap foam.
 *
 * Local space of a RIGHT foot, in meters: the floor under the ankle is the origin, toes toward
 * -Z, up is +Y, the big toe on the inside (-X). The left foot is the same mesh mirrored.
 */

const CM = 0.01;
// Height above the floor where the shin starts to fade out, and where it's completely gone.
const FADE_START = 0.2;
const FADE_END = 0.29;

// Toes: x across the foot, joint at the ball, length, radius. Big toe first. Centimeters.
const TOES = [
  { x: -3.25, z: -14.6, length: 3.5, radius: 1.5 },
  { x: -1.0, z: -15.0, length: 2.9, radius: 0.98 },
  { x: 0.8, z: -14.6, length: 2.6, radius: 0.92 },
  { x: 2.4, z: -13.9, length: 2.3, radius: 0.86 },
  { x: 3.8, z: -12.8, length: 1.9, radius: 0.82 },
];

function toeChain(toe) {
  // Each toe rises from its joint, then turns down so the pad touches the floor (a slight claw).
  const mtp = new THREE.Vector3(toe.x * CM, 2.3 * CM, toe.z * CM);
  const splay = (toe.x / 4) * 0.12;
  const d1 = new THREE.Vector3(splay, 0.22, -1).normalize();
  const pip = mtp.clone().addScaledVector(d1, toe.length * 0.55 * CM);
  const d2 = new THREE.Vector3(splay, -0.6, -1).normalize();
  const tip = pip.clone().addScaledVector(d2, toe.length * 0.45 * CM);
  tip.y = Math.max(tip.y, toe.radius * 0.85 * CM);
  return { mtp, pip, tip, dir: tip.clone().sub(pip).normalize(), r: toe.radius * CM };
}

function footSDF() {
  const E = (c, r) => (x, y, z) => sdEllipsoid(x, y, z, c[0] * CM, c[1] * CM, c[2] * CM, r[0] * CM, r[1] * CM, r[2] * CM);
  const T = (a, b, ra, rb) => (x, y, z) => sdTaperedCapsule(x, y, z, a[0] * CM, a[1] * CM, a[2] * CM, b[0] * CM, b[1] * CM, b[2] * CM, ra * CM, rb * CM);
  const heel = E([0.2, 3.3, 4.6], [3.2, 3.5, 3.6]);
  const mid = E([0.6, 4.2, -4.0], [4.0, 3.1, 7.6]);
  const ball = E([-0.2, 2.3, -12.6], [5.4, 2.35, 3.4]);
  const instep = E([-0.6, 6.4, -2.0], [3.1, 2.6, 5.2]);
  const archCut = E([-4.6, -0.6, -4.5], [2.6, 2.3, 5.2]); // lifts the inside of the sole
  const ankle = T([0, 6, 1.6], [0.1, 15, 2.6], 3.0, 2.7);
  const medial = E([-2.5, 8.9, 2.0], [1.2, 1.4, 1.3]); // inner ankle bone, higher
  const lateral = E([2.6, 7.9, 2.6], [1.15, 1.35, 1.25]); // outer ankle bone, lower
  const achilles = T([0, 5.5, 6.3], [0, 17, 4.4], 1.7, 1.9);
  const shin = T([0, 13, 2.4], [0.2, 36, 3.6], 2.85, 3.6);
  const toes = TOES.map(toeChain).map((t) => {
    const a = T(t.mtp.toArray().map((v) => v / CM), t.pip.toArray().map((v) => v / CM), t.r / CM * 1.05, t.r / CM * 0.92);
    const b = T(t.pip.toArray().map((v) => v / CM), t.tip.toArray().map((v) => v / CM), t.r / CM * 0.92, t.r / CM * 0.8);
    return (x, y, z) => smin(a(x, y, z), b(x, y, z), 0.3 * CM);
  });

  return (x, y, z) => {
    let d = smin(heel(x, y, z), mid(x, y, z), 2.0 * CM);
    d = smin(d, ball(x, y, z), 2.2 * CM);
    d = smin(d, instep(x, y, z), 1.8 * CM);
    d = smax(d, -archCut(x, y, z), 1.0 * CM);
    d = smin(d, ankle(x, y, z), 2.2 * CM);
    d = smin(d, medial(x, y, z), 0.8 * CM);
    d = smin(d, lateral(x, y, z), 0.8 * CM);
    d = smin(d, achilles(x, y, z), 1.2 * CM);
    d = smin(d, shin(x, y, z), 2.5 * CM);
    for (const toe of toes) d = smin(d, toe(x, y, z), 0.6 * CM);
    // Flat where it stands on the tub.
    return Math.max(d, -y);
  };
}

function createSkin() {
  const material = new THREE.MeshPhysicalMaterial({
    color: SKIN_TONE,
    roughness: 0.55,
    clearcoat: SKIN_WETNESS * 0.85,
    clearcoatRoughness: 0.2,
    sheen: 0.3,
    sheenColor: new THREE.Color(0xff8f78),
    sheenRoughness: 0.6,
    alphaHash: true, // dithered fade at the top of the shin, no sorting problems
    side: THREE.DoubleSide, // the inside shows where the shin fades out, so it's painted dark (below)
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj; varying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position; vObjN = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vObj; varying vec3 vObjN;\n${GLSL_NOISE}`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec3 skin = diffuseColor.rgb;
        // Redder toes and heel, paler sole, a little blotchy.
        float toes = smoothstep(-0.11, -0.16, vObj.z);
        float heel = smoothstep(0.03, 0.075, vObj.z) * smoothstep(0.06, 0.02, vObj.y);
        float sole = smoothstep(0.018, 0.004, vObj.y);
        skin = mix(skin, skin * vec3(1.12, 0.85, 0.82), clamp(toes * 0.7 + heel * 0.5, 0.0, 1.0));
        skin = mix(skin, skin * vec3(1.06, 1.0, 0.94) + 0.03, sole * 0.6);
        // Wrinkles across the top of the toe joints and the front of the ankle.
        float wr = bell((vObj.z + 0.142) / 0.006) * (0.5 + 0.5 * sin(vObj.z * 2400.0)) * step(0.5, vObjN.y);
        wr += bell((vObj.y - 0.075) / 0.012) * (0.5 + 0.5 * sin(vObj.y * 1800.0)) * smoothstep(-0.3, -0.8, vObjN.z);
        skin *= 1.0 - wr * 0.18;
        skin *= 0.93 + 0.12 * fbm(vObj.xz * 220.0 + vObj.y * 90.0);
        // The legs sink into shadow before they fade away, and the inside of the shin is dark.
        skin *= mix(1.0, 0.08, smoothstep(${(FADE_START - 0.06).toFixed(3)}, ${FADE_END.toFixed(3)}, vObj.y));
        if (!gl_FrontFacing) skin = vec3(0.01, 0.008, 0.008);
        diffuseColor.rgb = skin;
        diffuseColor.a = 1.0 - smoothstep(${FADE_START.toFixed(3)}, ${FADE_END.toFixed(3)}, vObj.y);`,
      );
  };
  material.customProgramCacheKey = () => 'skin-feet';
  return material;
}

function toenails(material) {
  // Curved plates on top of each toe tip, the big toe's the biggest.
  const geo = new THREE.CylinderGeometry(1, 1, 1.1, 10, 1, true, -1.0, 2.0);
  geo.rotateY(Math.PI);
  geo.rotateX(-Math.PI / 2); // plate lies along -Z, curving over +Y
  const nails = new THREE.InstancedMesh(geo, material, TOES.length);
  TOES.map(toeChain).forEach((t, i) => {
    const r = t.r * 0.78;
    const center = t.tip.clone().addScaledVector(t.dir, -t.r * 0.55);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), t.dir);
    nails.setMatrixAt(i, new THREE.Matrix4().compose(center.add(new THREE.Vector3(0, t.r * 0.08, 0)), q, new THREE.Vector3(r, r, r * (i === 0 ? 1.1 : 0.9))));
  });
  nails.castShadow = false;
  return nails;
}

export function waterFilm() {
  // A thin glossy layer of standing water around the feet, fading out at the edges.
  const alpha = canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.6, 'rgba(200,200,200,0.8)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { color: false });
  const film = new THREE.Mesh(
    new THREE.CircleGeometry(0.3, 40),
    new THREE.MeshPhysicalMaterial({ color: 0x9fb2bd, roughness: 0.03, transparent: true, alphaMap: alpha, opacity: 0.55, depthWrite: false, clearcoat: 1 }),
  );
  film.rotation.x = -Math.PI / 2;
  film.scale.set(1, 1.4, 1);
  film.position.y = 0.0025;
  film.renderOrder = 2;
  return film;
}

function foam() {
  // Soap foam: little clusters of flattened bubbles on the tub floor near the feet.
  const bubble = new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const count = 120;
  const mesh = new THREE.InstancedMesh(bubble, new THREE.MeshPhysicalMaterial({ color: 0xeef2f2, roughness: 0.35, transparent: true, opacity: 0.85, clearcoat: 1 }), count);
  const clusters = [[-0.17, 0.02], [0.15, -0.06], [-0.02, -0.24], [0.2, 0.12], [-0.12, -0.18]];
  for (let i = 0; i < count; i++) {
    const [cx, cz] = clusters[i % clusters.length];
    const r = 0.002 + Math.random() ** 2 * 0.007;
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() ** 0.7 * 0.045;
    mesh.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(cx + Math.cos(a) * d, 0.001, cz + Math.sin(a) * d), new THREE.Quaternion(), new THREE.Vector3(r, r * 0.6, r)));
  }
  mesh.receiveShadow = true;
  return mesh;
}

/** Stands the feet on the floor directly below the player, facing the way the player starts out facing. */
export function createFeet(scene, level, playerPosition, playerForward) {
  const raycaster = new THREE.Raycaster();
  raycaster.set(playerPosition, new THREE.Vector3(0, -1, 0));
  const hit = raycaster.intersectObject(level, true)[0];
  if (!hit) console.warn('No floor found below the player, using FEET_FALLBACK_FLOOR_Y for the feet.');
  const floorY = hit ? hit.point.y : FEET_FALLBACK_FLOOR_Y;

  const cell = (isHighQuality() ? 2.4 : 3.2) * CM * 0.1;
  const geometry = meshSDF(footSDF(), new THREE.Box3(new THREE.Vector3(-0.075, -0.004, -0.235), new THREE.Vector3(0.075, FADE_END + 0.01, 0.1)), cell);
  const skin = createSkin();
  const nailMaterial = new THREE.MeshPhysicalMaterial({ color: 0xe9c2b6, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
  const dropMaterial = new THREE.MeshPhysicalMaterial({ color: 0xc9d2d8, roughness: 0.02, transparent: true, opacity: 0.25, clearcoat: 1, depthWrite: false });

  const feet = new THREE.Group();
  feet.name = 'Feet';
  feet.position.set(playerPosition.x, floorY, playerPosition.z);
  feet.rotation.y = Math.atan2(-playerForward.x, -playerForward.z);
  // A little in front of where your eyes are, the way you'd actually stand.
  feet.translateZ(-0.05);

  // Droplets on the tops of the feet.
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), dropMaterial, 30);
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  let placed = 0;
  for (let i = 0; i < 600 && placed < 30; i++) {
    const k = Math.floor(Math.random() * pos.count);
    const n = new THREE.Vector3().fromBufferAttribute(nor, k);
    const p = new THREE.Vector3().fromBufferAttribute(pos, k);
    if (n.y < 0.5 || p.y > FADE_START - 0.03) continue;
    const s = 0.0012 + Math.random() * 0.0016;
    drops.setMatrixAt(placed++, new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n), new THREE.Vector3(s, s * 0.55, s)));
  }
  drops.count = placed;

  for (const side of [-1, 1]) {
    const foot = new THREE.Group();
    foot.scale.x = side; // the mesh is a right foot (on the +x side); mirror it for the left
    foot.position.x = side * FEET_SPACING / 2;
    foot.rotation.y = side * -0.12; // toes turned out a touch
    const mesh = new THREE.Mesh(geometry, skin);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    foot.add(mesh, toenails(nailMaterial), drops.clone());
    feet.add(foot);
  }
  feet.add(waterFilm(), foam());
  scene.add(feet);
  return feet;
}
