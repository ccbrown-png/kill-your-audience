import { getAudio, createNoiseBuffer } from '../audio.js';
import { SKITTER_VOLUME } from '../config.js';

// PLACEHOLDER: swap for a real recording. The game only uses play(position).

const NOISE_SECONDS = 0.5;
const CLICK_LENGTH = 0.02;
const CLICK_BOOST = 5; // narrow filtered noise is very quiet, so make up for it here

/** A few tiny random clicks, heard from a position in the room. */
export function createSkitterSound() {
  let noiseBuffer = null;

  function playClick(context, output, time) {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;

    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800 + Math.random() * 3000;
    filter.Q.value = 1.5;

    const gain = context.createGain();
    const loudness = SKITTER_VOLUME * CLICK_BOOST * (0.5 + Math.random() * 0.5);
    gain.gain.setValueAtTime(loudness, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + CLICK_LENGTH);

    source.connect(filter).connect(gain).connect(output);
    source.start(time, Math.random() * (NOISE_SECONDS - CLICK_LENGTH), CLICK_LENGTH);
  }

  /** @param {THREE.Vector3} position where in the room the sound comes from */
  function play(position) {
    const audio = getAudio();
    if (!audio) return;
    const { context, master } = audio;
    if (!noiseBuffer) noiseBuffer = createNoiseBuffer(context, NOISE_SECONDS);

    const panner = context.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 0.4; // the room is tiny, so loudness barely changes and direction does the work
    panner.setPosition(position.x, position.y, position.z);
    panner.connect(master);

    const clicks = 3 + Math.floor(Math.random() * 4);
    let time = context.currentTime;
    for (let i = 0; i < clicks; i++) {
      playClick(context, panner, time);
      time += 0.012 + Math.random() * 0.03;
    }
  }

  return { play };
}
