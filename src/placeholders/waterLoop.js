import { getAudio, createNoiseBuffer } from '../audio.js';
import { WATER_VOLUME } from '../config.js';

// PLACEHOLDER: swap for a real recording. The game only uses start() and stop().

const NOISE_SECONDS = 4;
const FADE_IN = 0.5;
const FADE_OUT = 0.03; // close to instant, so the silence after the shower lands hard

export function createWaterLoop() {
  let gain = null;

  function build({ context, master }) {
    const noise = context.createBufferSource();
    noise.buffer = createNoiseBuffer(context, NOISE_SECONDS);
    noise.loop = true;

    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 3200;

    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 350;

    gain = context.createGain();
    gain.gain.value = 0;

    noise.connect(lowpass).connect(highpass).connect(gain).connect(master);
    noise.start();
  }

  function setLevel(level, fade) {
    const audio = getAudio();
    if (!audio) return;
    if (!gain) build(audio);
    gain.gain.setTargetAtTime(level, audio.context.currentTime, fade);
  }

  return {
    start: () => setLevel(WATER_VOLUME, FADE_IN),
    stop: () => setLevel(0, FADE_OUT),
  };
}
