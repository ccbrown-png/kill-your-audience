import { getAudio } from '../audio.js';
import { STING_VOLUME } from '../config.js';

// PLACEHOLDER: swap for a real recording. The game only uses play().

const LENGTH = 1.3;

/** A low, falling growl for when a spider appears already close. */
export function createSting() {
  function play() {
    const audio = getAudio();
    if (!audio) return;
    const { context, master } = audio;
    const now = context.currentTime;

    const low = context.createOscillator();
    low.type = 'sawtooth';
    low.frequency.setValueAtTime(70, now);
    low.frequency.exponentialRampToValueAtTime(36, now + LENGTH);

    const sub = context.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(48, now);
    sub.frequency.exponentialRampToValueAtTime(30, now + LENGTH);

    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(STING_VOLUME, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + LENGTH);

    low.connect(filter);
    sub.connect(filter);
    filter.connect(gain).connect(master);
    low.start(now);
    sub.start(now);
    low.stop(now + LENGTH);
    sub.stop(now + LENGTH);
  }

  return { play };
}
