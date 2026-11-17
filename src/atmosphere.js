import * as THREE from 'three';
import {
  FOG_COLOR,
  FOG_DENSITY_MIN,
  FOG_DENSITY_MAX,
  FLICKER_GAP_CALM,
  FLICKER_GAP_FRANTIC,
  FLICKER_LENGTH_MIN,
  FLICKER_LENGTH_MAX,
  FLICKER_BRIGHTNESS,
} from './config.js';

/** Steam that thickens and lights that stutter as threat rises. */
export function createAtmosphere(scene, lights) {
  scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY_MIN);
  const normalBrightness = lights.map((light) => light.intensity);
  let nextFlicker = FLICKER_GAP_CALM;
  let flickerLeft = 0;

  function setLightLevel(level) {
    lights.forEach((light, i) => { light.intensity = normalBrightness[i] * level; });
  }

  /** @param {number} threat 0 to 1 */
  function update(dt, threat) {
    scene.fog.density = THREE.MathUtils.lerp(FOG_DENSITY_MIN, FOG_DENSITY_MAX, threat);

    if (flickerLeft > 0) {
      flickerLeft -= dt;
      if (flickerLeft <= 0) setLightLevel(1);
      return;
    }

    nextFlicker -= dt;
    if (nextFlicker <= 0) {
      flickerLeft = THREE.MathUtils.randFloat(FLICKER_LENGTH_MIN, FLICKER_LENGTH_MAX);
      setLightLevel(FLICKER_BRIGHTNESS);
      const averageGap = THREE.MathUtils.lerp(FLICKER_GAP_CALM, FLICKER_GAP_FRANTIC, threat);
      nextFlicker = averageGap * THREE.MathUtils.randFloat(0.5, 1.5);
    }
  }

  function reset() {
    scene.fog.density = FOG_DENSITY_MIN;
    setLightLevel(1);
    nextFlicker = FLICKER_GAP_CALM;
    flickerLeft = 0;
  }

  return { update, reset };
}
