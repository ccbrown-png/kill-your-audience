import * as THREE from 'three';
import { FOOT_SPACING, FOOT_TOE_OUT_DEG, FEET_FALLBACK_FLOOR_Y } from '../config.js';
import { waterFilm } from '../art/feet.js';

/*
 * FEET (low poly rebuild)
 *
 * Two bare feet standing in the tub, seen from above when you look down.
 *  - Foot body: a loft of cross-sections from heel to the base of the toes. Narrow rounded heel,
 *    widest at the ball, raised arch on the inside, a sloping instep.
 *  - Five separate toes along an arc: big toe largest, pinky smallest and set back.
 *  - Lower legs continue up and slightly back toward the hips (under and behind your eyes), so
 *    from any angle you can look at the feet the leg runs off the bottom of the screen. Their top
 *    end is a closed, rounded skin cap anyway, for when you turn round and look down.
 *
 * Local space of one foot, in meters: floor under the ankle is the origin, toes toward -Z,
 * up is +Y. `side` is +1 for the right foot (big toe toward -X), -1 for the left (mirrored).
 */

// Pale, cool-leaning skin that stays skin under the blue grade. Not white, not orange.
const SKIN_COLOR = 0xd6c2b9;
const NAIL_COLOR = 0xe3d3cf;

// Foot length 25 cm, width at the ball 9.6 cm (2.6 : 1).
const HEEL_Z = 0.055; // toe tips reach z = -0.195
const BODY_FRONT_Z = -0.152; // where the foot body ends; toes overlap it

// Profiles along the foot, sampled by z: [z, value]. Linear in between.
// Outline seen from above (right foot): the inner edge runs fairly straight to the big toe, the
// outer edge bows out to the ball (widest, 9.4 cm at z = -10.5 cm) and then sweeps back so the
// smaller toes come off it on a slant.
const INNER_EDGE = [[0.055, -0.027], [0.0, -0.029], [-0.04, -0.031], [-0.08, -0.036], [-0.12, -0.04], [-0.14, -0.039], [-0.152, -0.036]];
const OUTER_EDGE = [[0.055, 0.029], [0.0, 0.033], [-0.04, 0.039], [-0.08, 0.048], [-0.105, 0.056], [-0.12, 0.05], [-0.135, 0.03], [-0.152, 0.0]];
const HEIGHT = [[0.055, 0.05], [0.03, 0.058], [0.0, 0.075], [-0.04, 0.064], [-0.08, 0.046], [-0.115, 0.031], [-0.152, 0.024]];
const ARCH = [[0.01, 0], [-0.02, 0.009], [-0.06, 0.012], [-0.095, 0]]; // lift of the inner sole

// Toes, big toe first. x = across the foot (toward the little toe is +), base/tip z, radius.
const TOES = [
  { x: -0.027, base: -0.128, tip: -0.195, r: 0.0135, splay: -0.02 },
  { x: -0.0045, base: -0.13, tip: -0.19, r: 0.0094, splay: 0.02 },
  { x: 0.013, base: -0.126, tip: -0.183, r: 0.0087, splay: 0.06 },
  { x: 0.0292, base: -0.12, tip: -0.174, r: 0.008, splay: 0.1 },
  { x: 0.0438, base: -0.111, tip: -0.162, r: 0.0071, splay: 0.15 },
];

const sample = (table, z) => {
  if (z >= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [z1, v1] = table[i];
    if (z >= z1) {
      const [z0, v0] = table[i - 1];
      return v0 + ((z - z0) / (z1 - z0)) * (v1 - v0);
    }
  }
  return table[table.length - 1][1];
};

function createSkin() {
  return new THREE.MeshPhysicalMaterial({
    color: SKIN_COLOR,
    roughness: 0.36, // wet
    specularIntensity: 0.55,
    clearcoat: 0.35,
    clearcoatRoughness: 0.25,
    side: THREE.FrontSide, // every surface here is closed, so nothing ever shows its inside
  });
}

/** The foot body from heel to the base of the toes, as one closed loft. */
function footBodyGeometry(side) {
  const RINGS = 30;
  const SEGMENTS = 18;
  const positions = [];
  const indices = [];

  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS;
    const z = HEEL_Z + (BODY_FRONT_Z - HEEL_Z) * t;
    // Round both ends: shrink the section on a quarter circle over the first and last stretch.
    const uBack = Math.min(1, t / 0.14);
    const uFront = Math.min(1, (1 - t) / 0.1);
    const round = Math.sqrt(1 - (1 - uBack) ** 2) * Math.sqrt(1 - (1 - uFront) ** 2);
    const inner = sample(INNER_EDGE, z);
    const outer = sample(OUTER_EDGE, z);
    const h = sample(HEIGHT, z);
    const arch = sample(ARCH, z);
    const cx = (inner + outer) / 2;
    const a = ((outer - inner) / 2) * round;
    const b = (h / 2) * Math.max(round, 0.001);
    const cy = h / 2;

    for (let j = 0; j < SEGMENTS; j++) {
      const th = (j / SEGMENTS) * Math.PI * 2;
      const c = Math.cos(th);
      const s = Math.sin(th);
      let x = cx + a * Math.sign(c) * Math.abs(c) ** 0.7;
      let y;
      if (s >= 0) {
        // Top: the instep slopes down toward the outside of the foot.
        y = cy + b * s ** 0.9 * (1 + 0.1 * Math.max(0, -c) - 0.08 * Math.max(0, c));
      } else {
        // Sole: nearly flat, lifted under the inner arch.
        y = cy - b * Math.abs(s) ** 0.3;
        y += arch * Math.max(0, -c) ** 1.5 * round;
      }
      positions.push(x * side, y, z);
    }
  }
  // Close the two ends with a center point each.
  const backCenter = positions.length / 3;
  positions.push(0, sample(HEIGHT, HEEL_Z) / 2, HEEL_Z);
  const frontCenter = backCenter + 1;
  positions.push(((sample(INNER_EDGE, BODY_FRONT_Z) + sample(OUTER_EDGE, BODY_FRONT_Z)) / 2) * side, sample(HEIGHT, BODY_FRONT_Z) / 2, BODY_FRONT_Z);

  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < SEGMENTS; j++) {
      const a = i * SEGMENTS + j;
      const b = i * SEGMENTS + ((j + 1) % SEGMENTS);
      const c = a + SEGMENTS;
      const d = b + SEGMENTS;
      indices.push(a, c, b, b, c, d);
    }
  }
  const last = RINGS * SEGMENTS;
  for (let j = 0; j < SEGMENTS; j++) {
    const j2 = (j + 1) % SEGMENTS;
    indices.push(backCenter, j, j2);
    indices.push(frontCenter, last + j2, last + j);
  }
  // Mirroring the x coordinates flips the winding, so flip it back for the left foot.
  if (side < 0) {
    for (let k = 0; k < indices.length; k += 3) [indices[k + 1], indices[k + 2]] = [indices[k + 2], indices[k + 1]];
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createToes(side, skin, nailMaterial) {
  const toes = new THREE.Group();
  for (const toe of TOES) {
    const length = toe.base - toe.tip;
    const geometry = new THREE.CapsuleGeometry(toe.r, Math.max(0.001, length - 2 * toe.r), 4, 10);
    geometry.rotateX(Math.PI / 2); // along Z
    const mesh = new THREE.Mesh(geometry, skin);
    mesh.scale.y = 0.78; // a little flatter than round
    mesh.position.set(toe.x * side, toe.r * 0.82, (toe.base + toe.tip) / 2);
    mesh.rotation.y = -toe.splay * side; // the smaller toes fan out a touch
    mesh.rotation.x = -0.06; // tips press down
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const nail = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), nailMaterial);
    nail.scale.set(toe.r * 0.68, toe.r * 0.22, toe.r * 0.8);
    nail.position.set(0, toe.r * 0.78, -(length / 2 - toe.r * 0.95)); // capsule local: tip is -Z
    mesh.add(nail);
    toes.add(mesh);
  }
  return toes;
}

/** A closed lower leg, ankle at y = 0, running up its local +Y for `length` meters. */
function legGeometry(length) {
  const profile = [
    [0, 0],
    [0.022, 0.004],
    [0.03, 0.02], // ankle
    [0.031, 0.07],
    [0.042, 0.18],
    [0.05, 0.28], // calf
    [0.043, 0.4],
    [0.042, 0.46], // knee
    [0.055, 0.56],
  ].filter(([, y]) => y < length - 0.06);
  const topR = 0.062;
  profile.push([topR, length - 0.05], [topR * 0.8, length - 0.018], [topR * 0.45, length - 0.004], [0, length]); // rounded cap
  const geometry = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 20);
  return geometry;
}

/** Stands the feet on the floor directly below the player, facing the way the player starts out facing. */
export function createFeet(scene, level, playerPosition, playerForward) {
  const raycaster = new THREE.Raycaster();
  raycaster.set(playerPosition, new THREE.Vector3(0, -1, 0));
  const hit = raycaster.intersectObject(level, true)[0];
  if (!hit) console.warn('No floor found below the player, using FEET_FALLBACK_FLOOR_Y for the feet.');
  const floorY = hit ? hit.point.y : FEET_FALLBACK_FLOOR_Y;
  const eyeHeight = playerPosition.y - floorY;

  const skin = createSkin();
  const nailMaterial = new THREE.MeshPhysicalMaterial({ color: NAIL_COLOR, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.1 });

  const feet = new THREE.Group();
  feet.name = 'Feet';
  feet.position.set(playerPosition.x, floorY, playerPosition.z);
  feet.rotation.y = Math.atan2(-playerForward.x, -playerForward.z);

  const toeOut = THREE.MathUtils.degToRad(FOOT_TOE_OUT_DEG);
  // Ankles a little in front of the eyes; hips under and behind them (you lean to look down).
  // The camera can pitch 80 degrees down, so with a 70 degree view the bottom edge of the screen
  // reaches 25 degrees past straight down. The hip end sits further back than that.
  const ankleZ = -0.05;
  const hipY = Math.max(0.5, eyeHeight - 0.5);
  const hipZ = 0.29;

  for (const side of [1, -1]) {
    const foot = new THREE.Group();
    foot.position.set(side * FOOT_SPACING / 2, 0, ankleZ);
    foot.rotation.y = -side * toeOut; // toes turned outward
    const body = new THREE.Mesh(footBodyGeometry(side), skin);
    body.castShadow = true;
    body.receiveShadow = true;
    foot.add(body, createToes(side, skin, nailMaterial));
    feet.add(foot);

    // Lower leg: from inside the top of the ankle up toward the hip, ending in a closed cap.
    const ankle = new THREE.Vector3(side * FOOT_SPACING / 2, 0.035, ankleZ);
    const hip = new THREE.Vector3(side * 0.1, hipY, hipZ);
    const direction = hip.clone().sub(ankle);
    const leg = new THREE.Mesh(legGeometry(direction.length()), skin);
    leg.position.copy(ankle);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    leg.castShadow = true;
    leg.receiveShadow = true;
    feet.add(leg);
  }

  const film = waterFilm();
  film.scale.set(1.5, 1.3, 1);
  feet.add(film);
  scene.add(feet);
  return feet;
}
