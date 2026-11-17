import { QUALITY } from '../config.js';

// QUALITY from config.js, unless the page address says ?quality=low or ?quality=high.
const fromUrl = new URLSearchParams(location.search).get('quality');
const level = fromUrl === 'low' || fromUrl === 'high' ? fromUrl : QUALITY;

/** True when the expensive extras (AO, soft shadows, big textures, droplets) should be on. */
export const isHighQuality = () => level === 'high';
