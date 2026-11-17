import * as THREE from 'three';
import { SPIDER_HIT_DEPTH_TOLERANCE } from './config.js';

// The only objects that count as targets. Names must match Blender exactly.
export const TARGET_NAMES = new Set([
  'RaidCan', // the placeholder can on the shelf, created in code
  'Towel',
  'BathTubHandleMiddle', // the faucet
  'BathTubHandleLeft',
  'BathTubHandleRight',
  'BathTubShowerHead',
  'Shelf',
  'Drain',
  'ShowerCurtain',
]);

const SCREEN_CENTER = new THREE.Vector2(0, 0);

/** Walk up from a hit mesh until we find a target object (itself or a parent). */
function findTarget(object) {
  for (let o = object; o; o = o.parent) {
    if (TARGET_NAMES.has(o.name)) return o;
  }
  return null;
}

/**
 * Casts a ray from the center of the camera each frame. Routine targets are tested against the
 * bathroom model only, so spiders, the can and spray particles can never block them.
 */
export function createCrosshairRaycaster(camera) {
  const raycaster = new THREE.Raycaster();
  const entryPoint = new THREE.Vector3();
  let level = null;
  let hitDistance = null;

  /** Returns the target object under the crosshair, or null. */
  function update() {
    hitDistance = null;
    if (!level) return null;
    raycaster.setFromCamera(SCREEN_CENTER, camera);
    const hits = raycaster.intersectObject(level, true);
    if (hits.length === 0) return null;
    hitDistance = hits[0].distance;
    // Only the closest surface matters, so walls etc. block targets behind them.
    return findTarget(hits[0].object);
  }

  /**
   * Returns the closest item under the crosshair, or null. Items need a hitSphere. Anything
   * behind a wall doesn't count. Call after update().
   */
  function findUnderCrosshair(items) {
    let closest = null;
    let closestDistance = Infinity;
    const maxDistance = (hitDistance ?? Infinity) + SPIDER_HIT_DEPTH_TOLERANCE;
    for (const item of items) {
      if (!raycaster.ray.intersectSphere(item.hitSphere, entryPoint)) continue;
      const distance = entryPoint.distanceTo(raycaster.ray.origin);
      if (distance <= maxDistance && distance < closestDistance) {
        closest = item;
        closestDistance = distance;
      }
    }
    return closest;
  }

  return {
    update,
    findUnderCrosshair,
    setLevel: (root) => { level = root; },
    /** Meters to the surface under the crosshair, or null if there is none. */
    getHitDistance: () => hitDistance,
  };
}
