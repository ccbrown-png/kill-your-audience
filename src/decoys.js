import * as THREE from 'three';
import { createDecoyShadow } from './placeholders/decoyShadow.js';
import { isPeripheral } from './peripheral.js';
import { DECOY_MAX, DECOY_HIT_RADIUS, DECOY_DISSOLVE_TIME } from './config.js';

const TILE_MESH_NAME = 'BathTiles';
const PLACEMENT_TRIES = 24; // random directions tried before giving up on a spot
const SURFACE_GAP = 0.003; // lifts the shadow off the tile so it doesn't flicker
const PLANE_FACING = new THREE.Vector3(0, 0, 1);

/** Fake spider shadows on the tiles. They do nothing except dissolve when the crosshair crosses them. */
export function createDecoys(scene, camera) {
  const raycaster = new THREE.Raycaster();
  const decoys = [];
  let level = null;

  /** Tries to put a shadow on a tile near the edge of the view. Returns true if it did. */
  function trySpawn() {
    if (!level || decoys.length >= DECOY_MAX) return false;

    const direction = new THREE.Vector3();
    for (let i = 0; i < PLACEMENT_TRIES; i++) {
      direction.randomDirection();
      raycaster.set(camera.position, direction);
      const hit = raycaster.intersectObject(level, true)[0];
      if (!hit || hit.object.name !== TILE_MESH_NAME || !isPeripheral(camera, hit.point)) continue;

      const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      if (normal.dot(direction) > 0) normal.negate(); // materials are double-sided

      const shadow = createDecoyShadow();
      shadow.mesh.position.copy(hit.point).addScaledVector(normal, SURFACE_GAP);
      shadow.mesh.quaternion.setFromUnitVectors(PLANE_FACING, normal);
      shadow.mesh.rotateZ(Math.random() * Math.PI * 2);
      scene.add(shadow.mesh);

      decoys.push({
        shadow,
        hitSphere: new THREE.Sphere(hit.point.clone(), DECOY_HIT_RADIUS),
        dissolveTime: null, // seconds into dissolving, null until the crosshair touches it
      });
      return true;
    }
    return false;
  }

  function remove(decoy) {
    scene.remove(decoy.shadow.mesh);
    decoy.shadow.dispose();
  }

  function update(dt, crosshair) {
    const touched = crosshair.findUnderCrosshair(decoys.filter((d) => d.dissolveTime === null));
    if (touched) touched.dissolveTime = 0;

    for (let i = decoys.length - 1; i >= 0; i--) {
      const decoy = decoys[i];
      if (decoy.dissolveTime === null) continue;
      decoy.dissolveTime += dt;
      const t = Math.min(decoy.dissolveTime / DECOY_DISSOLVE_TIME, 1);
      decoy.shadow.setDissolve(t);
      if (t >= 1) {
        remove(decoy);
        decoys.splice(i, 1);
      }
    }
  }

  function reset() {
    decoys.forEach(remove);
    decoys.length = 0;
  }

  return { setLevel: (root) => { level = root; }, trySpawn, update, reset, getAll: () => decoys };
}
