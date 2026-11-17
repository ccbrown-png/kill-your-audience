import * as THREE from 'three';
import { createSprayGauge } from './sprayGauge.js';
import {
  CAN_POSITION,
  CAN_ROTATION,
  CAN_SWAY_AMOUNT,
  CAN_SWAY_SPEED,
  CAN_SPRAY_SHAKE,
  CAN_GAZE_RADIUS,
  CAN_GRAB_TIME,
  CAN_LOWERED_DROP,
} from '../config.js';

// PLACEHOLDER: swap this file's contents for a real can model. The game uses the functions
// returned at the bottom. The root object must stay named "RaidCan" so the gaze step can find it.

const RADIUS = 0.033;
const BOTTOM_OFFSET = 0.1; // distance from the can's center to its base
const RED = 0xc4161c;
const WHITE = 0xefece2;

/*
 * In your hand, the can is drawn on top of everything, like a weapon in a shooter, because the
 * curtain and walls are close enough to poke through it. With the depth test off, draw order
 * decides what covers what, so parts are added from the bottom of the can upward. On the shelf
 * it's an ordinary object in the room, so the depth test is back on.
 */
export function createRaidCan(camera) {
  const root = new THREE.Group();
  root.name = 'RaidCan';

  const materials = [];
  let drawOrder = 1000;
  function addPart(geometry, color, y, z = 0) {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.15, fog: false });
    materials.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, y, z);
    mesh.renderOrder = drawOrder++;
    root.add(mesh);
    return mesh;
  }

  // Stacked bands, centered on y = 0 for the whole can body.
  addPart(new THREE.CylinderGeometry(RADIUS, RADIUS, 0.09, 24), RED, -0.055);
  addPart(new THREE.CylinderGeometry(RADIUS, RADIUS, 0.04, 24), WHITE, 0.01);
  addPart(new THREE.CylinderGeometry(RADIUS, RADIUS, 0.06, 24), RED, 0.06);
  addPart(new THREE.CylinderGeometry(RADIUS * 0.45, RADIUS * 0.95, 0.018, 20), WHITE, 0.099); // shoulder
  addPart(new THREE.CylinderGeometry(RADIUS * 0.42, RADIUS * 0.42, 0.016, 16), WHITE, 0.116); // cap

  const nozzle = addPart(new THREE.BoxGeometry(0.012, 0.009, 0.02), 0x222222, 0.127, -0.006);
  const nozzleTip = new THREE.Object3D();
  nozzleTip.position.set(0, 0, -0.011);
  nozzle.add(nozzleTip);

  // Invisible and wider than the can, so the gaze step doesn't need pixel-perfect aim.
  const gazeTarget = new THREE.Mesh(new THREE.CylinderGeometry(CAN_GAZE_RADIUS, CAN_GAZE_RADIUS, 0.25, 12));
  gazeTarget.position.y = 0.02;
  gazeTarget.visible = false;
  root.add(gazeTarget);

  const gauge = createSprayGauge(root);

  const handRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...CAN_ROTATION));
  const handPosition = new THREE.Vector3();
  const grabStartPosition = new THREE.Vector3();
  const grabStartRotation = new THREE.Quaternion();
  let level = null;
  const shelfSpot = new THREE.Vector3();
  let inHand = false;
  let grabProgress = 0;
  let time = 0;

  function setDrawnOnTop(onTop) {
    for (const material of materials) material.depthTest = !onTop;
  }

  /** Puts the can back on the shelf, as part of the room so the gaze ray can find it. */
  function returnToShelf() {
    inHand = false;
    level.add(root);
    root.position.copy(shelfSpot);
    root.quaternion.identity();
    root.visible = true;
    setDrawnOnTop(false);
    gauge.setVisible(false);
  }

  /** @param {THREE.Vector3} spot where the base of the can sits, in world space */
  function placeOnShelf(levelRoot, spot) {
    level = levelRoot;
    shelfSpot.copy(spot);
    shelfSpot.y += BOTTOM_OFFSET;
    returnToShelf();
  }

  /** Takes the can off the shelf. attach() keeps it where it is, then update() flies it to the hand. */
  function grab() {
    camera.attach(root);
    grabStartPosition.copy(root.position);
    grabStartRotation.copy(root.quaternion);
    grabProgress = 0;
    inHand = true;
    setDrawnOnTop(true);
    gauge.setVisible(true);
  }

  /**
   * @param {boolean} spraying shakes the can
   * @param {number} lowered 0 = raised, 1 = fully out of view
   */
  function update(dt, spraying, lowered) {
    if (!inHand) return;

    time += dt;
    const swayTime = time * CAN_SWAY_SPEED;
    const shake = spraying ? CAN_SPRAY_SHAKE : 0;
    handPosition.set(
      CAN_POSITION[0] + Math.sin(swayTime) * CAN_SWAY_AMOUNT + (Math.random() - 0.5) * shake,
      CAN_POSITION[1] + Math.sin(swayTime * 1.7) * CAN_SWAY_AMOUNT * 0.7 + (Math.random() - 0.5) * shake
        - THREE.MathUtils.smoothstep(lowered, 0, 1) * CAN_LOWERED_DROP,
      CAN_POSITION[2],
    );

    grabProgress = Math.min(1, grabProgress + dt / CAN_GRAB_TIME);
    const blend = THREE.MathUtils.smootherstep(grabProgress, 0, 1);
    root.position.lerpVectors(grabStartPosition, handPosition, blend);
    root.quaternion.slerpQuaternions(grabStartRotation, handRotation, blend);
  }

  return {
    placeOnShelf,
    returnToShelf,
    grab,
    update,
    isInHand: () => inHand,
    getNozzleWorldPosition: (target) => nozzleTip.getWorldPosition(target),
    setAmmo: gauge.set,
    setVisible: (visible) => { root.visible = visible; },
  };
}
