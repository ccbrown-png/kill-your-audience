import * as THREE from 'three';
import { PITCH_UP_LIMIT, PITCH_DOWN_LIMIT } from './config.js';

const LOOK_SENSITIVITY = 0.002;
const MAX_PITCH_UP = THREE.MathUtils.degToRad(PITCH_UP_LIMIT);
const MIN_PITCH_DOWN = THREE.MathUtils.degToRad(PITCH_DOWN_LIMIT);

/**
 * Stationary first-person player: the camera never moves, it only rotates
 * with the mouse while the pointer is locked (gameFlow.js handles locking).
 */
export function createPlayer(camera, domElement) {
  // Current look direction. yaw = turn left/right, pitch = tilt up/down (radians).
  let yaw = 0;
  let pitch = 0;

  function applyLook() {
    pitch = THREE.MathUtils.clamp(pitch, MIN_PITCH_DOWN, MAX_PITCH_UP);
    // 'YXZ' order = turn left/right first, then tilt up/down (standard FPS look).
    camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  }

  document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement !== domElement) return;

    yaw -= event.movementX * LOOK_SENSITIVITY;
    pitch -= event.movementY * LOOK_SENSITIVITY;
    applyLook();
  });

  /** Point the camera at a world position by setting yaw/pitch, so mouse-look continues from there. */
  function faceWorldPosition(target) {
    const dir = target.clone().sub(camera.position);
    yaw = Math.atan2(-dir.x, -dir.z); // camera looks down -Z by default
    pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
    applyLook();
  }

  /**
   * Put the camera at "PlayerSpawn" (fallback: 0, 1.6, 0) and face "PlayerLookAt"
   * (fallback: "BathTubHandleMiddle").
   */
  function placeAtSpawn(scene) {
    yaw = 0;
    pitch = 0;
    applyLook();

    const spawn = scene.getObjectByName('PlayerSpawn');
    if (spawn) {
      spawn.getWorldPosition(camera.position);
    } else {
      console.warn('PlayerSpawn not found in model — using fallback position (0, 1.6, 0).');
      camera.position.set(0, 1.6, 0);
    }

    let lookTarget = scene.getObjectByName('PlayerLookAt');
    if (!lookTarget) {
      console.warn('PlayerLookAt not found in model — facing BathTubHandleMiddle instead.');
      lookTarget = scene.getObjectByName('BathTubHandleMiddle');
    }
    if (lookTarget) {
      faceWorldPosition(lookTarget.getWorldPosition(new THREE.Vector3()));
    } else {
      console.warn('BathTubHandleMiddle not found either — keeping default view direction.');
    }
  }

  /** Current up/down look angle in degrees (0 = level, negative = looking down). */
  function getPitchDegrees() {
    return THREE.MathUtils.radToDeg(pitch);
  }

  function isLocked() {
    return document.pointerLockElement === domElement;
  }

  /** Test/gallery helper: sets the look angles directly, in radians. */
  function setLook(newYaw, newPitch) {
    yaw = newYaw;
    pitch = newPitch;
    applyLook();
  }

  return { placeAtSpawn, getPitchDegrees, isLocked, faceWorldPosition, setLook, getYaw: () => yaw };
}
