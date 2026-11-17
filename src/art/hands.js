import * as THREE from 'three';
import { meshSDF, smin, sdEllipsoid, sdTaperedCapsule } from './sdfMesher.js';
import { GLSL_NOISE } from './bake.js';
import { VIEWMODEL_LAYER, WORLD_LAYER, setLayerDeep } from './layers.js';
import { isHighQuality } from './quality.js';
import { HAND_MOVE_SPEED, HAND_POSES, SKIN_TONE, SKIN_WETNESS, CAN_GRIP_TURN_DEGREES } from '../config.js';

/*
 * HANDS
 *
 * No rigging. Each pose (relaxed, reach, grip the can, spray, lather, rinse, towel grab, reach
 * out through the curtain) is written down as joint angles: how far each finger spreads and how
 * much each of its three knuckles bends. When the game loads, every pose is turned into its own
 * sculpted mesh:
 *   1. Walk each finger out from its knuckle, turning at every joint by that pose's angles. That
 *      gives the bones' positions (the phalanges).
 *   2. Describe the hand as one distance function: tapered capsules for the phalanges, bulges at
 *      the knuckles, pads on the palm side, a sculpted palm with the thumb's fleshy base, a wrist.
 *      Blended with smooth unions, so fingers grow out of the palm like a real hand.
 *   3. Mesh it (sdfMesher.js), with normals from the function itself, so it shades smoothly.
 * Nails are separate little curved glossy plates; water drops are instanced beads.
 * Skin creases at the joints are drawn by the shader from that pose's joint positions, so they
 * stay sharp however close you get. The forearm is a tapered tube from the wrist to a point
 * behind the camera, so it always leaves the frame and never shows an elbow or a body.
 *
 * Local space of a RIGHT hand, in meters: wrist at the origin, fingers toward +Y, back of the
 * hand toward +Z, palm toward -Z, thumb toward -X. The left hand is the same mesh mirrored.
 */

const CM = 0.01;
const deg = THREE.MathUtils.degToRad;

// Each finger: knuckle (MCP) position, metacarpal base, bone lengths, thickness. Centimeters.
const FINGERS = [
  { name: 'index', mcp: [-2.35, 9.3, 0.25], base: [-1.4, 1.6, 0.0], lengths: [4.0, 2.35, 1.95], radius: 0.97 },
  { name: 'middle', mcp: [-0.55, 9.8, 0.4], base: [-0.4, 1.7, 0.1], lengths: [4.5, 2.8, 2.05], radius: 1.0 },
  { name: 'ring', mcp: [1.25, 9.4, 0.3], base: [0.6, 1.6, 0.0], lengths: [4.15, 2.6, 2.0], radius: 0.94 },
  { name: 'pinky', mcp: [2.85, 8.4, 0.05], base: [1.55, 1.4, -0.1], lengths: [3.3, 1.95, 1.8], radius: 0.82 },
];
const THUMB = { cmc: [-2.1, 2.2, -0.85], lengths: [4.6, 3.1, 2.6], radius: 1.28 };

/*
 * POSES, in degrees.
 *  spread: fan of each finger (negative = toward the thumb)
 *  mcp / pip / dip: bend at the big knuckle, middle knuckle and end knuckle of each finger
 *  thumb: { oppose: swing across the palm, out: swing away from the index, mcp, ip: its two bends }
 */
export const HAND_SHAPES = {
  relaxed: { spread: [-5, 0, 5, 11], mcp: [18, 22, 26, 30], pip: [28, 32, 36, 40], dip: [14, 16, 18, 20], thumb: { oppose: 25, out: 12, mcp: 10, ip: 15 } },
  reach: { spread: [-8, 0, 8, 16], mcp: [4, 5, 7, 9], pip: [8, 8, 10, 12], dip: [4, 5, 5, 6], thumb: { oppose: 15, out: 38, mcp: 0, ip: 5 } },
  grip: { spread: [-2, 0, 2, 5], mcp: [70, 72, 74, 76], pip: [90, 95, 95, 95], dip: [45, 45, 45, 45], thumb: { oppose: 55, out: 10, mcp: 25, ip: 30 } },
  gripCan: { spread: [-3, 0, 3, 7], mcp: [38, 45, 50, 55], pip: [68, 72, 75, 78], dip: [32, 34, 34, 34], thumb: { oppose: 62, out: 8, mcp: 12, ip: 18 } },
  spray: { spread: [-38, 0, 3, 7], mcp: [30, 45, 50, 55], pip: [55, 72, 75, 78], dip: [30, 34, 34, 34], thumb: { oppose: 62, out: 8, mcp: 12, ip: 18 } },
  lather: { spread: [-12, -2, 8, 18], mcp: [25, 25, 28, 30], pip: [62, 64, 64, 64], dip: [42, 42, 42, 42], thumb: { oppose: 30, out: 30, mcp: 20, ip: 32 } },
  rinse: { spread: [-2, 0, 2, 5], mcp: [16, 15, 15, 17], pip: [20, 22, 22, 25], dip: [8, 8, 8, 8], thumb: { oppose: 8, out: 18, mcp: 5, ip: 5 } },
  towel: { spread: [-6, 0, 6, 12], mcp: [45, 40, 45, 50], pip: [70, 62, 70, 75], dip: [30, 26, 30, 35], thumb: { oppose: 50, out: 14, mcp: 20, ip: 25 } },
  reachOut: { spread: [-9, 0, 9, 18], mcp: [8, 8, 10, 12], pip: [14, 14, 16, 18], dip: [6, 6, 6, 8], thumb: { oppose: 28, out: 42, mcp: 4, ip: 8 } },
};

const v3 = (a) => new THREE.Vector3(a[0] * CM, a[1] * CM, a[2] * CM);

/*
 * HOW THE RIGHT HAND HOLDS THE CAN
 * The hand is placed in the can's own space: palm against the can's right side, fingers wrapping
 * round the far side, index finger at the top, wrist pointing back toward the camera. In hand
 * terms: the hand's X axis runs down the can, its Y axis (fingers) points away from you, its Z
 * axis (back of the hand) faces right. Because the hand follows the can, lowering, swaying and
 * spraying the can move the hand with it.
 */
export const CAN_GRIP = (() => {
  const turn = THREE.MathUtils.degToRad(CAN_GRIP_TURN_DEGREES);
  const handX = new THREE.Vector3(0, -1, 0); // runs down the can: thumb and index at the top
  const handZ = new THREE.Vector3(Math.cos(turn), 0, Math.sin(turn)); // back of the hand, out from the can
  const handY = new THREE.Vector3().crossVectors(handZ, handX); // fingers, wrapping round the far side
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(handX, handY, handZ));
  // Where the can's center sits in the hand: just in front of the palm, level with the middle knuckles.
  const canInHand = new THREE.Vector3(0.005, 0.072, -0.048);
  const position = canInHand.clone().applyQuaternion(quaternion).negate().add(new THREE.Vector3(0, 0.055, 0));
  return { position, quaternion };
})();
/** Walks every finger out from its knuckle, bending at each joint. Returns joints and segments. */
function solvePose(shape) {
  const chains = [];
  FINGERS.forEach((finger, i) => {
    const palmDir = new THREE.Vector3(0, -0.12, -1).normalize(); // which way the pad of the finger faces
    const dir = new THREE.Vector3(0, 1, 0.05).normalize();
    // Spread: swing the finger sideways within the plane of the palm.
    const spreadAxis = new THREE.Vector3(0, 0, -1);
    dir.applyAxisAngle(spreadAxis, deg(shape.spread[i]));
    const joints = [v3(finger.mcp)];
    const bends = [shape.mcp[i], shape.pip[i], shape.dip[i]];
    const dirs = [];
    const palms = [];
    for (let k = 0; k < 3; k++) {
      const axis = new THREE.Vector3().crossVectors(dir, palmDir).normalize();
      dir.applyAxisAngle(axis, deg(bends[k]));
      palmDir.applyAxisAngle(axis, deg(bends[k]));
      dirs.push(dir.clone());
      palms.push(palmDir.clone());
      joints.push(joints[k].clone().addScaledVector(dir, finger.lengths[k] * CM));
    }
    chains.push({ joints, dirs, palms, radius: finger.radius * CM, base: v3(finger.base), name: finger.name });
  });

  // Thumb: starts at the wrist side of the palm, swings across the palm (oppose) and away (out).
  const t = shape.thumb;
  const dir = new THREE.Vector3(-0.62, 0.72, -0.3).normalize();
  const palmDir = new THREE.Vector3(0.55, 0.15, -0.82).normalize(); // the thumb pad faces across the palm
  const outAxis = new THREE.Vector3(0, 0, 1);
  dir.applyAxisAngle(outAxis, deg(t.out) * 0.6);
  palmDir.applyAxisAngle(outAxis, deg(t.out) * 0.6);
  const opposeAxis = new THREE.Vector3(0, 1, 0.3).normalize();
  dir.applyAxisAngle(opposeAxis, -deg(t.oppose) * 0.9);
  palmDir.applyAxisAngle(opposeAxis, -deg(t.oppose) * 0.9);
  const joints = [v3(THUMB.cmc)];
  const dirs = [];
  const palms = [];
  const bends = [t.oppose * 0.25, t.mcp, t.ip];
  for (let k = 0; k < 3; k++) {
    const axis = new THREE.Vector3().crossVectors(dir, palmDir).normalize();
    dir.applyAxisAngle(axis, deg(bends[k]));
    palmDir.applyAxisAngle(axis, deg(bends[k]));
    dirs.push(dir.clone());
    palms.push(palmDir.clone());
    joints.push(joints[k].clone().addScaledVector(dir, THUMB.lengths[k] * CM));
  }
  const thumb = { joints, dirs, palms, radius: THUMB.radius * CM, name: 'thumb' };
  return { fingers: chains, thumb };
}

/** The whole hand as one distance function. */
function handSDF(pose) {
  const prims = [];
  const P = (fn) => prims.push(fn);
  const E = (c, r) => (x, y, z) => sdEllipsoid(x, y, z, c[0] * CM, c[1] * CM, c[2] * CM, r[0] * CM, r[1] * CM, r[2] * CM);
  const T = (a, b, ra, rb) => (x, y, z) => sdTaperedCapsule(x, y, z, a.x, a.y, a.z, b.x, b.y, b.z, ra, rb);

  // Palm: a flattened core, the four metacarpals, the thumb's fleshy base and the pinky-side pad.
  const palmCore = E([0.15, 5.4, -0.1], [3.9, 4.5, 1.2]);
  const metacarpals = pose.fingers.map((f) => T(f.base, f.joints[0], 1.25 * CM, f.radius * 1.02));
  const knuckles = pose.fingers.map((f) => {
    const c = f.joints[0].clone().add(new THREE.Vector3(0, -0.15 * CM, 0.45 * CM));
    return (x, y, z) => Math.hypot(x - c.x, y - c.y, z - c.z) - f.radius * 0.98;
  });
  const thenar = E([-2.45, 4.2, -0.9], [2.15, 3.3, 1.5]);
  const hypothenar = E([2.55, 4.3, -0.55], [1.45, 3.3, 1.05]);
  const palmPad = E([0.25, 8.55, -0.55], [3.6, 1.15, 0.95]);
  const wrist = [T(new THREE.Vector3(-0.85 * CM, 1.2 * CM, 0), new THREE.Vector3(-0.9 * CM, -5 * CM, 0.25 * CM), 1.55 * CM, 1.75 * CM),
    T(new THREE.Vector3(0.85 * CM, 1.2 * CM, 0), new THREE.Vector3(0.9 * CM, -5 * CM, 0.25 * CM), 1.5 * CM, 1.7 * CM)];

  // The web of skin between thumb and index finger.
  const webA = pose.thumb.joints[1].clone().lerp(pose.thumb.joints[0], 0.25);
  const webB = v3([-2.0, 7.6, -0.1]);
  const web = T(webA, webB, 0.75 * CM, 0.8 * CM);

  // Fingers: three tapering bones each, with a bulge at every knuckle and a pad under every bone.
  const fingerPrims = [];
  for (const f of [...pose.fingers, pose.thumb]) {
    const r = f.radius;
    const isThumb = f.name === 'thumb';
    const radii = isThumb ? [r * 1.15, r * 0.95, r * 0.9, r * 0.66] : [r, r * 0.88, r * 0.8, r * 0.6];
    const parts = [];
    for (let k = 0; k < 3; k++) {
      const a = f.joints[k];
      const b = f.joints[k + 1];
      // The last bone stops short of the tip by its own radius, so the tip is a rounded cap.
      const end = k === 2 ? b.clone().addScaledVector(f.dirs[2], -radii[3] * 0.85) : b;
      parts.push(T(a, end, radii[k], radii[k + 1]));
      // Pad on the palm side of each bone.
      const mid = a.clone().lerp(end, 0.55).addScaledVector(f.palms[k], radii[k + 1] * 0.32);
      const padR = radii[k + 1] * 0.78;
      parts.push((x, y, z) => Math.hypot(x - mid.x, y - mid.y, z - mid.z) - padR);
      if (k > 0) {
        // Knuckle bulge on the back of the joint.
        const kc = a.clone().addScaledVector(f.palms[k - 1], -radii[k] * 0.12);
        const kr = radii[k] * 0.9;
        parts.push((x, y, z) => Math.hypot(x - kc.x, y - kc.y, z - kc.z) - kr);
      }
    }
    fingerPrims.push((x, y, z) => {
      let d = parts[0](x, y, z);
      for (let i = 1; i < parts.length; i++) d = smin(d, parts[i](x, y, z), 0.3 * CM);
      return d;
    });
  }

  return (x, y, z) => {
    let d = palmCore(x, y, z);
    for (const m of metacarpals) d = smin(d, m(x, y, z), 1.4 * CM);
    for (const k of knuckles) d = smin(d, k(x, y, z), 0.6 * CM);
    d = smin(d, thenar(x, y, z), 1.1 * CM);
    d = smin(d, hypothenar(x, y, z), 1.0 * CM);
    d = smin(d, palmPad(x, y, z), 0.8 * CM);
    d = smin(d, smin(wrist[0](x, y, z), wrist[1](x, y, z), 1.2 * CM), 1.6 * CM);
    for (let i = 0; i < 4; i++) d = smin(d, fingerPrims[i](x, y, z), 0.55 * CM);
    d = smin(d, web(x, y, z), 1.3 * CM);
    d = smin(d, fingerPrims[4](x, y, z), 1.5 * CM);
    return d;
  };
}

/** A curved nail plate sitting on the back of a fingertip. */
function nailMatrix(chain, nailGeometryRadius) {
  const tip = chain.joints[3];
  const base = chain.joints[2];
  const dir = chain.dirs[2];
  const back = chain.palms[2].clone().negate();
  const r = chain.radius * (chain.name === 'thumb' ? 0.9 : 0.7);
  const center = base.clone().lerp(tip, 0.6).addScaledVector(back, r * 0.1);
  const side = new THREE.Vector3().crossVectors(dir, back).normalize();
  const basis = new THREE.Matrix4().makeBasis(side, dir, back);
  const scale = r / nailGeometryRadius;
  return new THREE.Matrix4().compose(center, new THREE.Quaternion().setFromRotationMatrix(basis), new THREE.Vector3(scale, scale, scale));
}

let cache = null;

function buildPoses() {
  const high = isHighQuality();
  const cell = (high ? 2.0 : 2.7) * CM * 0.1; // 2 mm grid (2.7 mm on low)
  const nailGeo = (() => {
    // Part of a tube wall: a curved plate, 1 unit radius, along +Y, centered on +Z.
    const g = new THREE.CylinderGeometry(1, 1, 1.15, 10, 4, true, -0.95, 1.9);
    g.rotateY(Math.PI / 2 + Math.PI / 2); // center the arc on +Z
    const p = g.attributes.position;
    const colors = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      // Taper the plate toward the cuticle, and whiten the free edge at the tip.
      const y = p.getY(i);
      const t = (y + 0.575) / 1.15;
      p.setX(i, p.getX(i) * (0.85 + 0.15 * t));
      const white = THREE.MathUtils.smoothstep(t, 0.82, 0.95);
      colors.set([0.93 + 0.07 * white, 0.72 + 0.25 * white, 0.68 + 0.27 * white], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return { geometry: g, radius: 1.03 };
  })();

  const bounds = new THREE.Box3(new THREE.Vector3(-0.125, -0.056, -0.115), new THREE.Vector3(0.08, 0.215, 0.06));
  const buildOne = (name) => {
    const shape = HAND_SHAPES[name];
    const pose = solvePose(shape);
    const sdf = handSDF(pose);
    const geometry = meshSDF(sdf, bounds, cell);
    const chains = [...pose.fingers, pose.thumb];
    const nails = chains.map((c) => nailMatrix(c, nailGeo.radius));

    // Crease data for the shader: every joint's center, the bone direction and the palm side.
    const joints = [];
    for (const c of chains) {
      for (let k = 0; k < 3; k++) joints.push({ center: c.joints[k].clone(), dir: c.dirs[k].clone(), palm: c.palms[k].clone(), r: c.radius });
    }
    // Water drops: sit some on the back of the hand and fingers.
    const drops = [];
    const pos = geometry.attributes.position;
    const nor = geometry.attributes.normal;
    for (let i = 0; i < 400 && drops.length < 34; i++) {
      const k = Math.floor(Math.random() * pos.count);
      const n = new THREE.Vector3().fromBufferAttribute(nor, k);
      if (n.z < 0.45) continue;
      const p = new THREE.Vector3().fromBufferAttribute(pos, k);
      if (p.y < -0.03) continue;
      const s = 0.0008 + Math.random() * 0.0011;
      drops.push(new THREE.Matrix4().compose(p.addScaledVector(n, s * 0.15), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n), new THREE.Vector3(s, s * 0.55, s)));
    }
    return { geometry, nails, joints, drops, tips: chains.map((c) => c.joints[3].clone()) };
  };
  // Poses are built when first needed. The relaxed pose is built now; the rest are built in the
  // background a few at a time while the title screen is up (see prebuildHandPosesInBackground).
  const poses = {};
  const get = (name) => (poses[name] ??= buildOne(HAND_SHAPES[name] ? name : 'relaxed'));
  get('relaxed');
  cache = { poses, get, nailGeo };
  return cache;
}

/** Builds the remaining poses one at a time, between frames, so loading never freezes. */
export function prebuildHandPosesInBackground() {
  const data = cache ?? buildPoses();
  const queue = Object.keys(HAND_SHAPES).filter((name) => !data.poses[name]);
  const step = () => {
    const name = queue.shift();
    if (!name) return;
    data.get(name);
    setTimeout(step, 30);
  };
  setTimeout(step, 30);

}

/** Builds every pose now (it takes a moment), and reports triangles and time for the report. */
export function prebuildHandPoses() {
  const start = performance.now();
  const data = cache ?? buildPoses();
  for (const name of Object.keys(HAND_SHAPES)) data.get(name);
  const triangles = Object.fromEntries(Object.entries(data.poses).map(([k, p]) => [k, p.geometry.index.count / 3]));
  return { ms: Math.round(performance.now() - start), triangles };
}

function createSkinMaterial() {
  const material = new THREE.MeshPhysicalMaterial({
    color: SKIN_TONE,
    roughness: 0.52,
    clearcoat: SKIN_WETNESS * 0.6,
    clearcoatRoughness: 0.3,
    sheen: 0.35,
    sheenColor: new THREE.Color(0xff8f78),
    sheenRoughness: 0.6,
    fog: false,
  });
  const jointCount = 15;
  const uniforms = {
    uJointPos: { value: Array.from({ length: jointCount }, () => new THREE.Vector4()) },
    uJointDir: { value: Array.from({ length: jointCount }, () => new THREE.Vector3()) },
    uJointPalm: { value: Array.from({ length: jointCount }, () => new THREE.Vector3()) },
    uTips: { value: Array.from({ length: 5 }, () => new THREE.Vector3()) },
  };
  material.userData.uniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj; varying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position; vObjN = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vObj; varying vec3 vObjN;
        uniform vec4 uJointPos[${jointCount}]; uniform vec3 uJointDir[${jointCount}]; uniform vec3 uJointPalm[${jointCount}]; uniform vec3 uTips[5];
        ${GLSL_NOISE}`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float crease = 0.0; float knuckle = 0.0;
        vec3 on = normalize(vObjN);
        for (int i = 0; i < ${jointCount}; i++) {
          vec3 rel = vObj - uJointPos[i].xyz;
          float along = dot(rel, uJointDir[i]);
          float near = smoothstep(uJointPos[i].w * 2.2, uJointPos[i].w * 1.0, length(rel - uJointDir[i] * along));
          float palmSide = dot(on, uJointPalm[i]);
          // Two thin lines on the palm side of each joint, wrinkles across the back.
          float lines = bell((along - 0.0016) / 0.0007) + bell((along + 0.0018) / 0.0007) * 0.7;
          crease += lines * smoothstep(0.1, 0.6, palmSide) * near;
          float wrinkles = bell(along / 0.004) * (0.5 + 0.5 * sin(along * 2600.0)) * smoothstep(-0.2, -0.7, palmSide) * near;
          crease += wrinkles * 0.35;
          knuckle += bell(along / 0.007) * smoothstep(-0.1, -0.7, palmSide) * near;
        }
        float tipRed = 0.0;
        for (int i = 0; i < 5; i++) tipRed += bell(length(vObj - uTips[i]) / 0.012);
        float palmPale = smoothstep(-0.2, -0.8, on.z) * smoothstep(0.11, 0.06, vObj.y);
        float mottle = fbm(vObj.xy * 260.0 + vObj.z * 130.0);
        vec3 skin = diffuseColor.rgb;
        skin = mix(skin, skin * vec3(1.12, 0.86, 0.84), clamp(knuckle * 0.55 + tipRed * 0.45, 0.0, 1.0));
        skin = mix(skin, skin * vec3(1.08, 1.0, 0.95) + 0.03, palmPale * 0.6);
        skin *= 0.93 + 0.12 * mottle;
        skin *= 1.0 - clamp(crease, 0.0, 1.0) * 0.38;
        diffuseColor.rgb = skin;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        // Pores and fine skin texture: tiny bumps.
        float e = 0.0006;
        float h0 = vnoise(vObj.xy * 3400.0 + vObj.z * 2100.0);
        vec2 g = vec2(vnoise((vObj.xy + vec2(e, 0.0)) * 3400.0 + vObj.z * 2100.0) - h0, vnoise((vObj.xy + vec2(0.0, e)) * 3400.0 + vObj.z * 2100.0) - h0);
        normal = normalize(normal + vec3(g * 0.07, 0.0));`,
      );
  };
  material.customProgramCacheKey = () => 'skin-hand';
  return material;
}

function setJointUniforms(material, pose) {
  const u = material.userData.uniforms;
  pose.joints.forEach((j, i) => {
    u.uJointPos.value[i].set(j.center.x, j.center.y, j.center.z, j.r);
    u.uJointDir.value[i].copy(j.dir);
    u.uJointPalm.value[i].copy(j.palm);
  });
  pose.tips.forEach((t, i) => u.uTips.value[i].copy(t));
}

/** Forearm: a tube 1 unit long along +Y, wrist end at y = 0, a bit flatter than it is wide. */
function forearmGeometry() {
  const profile = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const r = (2.25 + 1.3 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) - 0.2 * t) * CM;
    profile.push(new THREE.Vector2(r, t));
  }
  const g = new THREE.LatheGeometry(profile, 20);
  g.scale(1.12, 1, 0.9);
  return g;
}

/** One hand: the pose meshes swap in and out of one Mesh; nails and drops follow. */
function createHand(side, skinMaterial, nailMaterial, dropMaterial, forearmGeo) {
  const data = cache ?? buildPoses();
  const root = new THREE.Group();
  root.name = side === 1 ? 'RightHand' : 'LeftHand';
  const body = new THREE.Group();
  body.scale.x = side; // the left hand is the right hand mirrored
  root.add(body);

  const skin = new THREE.Mesh(data.get('relaxed').geometry, skinMaterial);
  body.add(skin);
  const nails = new THREE.InstancedMesh(data.nailGeo.geometry, nailMaterial, 5);
  body.add(nails);
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), dropMaterial, 40);
  drops.visible = SKIN_WETNESS > 0.05;
  body.add(drops);

  const forearm = new THREE.Mesh(forearmGeo, skinMaterial);
  forearm.frustumCulled = false;
  root.add(forearm);

  let shapeName = null;
  function setShape(name) {
    if (name === shapeName) return;
    const pose = data.get(name);
    shapeName = name;
    skin.geometry = pose.geometry;
    pose.nails.forEach((m, i) => nails.setMatrixAt(i, m));
    nails.instanceMatrix.needsUpdate = true;
    drops.count = pose.drops.length;
    pose.drops.forEach((m, i) => drops.setMatrixAt(i, m));
    drops.instanceMatrix.needsUpdate = true;
    setJointUniforms(skinMaterial, pose);
  }
  setShape('relaxed');

  // The forearm runs from just inside the wrist to an elbow point behind the camera: low for
  // most poses, raised and out to the side when the hands are up on your head.
  const elbow = new THREE.Vector3(side * 0.3, -0.5, 0.18);
  const elbowTarget = elbow.clone();
  const wristLocal = new THREE.Vector3(0, -0.03, 0.002);
  const wrist = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  function updateForearm(dt = 1) {
    elbow.lerp(elbowTarget, 1 - Math.exp(-HAND_MOVE_SPEED * dt));
    root.updateMatrix();
    wrist.copy(wristLocal).applyMatrix4(root.matrix); // camera space
    dir.copy(elbow).sub(wrist);
    const length = dir.length();
    dir.normalize();
    // Forearm is a child of the hand root, so convert its placement back into hand space.
    const inv = new THREE.Matrix4().copy(root.matrix).invert();
    const m = new THREE.Matrix4().compose(wrist, new THREE.Quaternion().setFromUnitVectors(up, dir), new THREE.Vector3(1, length, 1));
    m.premultiply(inv);
    m.decompose(forearm.position, forearm.quaternion, forearm.scale);
  }

  return {
    root,
    setShape,
    updateForearm,
    getShape: () => shapeName,
    setElbow: (camSpace) => elbowTarget.set(side * Math.abs(camSpace[0]), camSpace[1], camSpace[2]),
  };
}

export function createHands(camera) {
  const data = cache ?? buildPoses();
  const nailMaterial = new THREE.MeshPhysicalMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08, fog: false });
  const dropMaterial = new THREE.MeshPhysicalMaterial({ color: 0xc9d2d8, roughness: 0.02, transparent: true, opacity: 0.22, clearcoat: 1, fog: false, depthWrite: false });
  const forearmGeo = forearmGeometry();
  const left = createHand(-1, createSkinMaterial(), nailMaterial, dropMaterial, forearmGeo);
  const right = createHand(1, createSkinMaterial(), nailMaterial, dropMaterial, forearmGeo);
  camera.add(left.root);
  camera.add(right.root);
  setLayerDeep(left.root, VIEWMODEL_LAYER);
  setLayerDeep(right.root, VIEWMODEL_LAYER);

  const targets = new Map();
  for (const hand of [left, right]) targets.set(hand, { position: new THREE.Vector3(), rotation: new THREE.Quaternion() });

  const euler = new THREE.Euler();
  const DEFAULT_ELBOW = [0.3, -0.5, 0.18];
  function setTarget(hand, poseName, drop = 0, scrub = 0) {
    const pose = HAND_POSES[poseName];
    hand.setElbow(pose.elbow ?? DEFAULT_ELBOW);
    const target = targets.get(hand);
    target.position.fromArray(pose.position);
    target.position.y -= drop;
    target.position.x += scrub;
    target.rotation.setFromEuler(euler.fromArray(pose.rotation));
  }

  /** Jumps straight to the current targets, for a new run. */
  function snap() {
    for (const [hand, target] of targets) {
      hand.root.position.copy(target.position);
      hand.root.quaternion.copy(target.rotation);
      hand.updateForearm();
    }
  }

  function update(dt) {
    const blend = 1 - Math.exp(-HAND_MOVE_SPEED * dt);
    for (const [hand, target] of targets) {
      hand.root.position.lerp(target.position, blend);
      hand.root.quaternion.slerp(target.rotation, blend);
      hand.updateForearm(dt);
    }
  }

  function setVisible(visible) {
    left.root.visible = visible;
    right.root.visible = visible;
  }

  // The old placeholder shape names still work.
  const alias = (name) => ({ grip: 'grip', reach: 'reach', lather: 'lather' }[name] ?? name);

  return {
    update,
    snap,
    setVisible,
    setLeft: (poseName, shape, scrub = 0) => { setTarget(left, poseName, 0, scrub); left.setShape(alias(shape)); },
    setRight: (poseName, shape, drop = 0, scrub = 0) => { setTarget(right, poseName, drop, scrub); right.setShape(alias(shape)); },
    /** Puts the right hand at any spot and turn (camera space), with any shape. */
    setRightTarget: (position, rotation, shape, immediate = false) => {
      right.setElbow(DEFAULT_ELBOW);
      const target = targets.get(right);
      target.position.copy(position);
      target.rotation.copy(rotation);
      right.setShape(shape);
      if (immediate) {
        right.root.position.copy(position);
        right.root.quaternion.copy(rotation);
      }
    },
    /** Puts the left hand at any spot and turn (camera space), with any shape. */
    setLeftTarget: (position, rotation, shape) => {
      const target = targets.get(left);
      target.position.copy(position);
      target.rotation.copy(rotation);
      left.setShape(shape);
    },
    /** While reaching out through the curtain, the right hand is part of the world so the curtain can hide it. */
    setRightInWorld: (inWorld) => setLayerDeep(right.root, inWorld ? WORLD_LAYER : VIEWMODEL_LAYER),
    left,
    right,
    poseNames: Object.keys(HAND_SHAPES),
  };
}
