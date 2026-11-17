import * as THREE from 'three';
import { getAudio } from '../audio.js';
import { HEARTBEAT_VOLUME, HEARTBEAT_START_THREAT, HEARTBEAT_GAP_SLOW, HEARTBEAT_GAP_FAST } from '../config.js';

// PLACEHOLDER: swap for a real recording. The game only uses update(dt, threat) and reset().

const THUMP_LENGTH = 0.16;
const SECOND_THUMP_DELAY = 0.17; // the "dub" after the "lub"
const SECOND_THUMP_LEVEL = 0.65;
const QUIETEST = 0.35; // loudness when the heartbeat first starts, compared to full

export function createHeartbeat() {
  let wait = 0;

  function thump({ context, master }, time, volume) {
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(62, time);
    oscillator.frequency.exponentialRampToValueAtTime(38, time + THUMP_LENGTH);

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + THUMP_LENGTH);

    oscillator.connect(gain).connect(master);
    oscillator.start(time);
    oscillator.stop(time + THUMP_LENGTH);
  }

  /** @param {number} threat 0 to 1 */
  function update(dt, threat) {
    if (threat < HEARTBEAT_START_THREAT) {
      wait = 0;
      return;
    }
    wait -= dt;
    if (wait > 0) return;

    const intensity = (threat - HEARTBEAT_START_THREAT) / (1 - HEARTBEAT_START_THREAT);
    wait = THREE.MathUtils.lerp(HEARTBEAT_GAP_SLOW, HEARTBEAT_GAP_FAST, intensity);

    const audio = getAudio();
    if (!audio) return;
    const volume = HEARTBEAT_VOLUME * THREE.MathUtils.lerp(QUIETEST, 1, intensity);
    const now = audio.context.currentTime;
    thump(audio, now, volume);
    thump(audio, now + SECOND_THUMP_DELAY, volume * SECOND_THUMP_LEVEL);
  }

  return { update, reset: () => { wait = 0; } };
}
