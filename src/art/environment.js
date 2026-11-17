import * as THREE from 'three';
import { BULB_COLOR, SPILL_COLOR, FILL_COLOR } from '../config.js';

/*
 * WHAT AN ENVIRONMENT MAP IS
 *
 * Chrome and wet glaze look shiny because they reflect their surroundings. A real-time game
 * can't afford to trace every reflection, so it renders a rough, blurry 360-degree picture of
 * "the room" once and lets shiny materials look things up in it. Here that room is fake and
 * tiny: a dark box with a warm blob where the bulb is, a cold bright strip where the curtain
 * gap lets in the bathroom light, and a dull blue ceiling. That's enough for chrome to read
 * as chrome instead of grey plastic.
 */
export function createEnvironment(renderer, { bright = false } = {}) {
  const room = new THREE.Scene();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(4, 3, 4),
    new THREE.MeshBasicMaterial({ color: bright ? 0x232a30 : 0x0a0e14, side: THREE.BackSide }),
  );
  room.add(box);

  const addPanel = (color, strength, size, position, lookAt = new THREE.Vector3(0, 0, 0)) => {
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(...size),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(strength), side: THREE.DoubleSide }),
    );
    panel.position.set(...position);
    panel.lookAt(lookAt);
    room.add(panel);
  };

  // Warm bulb overhead, cold gap light to one side, a dim blue wash from above, and pale tile walls.
  addPanel(BULB_COLOR, 9, [0.35, 0.35], [0, 1.45, 0]);
  addPanel(SPILL_COLOR, 4.5, [0.5, 2.2], [1.9, 0, -0.6]);
  addPanel(FILL_COLOR, 0.9, [3.8, 3.8], [0, 1.48, 0.01]);
  // Pale tile walls. Chrome gets a brighter version of the room, so it reads as chrome even in the dark;
  // everything else uses the dim version so the reflections don't flatten the shadows.
  const wall = bright ? 1.1 : 0.2;
  addPanel(0x7d8a92, wall, [3.8, 2.6], [-1.95, 0, 0]);
  addPanel(0x7d8a92, wall * 0.85, [3.8, 2.6], [0, 0, -1.95]);
  addPanel(0x7d8a92, wall * 0.6, [3.8, 2.6], [0, 0, 1.95]);
  if (bright) {
    // Grout-line stripes, so reflections in chrome have some structure instead of a flat glow.
    for (let i = -6; i <= 6; i++) {
      addPanel(0x0d0f10, 1, [0.012, 2.6], [-1.94, 0, i * 0.3]);
      addPanel(0x0d0f10, 1, [3.8, 0.012], [-1.94, i * 0.2, 0]);
    }
  }
  addPanel(0x2a2420, 0.4, [3.8, 3.8], [0, -1.45, 0]);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(room, 0.035).texture;
  pmrem.dispose();
  room.traverse((obj) => {
    obj.geometry?.dispose();
    obj.material?.dispose();
  });
  return texture;
}
