import * as THREE from 'three';
import { HAND_MOVE_SPEED, HAND_POSES } from '../config.js';

// PLACEHOLDER: capsule-and-box hands with no rigging. To swap in static .glb hand poses later, keep
// the functions returned at the bottom, and show a different model for each shape in setShape().

const SKIN = 0xd9b8a0;

// Finger curl in radians for each static pose: base and tip joints, and the thumb.
// The palm faces the hand's local -Z, so fingers curl that way.
const SHAPES = {
  reach: { base: 0.12, tip: 0.1, thumb: 0.3 },
  grip: { base: 1.25, tip: 1.3, thumb: 1.0 },
  lather: { base: 0.65, tip: 0.8, thumb: 0.5 },
};

const FINGER_LENGTH = 0.042;
const FINGER_RADIUS = 0.0085;

/** Draws over everything, like the can, so walls and the curtain can't cut through it. */
function createHand(side) {
  const root = new THREE.Group();
  // Mirrored inside its own group, so the left hand is a true left hand but root rotations stay simple.
  const body = new THREE.Group();
  body.scale.x = side;
  root.add(body);

  const material = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.7, depthTest: false, fog: false });
  let drawOrder = 3000;
  function addMesh(parent, geometry) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = drawOrder++;
    parent.add(mesh);
    return mesh;
  }

  const forearm = addMesh(body, new THREE.CapsuleGeometry(0.03, 0.5, 4, 10));
  forearm.position.y = -0.27;

  const palm = addMesh(body, new THREE.BoxGeometry(0.082, 0.09, 0.03));
  palm.position.y = 0.04;

  // Each finger: a base joint at the palm, holding a tip joint halfway along.
  const segmentGeometry = new THREE.CapsuleGeometry(FINGER_RADIUS, FINGER_LENGTH * 0.7, 3, 8);
  segmentGeometry.translate(0, FINGER_LENGTH / 2, 0); // so each segment rotates from its end

  function addFinger(x, y) {
    const base = new THREE.Group();
    base.position.set(x, y, 0);
    body.add(base);
    addMesh(base, segmentGeometry);
    const tip = new THREE.Group();
    tip.position.y = FINGER_LENGTH;
    base.add(tip);
    addMesh(tip, segmentGeometry);
    return { base, tip };
  }

  const fingers = [-0.03, -0.01, 0.01, 0.03].map((x) => addFinger(x, 0.085));
  const thumb = addFinger(-0.047, 0.03);
  thumb.base.rotation.z = 0.5;

  function setShape(name) {
    const shape = SHAPES[name];
    for (const finger of fingers) {
      finger.base.rotation.x = -shape.base;
      finger.tip.rotation.x = -shape.tip;
    }
    thumb.base.rotation.x = -shape.thumb;
  }

  return { root, setShape };
}

export function createHands(camera) {
  const left = createHand(-1);
  const right = createHand(1);
  camera.add(left.root);
  camera.add(right.root);

  const targets = new Map();
  for (const hand of [left, right]) {
    targets.set(hand, { position: new THREE.Vector3(), rotation: new THREE.Quaternion() });
  }

  const euler = new THREE.Euler();
  function setTarget(hand, poseName, drop = 0, scrub = 0) {
    const pose = HAND_POSES[poseName];
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
    }
  }

  function update(dt) {
    const blend = 1 - Math.exp(-HAND_MOVE_SPEED * dt);
    for (const [hand, target] of targets) {
      hand.root.position.lerp(target.position, blend);
      hand.root.quaternion.slerp(target.rotation, blend);
    }
  }

  function setVisible(visible) {
    left.root.visible = visible;
    right.root.visible = visible;
  }

  return {
    update,
    snap,
    setVisible,
    setLeft: (poseName, shape, scrub = 0) => { setTarget(left, poseName, 0, scrub); left.setShape(shape); },
    setRight: (poseName, shape, drop = 0, scrub = 0) => { setTarget(right, poseName, drop, scrub); right.setShape(shape); },
    /** Puts the right hand at any spot (camera space), for reaching out to the can. */
    setRightTarget: (position, rotation, shape) => {
      const target = targets.get(right);
      target.position.copy(position);
      target.rotation.copy(rotation);
      right.setShape(shape === 'reachOut' ? 'reach' : 'grip');
    },
  };
}
