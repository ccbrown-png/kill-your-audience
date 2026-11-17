import { getAudio, createNoiseBuffer } from '../audio.js';
import { SPRAY_HISS_VOLUME } from '../config.js';

// PLACEHOLDER: swap for a real recording. The game only uses setActive(true/false).

const FADE_SECONDS = 0.03;
const NOISE_SECONDS = 2;

export function createSprayHiss() {
  let gain = null;
  let active = false;

  /** Builds the sound on first use, because audio doesn't exist until the first click. */
  function build({ context, master }) {
    const noise = context.createBufferSource();
    noise.buffer = createNoiseBuffer(context, NOISE_SECONDS);
    noise.loop = true;

    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 2800;

    gain = context.createGain();
    gain.gain.value = 0;

    noise.connect(highpass).connect(gain).connect(master);
    noise.start();
  }

  function setActive(on) {
    if (on === active) return;
    const audio = getAudio();
    if (!audio) return;
    active = on;
    if (!gain) build(audio);
    gain.gain.setTargetAtTime(on ? SPRAY_HISS_VOLUME : 0, audio.context.currentTime, FADE_SECONDS);
  }

  return { setActive };
}
