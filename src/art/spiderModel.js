import * as THREE from 'three';
import { meshSDF, smin, smax, sdEllipsoid, sdTaperedCapsule } from './sdfMesher.js';
import { GLSL_NOISE } from './bake.js';
import {
  SPIDER_SIZE,
  SPIDER_COLOR,
  SPIDER_MARKING_COLOR,
  SPIDER_HAIR_COUNT,
  LEG_TWITCH_SPEED,
  LEG_TWITCH_AMOUNT,
} from '../config.js';

/*
 * THE SPIDER
 *
 * Built in "spider units": body about 1 unit long, head toward +Z, feet on y = 0. The whole
 * thing is scaled by SPIDER_SIZE to real meters.
 *
 * ANATOMY
 *  - Cephalothorax (front body) with a raised head, a dent in the middle (the fovea), a pale
 *    stripe down the middle and dark grooves fanning out from the dent.
 *  - Abdomen: an oval with a chevron "leaf" pattern down its back and a faint sheen.
 *  - 8 eyes in two rows, the front middle pair biggest (with a dull red glint, for the B-movie).
 *  - Chelicerae (the jaw bulbs) with curved black fangs, and two pedipalps (the little "arms").
 *  - 8 legs, each in six real segments: coxa, femur, patella, tibia, metatarsus, tarsus, with
 *    two tiny claws at the tip. Segments taper, bulge at the joints, and carry a few spines.
 *    The knee (femur to patella) peaks above the body, like a real spider.
 *  - Fine hair: short bristles scattered over the body, drawn as one instanced mesh.
 *
 * HOW IT MOVES WITHOUT A BLENDER RIG
 * Every segment is a "bone": an invisible joint in a chain (hip > coxa > femur > ...). The whole
 * spider is ONE mesh whose vertices each follow one bone rigidly. Turning a bone in code turns
 * everything after it in the chain. Because the mesh and materials are built once and shared,
 * ten spiders cost about the same as one, and each spider is a single draw call plus its hair.
 *
 * Gait: legs move in two alternating sets of four (left 1, right 2, left 3, right 4, then the
 * other four), the way real spiders walk. Each leg swings forward while lifted, then pushes back
 * on the ground. When the spider stops, legs settle and twitch now and then. When sprayed, every
 * joint flails.
 */

// Leg attachment along the side of the body (z), fan angle (negative = pointing forward), and length scale.
const LEGS = [
  { z: 0.255, fan: -60, scale: 1.12 },
  { z: 0.185, fan: -24, scale: 1.0 },
  { z: 0.11, fan: 16, scale: 0.88 },
  { z: 0.03, fan: 50, scale: 1.08 },
];
// name, length, radius at base, radius at tip, resting bend (degrees, + = up), spines
const SEGMENTS = [
  { name: 'coxa', length: 0.07, r0: 0.036, r1: 0.031, bend: -14, spines: 0 },
  { name: 'femur', length: 0.4, r0: 0.033, r1: 0.027, bend: 58, spines: 4 },
  { name: 'patella', length: 0.11, r0: 0.027, r1: 0.023, bend: -74, spines: 0 },
  { name: 'tibia', length: 0.33, r0: 0.025, r1: 0.019, bend: -26, spines: 4 },
  { name: 'metatarsus', length: 0.33, r0: 0.017, r1: 0.012, bend: -14, spines: 3 },
  { name: 'tarsus', length: 0.15, r0: 0.012, r1: 0.0075, bend: 30, spines: 0 },
];
const PALP_SEGMENTS = [
  { length: 0.09, r0: 0.018, r1: 0.016, bend: 35 },
  { length: 0.05, r0: 0.016, r1: 0.015, bend: -60 },
  { length: 0.06, r0: 0.015, r1: 0.014, bend: -25 },
  { length: 0.07, r0: 0.02, r1: 0.012, bend: -20 },
];

// Death pose: legs fold in over the belly.
const CURL = { femur: 75, patella: -110, tibia: -80, metatarsus: -55, tarsus: -20 };
const FLIP_HOP = 0.5;

const deg = THREE.MathUtils.degToRad;

// --- Body shape as a distance function ------------------------------------------------------

function bodySDF(H) {
  return (x, y, z) => {
    // Cephalothorax: a flattened oval with a raised head at the front.
    let d = sdEllipsoid(x, y, z, 0, H + 0.03, 0.12, 0.165, 0.075, 0.215);
    d = smin(d, sdEllipsoid(x, y, z, 0, H + 0.075, 0.235, 0.105, 0.055, 0.1), 0.06);
    // Fovea: a small dent in the middle of the back.
    d = smax(d, -sdEllipsoid(x, y, z, 0, H + 0.115, 0.07, 0.022, 0.02, 0.03), 0.02);
    // Chelicerae: two bulbs hanging under the front.
    for (const s of [-1, 1]) {
      d = smin(d, sdEllipsoid(x, y, z, s * 0.042, H - 0.005, 0.315, 0.04, 0.065, 0.045), 0.025);
    }
    // Pedicel (the waist) and abdomen, slightly raised, narrowing toward the rear.
    d = smin(d, sdTaperedCapsule(x, y, z, 0, H + 0.02, -0.05, 0, H + 0.04, -0.13, 0.04, 0.035), 0.03);
    const taper = 1 - 0.18 * Math.max(0, -(z + 0.36) / 0.27);
    d = smin(d, sdEllipsoid(x / taper, y, z, 0, H + 0.085, -0.37, 0.185, 0.155, 0.27), 0.04);
    // Spinnerets: a little nub at the very back.
    d = smin(d, sdEllipsoid(x, y, z, 0, H + 0.03, -0.625, 0.025, 0.022, 0.03), 0.02);
    return d;
  };
}

// --- Leg segment shapes ----------------------------------------------------------------------

/** A tapered segment lying along +X from the origin, with a bulge at its base joint. */
function segmentGeometry(length, r0, r1, radial = 6) {
  const profile = [];
  const steps = 7;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const joint = Math.exp(-((t - 0.04) ** 2) / 0.004) * 0.22; // knuckle bulge at the base
    const end = 1 - 0.25 * Math.max(0, (t - 0.9) / 0.1); // narrows into the next joint
    profile.push(new THREE.Vector2((r0 + (r1 - r0) * t) * (1 + joint) * end, t * length));
  }
  profile.unshift(new THREE.Vector2(0.0001, -r0 * 0.4));
  profile.push(new THREE.Vector2(0.0001, length + r1 * 0.3));
  const geometry = new THREE.LatheGeometry(profile, radial);
  geometry.rotateZ(-Math.PI / 2); // lathe axis (+Y) now points along +X
  geometry.deleteAttribute('uv');
  return geometry;
}

function spineGeometry() {
  const g = new THREE.ConeGeometry(0.0045, 0.055, 3, 1);
  g.translate(0, 0.0275, 0);
  g.deleteAttribute('uv');
  return g;
}

function clawGeometry() {
  // A tiny hook: a cone bent down at the end.
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.018, 0.004, 0), new THREE.Vector3(0.026, -0.012, 0));
  const g = new THREE.TubeGeometry(curve, 4, 0.0024, 3, false);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = Math.min(1, v.x / 0.026);
    const s = 1 - 0.8 * t;
    p.setXYZ(i, v.x, v.y * (0.4 + 0.6 * s), v.z * s);
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

function fangGeometry() {
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.04, 0.01), new THREE.Vector3(0, -0.05, -0.035));
  const g = new THREE.TubeGeometry(curve, 6, 0.008, 5, false);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const pt = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = i / p.count; // tube vertices run along the curve
    curve.getPoint(Math.min(1, t * 1.02), pt);
    v.sub(pt).multiplyScalar(1 - 0.85 * t).add(pt);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

// --- Building the shared mesh ------------------------------------------------------------------

/** Makes the bone chain for one spider, in its resting pose. Returns the root and named joints. */
function buildBones(H) {
  const root = new THREE.Bone();
  root.name = 'body';
  const abdomen = new THREE.Bone();
  abdomen.name = 'abdomen';
  abdomen.position.set(0, H + 0.04, -0.12);
  root.add(abdomen);

  const legs = [];
  for (const side of [1, -1]) {
    LEGS.forEach((layout, index) => {
      const hip = new THREE.Bone();
      hip.position.set(side * 0.115, H + 0.0, layout.z);
      hip.rotation.y = side === 1 ? deg(layout.fan) : Math.PI - deg(layout.fan);
      hip.scale.setScalar(layout.scale);
      root.add(hip);
      const joints = [];
      let parent = hip;
      let offset = 0;
      for (const seg of SEGMENTS) {
        const bone = new THREE.Bone();
        bone.position.x = offset;
        bone.rotation.z = deg(seg.bend);
        parent.add(bone);
        joints.push(bone);
        parent = bone;
        offset = seg.length;
      }
      legs.push({ side, index, hip, joints });
    });
  }

  const palps = [];
  for (const side of [1, -1]) {
    const base = new THREE.Bone();
    base.position.set(side * 0.055, H + 0.005, 0.3);
    base.rotation.y = side === 1 ? deg(-70) : Math.PI - deg(-70);
    root.add(base);
    const joints = [];
    let parent = base;
    let offset = 0;
    for (const seg of PALP_SEGMENTS) {
      const bone = new THREE.Bone();
      bone.position.x = offset;
      bone.rotation.z = deg(seg.bend);
      parent.add(bone);
      joints.push(bone);
      parent = bone;
      offset = seg.length;
    }
    palps.push({ side, base, joints });
  }

  const fangs = [];
  for (const side of [1, -1]) {
    const fang = new THREE.Bone();
    fang.position.set(side * 0.04, H - 0.06, 0.34);
    root.add(fang);
    fangs.push(fang);
  }
  return { root, abdomen, legs, palps, fangs };
}

/** Leg I to IV: lowers or raises the femur until the claw tips touch the ground (y = 0). */
function settleLegs(rig) {
  rig.root.updateMatrixWorld(true);
  for (const leg of rig.legs) {
    const tip = new THREE.Vector3();
    const tarsus = leg.joints[leg.joints.length - 1];
    let lo = deg(20);
    let hi = deg(85);
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      leg.joints[1].rotation.z = mid;
      leg.hip.updateMatrixWorld(true);
      tip.set(SEGMENTS[SEGMENTS.length - 1].length, 0, 0).applyMatrix4(tarsus.matrixWorld);
      if (tip.y > 0) hi = mid;
      else lo = mid;
    }
    leg.restFemur = leg.joints[1].rotation.z;
  }
}

let shared = null;

function buildShared() {
  // Hip height: tuned so the knees sit above the body and the feet land on the ground.
  const H = 0.36;
  const template = buildBones(H);
  settleLegs(template);
  template.root.updateMatrixWorld(true);
  const bones = [];
  template.root.traverse((b) => { if (b.isBone) bones.push(b); });
  const boneIndex = new Map(bones.map((b, i) => [b, i]));

  // Merged arrays for the one big mesh.
  const position = [];
  const normal = [];
  const skinIndex = [];
  const skinWeight = [];
  const part = []; // 0 body, 1 abdomen, 2 leg, 3 palp, 4 claw/fang
  const along = []; // 0..1 along a leg segment, for the banding pattern
  const index = [];
  const groups = []; // [start, count, materialIndex]
  const m = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  const v = new THREE.Vector3();

  function addGeometry(geometry, matrix, boneA, { boneB = null, weightFn = null, partId = 0, alongFn = null, material = 0 }) {
    const base = position.length / 3;
    const g = geometry;
    const p = g.attributes.position;
    const n = g.attributes.normal;
    nm.getNormalMatrix(matrix);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const local = v.clone();
      v.applyMatrix4(matrix);
      position.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      normal.push(v.x, v.y, v.z);
      const w = weightFn ? weightFn(position[position.length - 3], position[position.length - 2], position[position.length - 1]) : 1;
      skinIndex.push(boneIndex.get(boneA), boneB ? boneIndex.get(boneB) : 0, 0, 0);
      skinWeight.push(w, 1 - w, 0, 0);
      part.push(partId);
      along.push(alongFn ? alongFn(local) : 0);
    }
    const start = index.length;
    if (g.index) for (let i = 0; i < g.index.count; i++) index.push(base + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) index.push(base + i);
    groups.push([start, index.length - start, material]);
  }

  // Body: one sculpted surface, the abdomen half following the abdomen bone (blended across the waist).
  const sdf = bodySDF(H);
  const body = meshSDF(sdf, new THREE.Box3(new THREE.Vector3(-0.24, H - 0.12, -0.7), new THREE.Vector3(0.24, H + 0.3, 0.42)), 0.0235);
  const waist = (x, y, z) => THREE.MathUtils.smoothstep(z, -0.15, -0.06); // 1 = body bone, 0 = abdomen bone
  addGeometry(body, new THREE.Matrix4(), template.root, {
    boneB: template.abdomen,
    weightFn: waist,
    partId: 0,
  });
  // Mark abdomen vertices (by position) for the pattern shader.
  const bodyVerts = body.attributes.position.count;
  for (let i = position.length / 3 - bodyVerts; i < position.length / 3; i++) if (position[i * 3 + 2] < -0.1) part[i] = 1;

  // Eyes: two rows, pushed onto the carapace surface and half sunk into it.
  const eyeSpec = [
    [0.022, 0.1, 0.33, 0.019], [0.058, 0.088, 0.315, 0.012], [0.03, 0.128, 0.295, 0.012], [0.075, 0.112, 0.275, 0.013],
  ];
  const eyeGeo = new THREE.SphereGeometry(1, 12, 8);
  eyeGeo.deleteAttribute('uv');
  const n = new THREE.Vector3();
  for (const [ex, ey, ez, r] of eyeSpec) {
    for (const s of [-1, 1]) {
      const c = new THREE.Vector3(s * ex, H + ey, ez);
      for (let k = 0; k < 6; k++) {
        const h = 0.002;
        n.set(sdf(c.x + h, c.y, c.z) - sdf(c.x - h, c.y, c.z), sdf(c.x, c.y + h, c.z) - sdf(c.x, c.y - h, c.z), sdf(c.x, c.y, c.z + h) - sdf(c.x, c.y, c.z - h)).normalize();
        c.addScaledVector(n, -sdf(c.x, c.y, c.z));
      }
      c.addScaledVector(n, -r * 0.35);
      m.compose(c, new THREE.Quaternion(), new THREE.Vector3(r, r, r));
      addGeometry(eyeGeo, m, template.root, { partId: 5, material: 1 });
    }
  }

  // Fangs, bound to their own bones so they can flare.
  const fang = fangGeometry();
  for (const bone of template.fangs) addGeometry(fang, bone.matrixWorld, bone, { partId: 4, material: 1 });

  // Legs: each segment's shape, plus spines on the long segments and claws on the tarsus.
  const segGeos = SEGMENTS.map((s) => segmentGeometry(s.length, s.r0, s.r1));
  const spine = spineGeometry();
  const claw = clawGeometry();
  const spineM = new THREE.Matrix4();
  for (const leg of template.legs) {
    leg.joints.forEach((bone, si) => {
      const seg = SEGMENTS[si];
      addGeometry(segGeos[si], bone.matrixWorld, bone, { partId: 2, alongFn: (p) => p.x / seg.length });
      for (let k = 0; k < seg.spines; k++) {
        const t = 0.2 + (k / seg.spines) * 0.7;
        const around = (k % 2 ? 1 : -1) * 0.9 + Math.PI / 2; // on the top-ish sides
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(around, 0, -0.9));
        spineM.compose(new THREE.Vector3(t * seg.length, Math.sin(around) * seg.r0 * 0.6, Math.cos(around) * seg.r0 * 0.6), q, new THREE.Vector3(1, 1, 1));
        addGeometry(spine, new THREE.Matrix4().multiplyMatrices(bone.matrixWorld, spineM), bone, { partId: 4, material: 0 });
      }
      if (seg.name === 'tarsus') {
        for (const s of [-1, 1]) {
          spineM.compose(new THREE.Vector3(seg.length * 0.95, 0, s * 0.004), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s * 0.35, 0)), new THREE.Vector3(1, 1, 1));
          addGeometry(claw, new THREE.Matrix4().multiplyMatrices(bone.matrixWorld, spineM), bone, { partId: 4, material: 1 });
        }
      }
    });
  }
  // Pedipalps.
  const palpGeos = PALP_SEGMENTS.map((s) => segmentGeometry(s.length, s.r0, s.r1, 6));
  for (const palp of template.palps) {
    palp.joints.forEach((bone, si) => addGeometry(palpGeos[si], bone.matrixWorld, bone, { partId: 3, alongFn: (p) => p.x / PALP_SEGMENTS[si].length }));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  geometry.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  geometry.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
  geometry.setIndex(index);
  // Merge consecutive groups that use the same material, so the mesh draws in as few calls as possible.
  const merged = [];
  for (const [start, count, mat] of groups) {
    const last = merged[merged.length - 1];
    if (last && last[2] === mat && last[0] + last[1] === start) last[1] += count;
    else merged.push([start, count, mat]);
  }
  // Reorder so each material's triangles are contiguous: two groups total.
  const byMat = [[], []];
  for (const [start, count, mat] of merged) byMat[mat].push(...index.slice(start, start + count));
  geometry.setIndex([...byMat[0], ...byMat[1]]);
  geometry.addGroup(0, byMat[0].length, 0);
  geometry.addGroup(byMat[0].length, byMat[1].length, 1);
  geometry.computeBoundingSphere();

  const boneInverses = bones.map((b) => b.matrixWorld.clone().invert());

  // Hair: bristles sampled from the body surface, leaning backward like real spider hair.
  const hairGeo = new THREE.ConeGeometry(0.0035, 0.045, 3, 1);
  hairGeo.translate(0, 0.0225, 0);
  const hairMatrices = { body: [], abdomen: [] };
  const bp = body.attributes.position;
  const bn = body.attributes.normal;
  const up = new THREE.Vector3(0, 1, 0);
  const abdomenWorld = template.abdomen.matrixWorld;
  const abdomenInverse = abdomenWorld.clone().invert();
  for (let i = 0; i < SPIDER_HAIR_COUNT; i++) {
    const k = Math.floor(Math.random() * bp.count);
    const p = new THREE.Vector3().fromBufferAttribute(bp, k);
    const nrm = new THREE.Vector3().fromBufferAttribute(bn, k);
    if (nrm.y < -0.3) continue; // no hair on the belly, nobody sees it
    const dir = nrm.clone().multiplyScalar(0.55).add(new THREE.Vector3(0, 0, -1)).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, 0)).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
    const s = 0.6 + Math.random() * 0.8;
    const mat = new THREE.Matrix4().compose(p, q, new THREE.Vector3(s, s, s));
    if (p.z < -0.1) hairMatrices.abdomen.push(new THREE.Matrix4().multiplyMatrices(abdomenInverse, mat));
    else hairMatrices.body.push(mat);
  }
  const toAttribute = (list) => {
    const arr = new Float32Array(list.length * 16);
    list.forEach((mm, i) => mm.toArray(arr, i * 16));
    return new THREE.InstancedBufferAttribute(arr, 16);
  };

  shared = {
    H,
    template,
    geometry,
    boneInverses,
    materials: createMaterials(),
    hair: { geometry: hairGeo, body: toAttribute(hairMatrices.body), abdomen: toAttribute(hairMatrices.abdomen), material: new THREE.MeshStandardMaterial({ color: 0x4d4236, roughness: 0.75 }) },
    triangles: geometry.index.count / 3 + (hairMatrices.body.length + hairMatrices.abdomen.length) * 2,
  };
  return shared;
}

function createMaterials() {
  const body = new THREE.MeshPhysicalMaterial({
    color: SPIDER_COLOR,
    roughness: 0.55,
    metalness: 0,
    sheen: 1,
    sheenColor: new THREE.Color(0x6b5a46),
    sheenRoughness: 0.45,
    clearcoat: 0.2,
    clearcoatRoughness: 0.5,
  });
  const markColor = new THREE.Color(SPIDER_MARKING_COLOR);
  body.onBeforeCompile = (shader) => {
    shader.uniforms.uMark = { value: markColor };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPart; attribute float aAlong;\nvarying vec3 vRest; varying float vPart; varying float vAlong;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position; vPart = aPart; vAlong = aAlong;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uMark;\nvarying vec3 vRest; varying float vPart; varying float vAlong;\n${GLSL_NOISE}`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float mark = 0.0; float dark = 0.0;
        vec3 r = vRest;
        if (vPart < 0.5) {
          // Carapace: pale stripe down the middle, pale rim, dark grooves fanning out from the fovea.
          float stripe = smoothstep(0.04, 0.018, abs(r.x) - 0.012 * sin(r.z * 30.0)) * smoothstep(0.37, 0.12, r.z);
          float rim = smoothstep(0.1, 0.15, length(r.xz / vec2(1.0, 1.25) - vec2(0.0, 0.1))) * 0.8;
          float ang = atan(r.x, r.z - 0.07);
          float grooves = smoothstep(0.75, 0.95, abs(sin(ang * 4.0))) * smoothstep(0.02, 0.08, length(r.xz - vec2(0.0, 0.07)));
          mark = max(stripe, rim);
          dark = grooves * 0.6;
        } else if (vPart < 1.5) {
          // Abdomen: a leaf-shaped band of chevrons down the back, with pale paired dots.
          float z = r.z + 0.37;
          float half_ = 0.1 * (1.0 - smoothstep(-0.2, 0.27, -z) * 0.6);
          float folium = smoothstep(half_, half_ - 0.03, abs(r.x) + 0.02 * sin(z * 22.0));
          float chev = smoothstep(0.55, 0.75, fract(z * 7.5 + abs(r.x) * 6.0));
          float dots = smoothstep(0.022, 0.012, length(vec2(abs(r.x) - 0.07, fract(z * 7.5 + 0.3) / 7.5 - 0.06)));
          mark = folium * (0.45 + 0.55 * chev) + dots * 0.9;
          dark = (1.0 - folium) * 0.25;
        } else if (vPart < 3.5) {
          // Legs and palps: pale bands around each joint, darker in between.
          mark = smoothstep(0.72, 0.86, vAlong) * (1.0 - smoothstep(0.92, 1.0, vAlong)) + smoothstep(0.12, 0.0, vAlong) * 0.5;
        }
        float grain = fbm(r.xz * 60.0 + r.y * 30.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, uMark * (0.8 + 0.5 * grain), clamp(mark, 0.0, 1.0));
        diffuseColor.rgb *= 1.0 - dark;
        diffuseColor.rgb *= 0.85 + 0.3 * grain;`,
      );
  };
  body.customProgramCacheKey = () => 'spider-body';

  // Eyes, fangs and claws: glossy black, the eyes with a dull red glint for the B-movie.
  const gloss = new THREE.MeshPhysicalMaterial({
    color: 0x050404,
    roughness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    emissive: 0x3a0000,
    emissiveIntensity: 1,
  });
  return [body, gloss];
}

/** Total triangles per spider (for the art pass report). */
export function spiderTriangleCount() {
  return (shared ?? buildShared()).triangles;
}

export function createSpider() {
  const s = shared ?? buildShared();
  const spider = new THREE.Group();
  spider.name = 'Spider';

  // Holds every body part, so the death flip can turn the body without moving the spider's spot.
  const rig = new THREE.Group();
  spider.add(rig);

  // This spider's own copy of the bones, in the resting pose.
  const bones = buildBones(s.H);
  settleLegs(bones);
  rig.add(bones.root);
  const list = [];
  bones.root.traverse((b) => { if (b.isBone) list.push(b); });

  const mesh = new THREE.SkinnedMesh(s.geometry, s.materials);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  mesh.userData.shared = true;
  rig.add(mesh);
  rig.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(list, s.boneInverses), new THREE.Matrix4());

  for (const [name, attribute] of [['body', s.hair.body], ['abdomen', s.hair.abdomen]]) {
    const hair = new THREE.InstancedMesh(s.hair.geometry, s.hair.material, attribute.count);
    hair.instanceMatrix = attribute;
    hair.castShadow = false;
    hair.frustumCulled = false;
    hair.userData.shared = true;
    (name === 'body' ? bones.root : bones.abdomen).add(hair);
  }

  spider.scale.setScalar(SPIDER_SIZE);

  const legs = bones.legs.map((leg) => ({
    ...leg,
    rest: leg.joints.map((j) => j.rotation.z),
    restYaw: leg.hip.rotation.y,
    // Tetrapod gait: left 1, right 2, left 3, right 4 move together; the other four alternate.
    group: (leg.index + (leg.side === 1 ? 1 : 0)) % 2,
    phase: Math.random() * Math.PI * 2,
    rate: 0.6 + Math.random() * 0.8,
  }));
  const palps = bones.palps.map((palp) => ({ ...palp, rest: palp.joints.map((j) => j.rotation.z), phase: Math.random() * 10 }));
  const restRigY = 0;
  let lastTime = null;
  let gait = Math.random();
  let moving = 0;
  let panic = 0;

  /*
   * HOW THE TWITCH WORKS
   * A sine wave raised to a high power sits near zero most of the time and spikes briefly, which
   * gives long stillness broken by a sudden flick. Every leg has its own timing.
   *
   * @param {number} time animation time in seconds (runs faster during bursts and while sprayed)
   * @param {{ moving?: boolean, sprayed?: boolean }} state
   */
  spider.update = (time, state = {}) => {
    const dt = lastTime === null ? 0 : THREE.MathUtils.clamp(time - lastTime, 0, 0.5);
    lastTime = time;
    moving += ((state.moving ? 1 : 0) - moving) * (1 - Math.exp(-dt * 25));
    panic += ((state.sprayed ? 1 : 0) - panic) * (1 - Math.exp(-dt * 12));
    gait += dt * 1.7 * moving;

    for (const leg of legs) {
      const t = time * LEG_TWITCH_SPEED * leg.rate + leg.phase;
      const wave = Math.sin(t);
      const flick = Math.sign(wave) * Math.abs(wave) ** 8 * (1 - moving);
      const tremble = Math.sin(t * 7.3) * 0.12;

      const phi = gait * Math.PI * 2 + (leg.group ? Math.PI : 0) + leg.index * 0.25;
      const swing = Math.sin(phi) * 0.3 * moving;
      const lift = Math.max(0, Math.cos(phi)) * 0.6 * moving;
      // Flailing: every joint thrashes fast and out of step, legs held high.
      const f = panic;
      const flail = (k) => Math.sin(time * (9 + k * 2.3) * leg.rate + leg.phase * (k + 1)) * f;

      leg.hip.rotation.y = leg.restYaw - leg.side * swing + tremble * LEG_TWITCH_AMOUNT * 0.5 + flail(1) * 0.35;
      const [coxa, femur, patella, tibia, meta, tarsus] = leg.joints;
      coxa.rotation.z = leg.rest[0] + flail(2) * 0.1;
      femur.rotation.z = leg.restFemur + lift + (flick + tremble) * LEG_TWITCH_AMOUNT + f * 0.45 + flail(3) * 0.3;
      patella.rotation.z = leg.rest[2] - lift * 0.5 - flick * LEG_TWITCH_AMOUNT * 0.6 + flail(4) * 0.4;
      tibia.rotation.z = leg.rest[3] - lift * 0.3 + flail(5) * 0.35;
      meta.rotation.z = leg.rest[4] + flail(6) * 0.3;
      tarsus.rotation.z = leg.rest[5] + lift * 0.4 + flail(7) * 0.3;
    }
    for (const palp of palps) {
      // Palps "taste" the air: little taps, faster when it's alarmed.
      const tap = Math.max(0, Math.sin(time * 5 + palp.phase)) ** 4;
      palp.joints[0].rotation.z = palp.rest[0] + tap * 0.35 + panic * Math.sin(time * 14 + palp.phase) * 0.4;
      palp.joints[1].rotation.z = palp.rest[1] - tap * 0.3;
    }
    for (const [i, fang] of bones.fangs.entries()) fang.rotation.x = panic * (0.5 + 0.3 * Math.sin(time * 20 + i));
    // Breathing, a bob while running, and a shudder when sprayed.
    bones.abdomen.scale.setScalar(1 + Math.sin(time * 2.1) * 0.015 * (1 - moving));
    bones.abdomen.rotation.x = Math.sin(gait * Math.PI * 4) * 0.05 * moving + Math.sin(time * 30) * 0.04 * panic;
    rig.position.y = restRigY + Math.abs(Math.sin(gait * Math.PI * 2)) * 0.03 * moving;
  };

  /**
   * Poses the death animation. Replaces update() once the spider is dying.
   * @param {number} t 0 = alive, 1 = fully gone
   */
  spider.setDeathPose = (t) => {
    const flip = THREE.MathUtils.smoothstep(t, 0, 0.35);
    const curl = THREE.MathUtils.smoothstep(t, 0, 0.5);
    const shrink = THREE.MathUtils.smoothstep(t, 0.4, 1);
    const backHeight = s.H + 0.26;

    rig.rotation.z = Math.PI * flip;
    rig.position.y = backHeight * flip + Math.sin(Math.PI * flip) * FLIP_HOP;
    rig.scale.setScalar(1 - shrink);

    for (const leg of legs) {
      const [, femur, patella, tibia, meta, tarsus] = leg.joints;
      femur.rotation.z = THREE.MathUtils.lerp(leg.restFemur, deg(CURL.femur), curl);
      patella.rotation.z = THREE.MathUtils.lerp(leg.rest[2], deg(CURL.patella), curl);
      tibia.rotation.z = THREE.MathUtils.lerp(leg.rest[3], deg(CURL.tibia), curl);
      meta.rotation.z = THREE.MathUtils.lerp(leg.rest[4], deg(CURL.metatarsus), curl);
      tarsus.rotation.z = THREE.MathUtils.lerp(leg.rest[5], deg(CURL.tarsus), curl);
      leg.hip.rotation.y = leg.restYaw;
    }
  };

  return spider;
}
