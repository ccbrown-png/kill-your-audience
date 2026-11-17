import * as THREE from 'three';
import { SPAWN_EDGE_THRESHOLD } from './config.js';

const scratch = new THREE.Vector3();

/** True if a world position is behind the camera, off-screen, or near the screen edge. */
export function isPeripheral(camera, position) {
  scratch.copy(position).applyMatrix4(camera.matrixWorldInverse);
  if (scratch.z >= 0) return true; // behind the camera
  scratch.applyMatrix4(camera.projectionMatrix);
  return Math.max(Math.abs(scratch.x), Math.abs(scratch.y)) >= SPAWN_EDGE_THRESHOLD;
}
