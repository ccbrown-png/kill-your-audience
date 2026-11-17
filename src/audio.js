// One shared Web Audio context. Browsers only allow sound after a click, so the title
// and pause screens call unlockAudio() from their click handlers.
import * as THREE from 'three';
import { MASTER_VOLUME } from './config.js';

let context = null;
let master = null;
const listenerForward = new THREE.Vector3();
const listenerUp = new THREE.Vector3();

export function unlockAudio() {
  if (!context) {
    context = new (window.AudioContext || window.webkitAudioContext)();
    master = context.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(context.destination);
  }
  if (context.state === 'suspended') context.resume();
}

/** Silences everything at once, for the pause screen. unlockAudio() brings it back. */
export function suspendAudio() {
  context?.suspend();
}

/** A buffer of white noise, the raw material for most of the placeholder sounds. */
export function createNoiseBuffer(audioContext, seconds) {
  const buffer = audioContext.createBuffer(1, audioContext.sampleRate * seconds, audioContext.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Moves the listener's ears to the camera, so positional sounds come from the right direction. */
export function syncListener(camera) {
  if (!context) return;
  const { position } = camera;
  const forward = camera.getWorldDirection(listenerForward);
  const up = listenerUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
  context.listener.setPosition(position.x, position.y, position.z);
  context.listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
}

/** Returns { context, master }, or null if no click has unlocked audio yet. */
export function getAudio() {
  return context ? { context, master } : null;
}
