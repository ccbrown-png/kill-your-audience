import * as THREE from 'three';
import { FALLBACK_SPAWN_POINTS } from './config.js';

const PREFIX = 'Spawn_';
// Lifts a spider off the surface by 2mm so its feet don't flicker into the tile.
export const SURFACE_GAP = 0.002;

/*
 * Blender's Z axis (up) becomes Y in the exported glb, for the Empty and for the world. The
 * spider's back is its local Y. So copying the Empty's rotation points the spider's back along
 * the Z arrow you see on the Empty in Blender, and its head along the Empty's -Y arrow.
 */
function fromEmpty(empty) {
  return {
    name: empty.name,
    position: empty.getWorldPosition(new THREE.Vector3()),
    quaternion: empty.getWorldQuaternion(new THREE.Quaternion()),
    occupied: false,
  };
}

/** Rotation that stands a spider on a surface (back along normal) with its head toward lookPosition. */
export function surfaceRotation(normal, position, lookPosition) {
  const forward = lookPosition.clone().sub(position);
  forward.addScaledVector(normal, -forward.dot(normal));
  if (forward.lengthSq() < 1e-6) {
    // Looking straight along the normal: any direction lying on the surface will do.
    forward.set(1, 0, 0).addScaledVector(normal, -normal.x);
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1);
  }
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(normal, forward);
  const basis = new THREE.Matrix4().makeBasis(right, normal, forward);
  return new THREE.Quaternion().setFromRotationMatrix(basis);
}

/** Finds the real surface in the direction of a hardcoded position, so spiders sit on the model. */
export function fallbackPoint({ name, position }, level, playerPosition, raycaster) {
  const point = new THREE.Vector3(...position);
  const direction = point.clone().sub(playerPosition).normalize();
  raycaster.set(playerPosition, direction);
  const hit = raycaster.intersectObject(level, true)[0];

  const normal = new THREE.Vector3(0, 1, 0);
  if (hit) {
    point.copy(hit.point);
    normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
    // Materials are double-sided, so make sure the normal faces the side the player sees.
    if (normal.dot(direction) > 0) normal.negate();
    point.addScaledVector(normal, SURFACE_GAP);
  } else {
    console.warn(`Fallback spawn ${name}: no surface found, using its hardcoded position.`);
  }

  return { name, position: point, quaternion: surfaceRotation(normal, point, playerPosition), occupied: false };
}

/** Uses every Spawn_* object in the model, or creates fallback points if there are none. */
export function collectSpawnPoints(level, playerPosition) {
  level.updateMatrixWorld(true);

  const empties = [];
  level.traverse((obj) => {
    if (obj.name.startsWith(PREFIX) && !obj.parent?.name.startsWith(PREFIX)) empties.push(obj);
  });

  if (empties.length > 0) {
    console.log(`Spawn points from model: ${empties.map((e) => e.name).join(', ')}`);
    return empties.map(fromEmpty);
  }

  const names = FALLBACK_SPAWN_POINTS.map((p) => p.name).join(', ');
  console.warn(`No Spawn_* objects in bathtub.glb, using fallback positions. Add these Empties in Blender: ${names}`);
  const raycaster = new THREE.Raycaster();
  return FALLBACK_SPAWN_POINTS.map((p) => fallbackPoint(p, level, playerPosition, raycaster));
}
