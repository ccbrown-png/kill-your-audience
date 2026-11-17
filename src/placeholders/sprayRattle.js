import { getAudio, createNoiseBuffer } from '../audio.js';
import { SPRAY_RATTLE_VOLUME } from '../config.js';

// PLACEHOLDER: swap for a real recording. The game only uses play().

const NOISE_SECONDS = 0.5;
const CLICK_LENGTH = 0.03;

/** The dry rattle of an empty can: a few tiny metallic clicks in quick succession. */
export function createSprayRattle() {
  let noiseBuffer = null;

  function playClick({ context, master }, time) {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;

    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2600 + Math.random() * 1600;
    filter.Q.value = 5;

    const gain = context.createGain();
    gain.gain.setValueAtTime(SPRAY_RATTLE_VOLUME, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + CLICK_LENGTH);

    source.connect(filter).connect(gain).connect(master);
    source.start(time, Math.random() * (NOISE_SECONDS - CLICK_LENGTH), CLICK_LENGTH);
  }

  function play() {
    const audio = getAudio();
    if (!audio) return;
    if (!noiseBuffer) noiseBuffer = createNoiseBuffer(audio.context, NOISE_SECONDS);

    const clicks = 3 + Math.floor(Math.random() * 3);
    let time = audio.context.currentTime;
    for (let i = 0; i < clicks; i++) {
      playClick(audio, time);
      time += 0.02 + Math.random() * 0.03;
    }
  }

  return { play };
}
