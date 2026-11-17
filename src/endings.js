import * as THREE from 'three';
import {
  LOSE_ZOOM_TIME,
  LOSE_TURN_TIME,
  LOSE_FADE_TIME,
  LOSE_FINAL_DISTANCE,
  LOSE_FINAL_FOV,
  WIN_SILENCE_TIME,
} from './config.js';

const LOOK_MATRIX_UP = new THREE.Vector3(0, 1, 0);

/** Plays what happens between the moment of losing or winning and the end screen. */
export function createEndings(camera, onFinished) {
  const fade = document.getElementById('fade');
  const startPosition = new THREE.Vector3();
  const endPosition = new THREE.Vector3();
  const startRotation = new THREE.Quaternion();
  const endRotation = new THREE.Quaternion();
  const lookMatrix = new THREE.Matrix4();
  const startFov = camera.fov;

  let running = null; // 'lose', 'win' or null
  let time = 0;
  let hasTarget = false;

  /** @param {THREE.Vector3|null} target the spider to zoom into, if there is one */
  function startLose(target) {
    running = 'lose';
    time = 0;
    hasTarget = target !== null;
    if (hasTarget) {
      startPosition.copy(camera.position);
      startRotation.copy(camera.quaternion);
      const away = camera.position.clone().sub(target).normalize();
      endPosition.copy(target).addScaledVector(away, LOSE_FINAL_DISTANCE);
      lookMatrix.lookAt(endPosition, target, LOOK_MATRIX_UP);
      endRotation.setFromRotationMatrix(lookMatrix);
    }
  }

  function startWin() {
    running = 'win';
    time = 0;
  }

  function finish() {
    const finished = running;
    running = null;
    onFinished(finished);
  }

  function updateLose() {
    if (hasTarget) {
      const turn = THREE.MathUtils.smootherstep(time, 0, LOSE_TURN_TIME);
      camera.quaternion.slerpQuaternions(startRotation, endRotation, turn);
      // Squared, so the zoom creeps at first and closes in at the end.
      const zoom = (time / LOSE_ZOOM_TIME) ** 2;
      camera.position.lerpVectors(startPosition, endPosition, Math.min(zoom, 1));
      camera.fov = THREE.MathUtils.lerp(startFov, LOSE_FINAL_FOV, Math.min(zoom, 1));
      camera.updateProjectionMatrix();
    }
    fade.style.opacity = THREE.MathUtils.clamp(
      (time - (LOSE_ZOOM_TIME - LOSE_FADE_TIME)) / LOSE_FADE_TIME, 0, 1,
    );
    if (time >= LOSE_ZOOM_TIME) finish();
  }

  function update(dt) {
    time += dt;
    if (running === 'lose') updateLose();
    else if (running === 'win' && time >= WIN_SILENCE_TIME) finish();
  }

  function reset() {
    running = null;
    fade.style.opacity = 0;
    camera.fov = startFov;
    camera.updateProjectionMatrix();
  }

  return { startLose, startWin, update, reset, isRunning: () => running !== null, isLosing: () => running === 'lose' };
}
