import { QUALITY } from '../config.js';
import { IS_TOUCH } from '../input.js';

// QUALITY from config.js (always 'low' on phones and tablets), unless the page address says
// ?quality=low or ?quality=high.
const fromUrl = new URLSearchParams(location.search).get('quality');
const level = fromUrl === 'low' || fromUrl === 'high' ? fromUrl : IS_TOUCH ? 'low' : QUALITY;

/** True when the expensive extras (AO, soft shadows, big textures, droplets) should be on. */
export const isHighQuality = () => level === 'high';
