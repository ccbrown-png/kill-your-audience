import * as THREE from 'three';
import { TOWEL_POSITION, TOWEL_SIZE } from '../config.js';

// PLACEHOLDER: a flat box. Add an object named "Towel" in Blender to replace it.

/** Adds a towel to the room, so the gaze ray can find it. */
export function createTowel(level) {
  const towel = new THREE.Mesh(
    new THREE.BoxGeometry(...TOWEL_SIZE),
    new THREE.MeshStandardMaterial({ color: 0xc9b58f, roughness: 0.95 }),
  );
  towel.name = 'Towel';
  towel.position.fromArray(TOWEL_POSITION);
  level.add(towel);
  return towel;
}
