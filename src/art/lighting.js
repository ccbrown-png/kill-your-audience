import * as THREE from 'three';
import { isHighQuality } from './quality.js';
import {
  BULB_COLOR,
  BULB_INTENSITY,
  BULB_SWING_DEGREES,
  BULB_SWING_SPEED,
  BULB_ANCHOR,
  BULB_CORD_LENGTH,
  FILL_COLOR,
  FILL_INTENSITY,
  SPILL_COLOR,
  SPILL_INTENSITY,
} from '../config.js';

/*
 * THE LIGHTING
 *
 * Three lights, each with one job:
 *  - A bare bulb on a cord over the tub. Warm, the only real "key" light, and it swings a
 *    little, so shadows creep back and forth on the tile. It casts soft shadows (high quality).
 *  - A cold blue fill from everywhere (a hemisphere light: bluish from above, murky from below),
 *    so shadows are dark blue instead of pure black.
 *  - The bathroom light outside the curtain, a spotlight aimed in through the gap. The curtain
 *    blocks it, so it lands as a pale wedge of light on the tub and tiles.
 * The atmosphere code dims the bulb and the spill during flickers.
 */

// Bulb candela-ish multiplier, so the config number stays small and readable.
const BULB_SCALE = 1;
const SPILL_SCALE = 1;

function createBulbModel() {
  const group = new THREE.Group();
  group.name = 'Bulb';

  // A19 bulb profile, from the screw base down to the round tip (y goes down from the socket).
  const glassProfile = [
    [0.0, -0.118], [0.012, -0.1175], [0.024, -0.114], [0.03, -0.106], [0.031, -0.096], [0.029, -0.083],
    [0.024, -0.07], [0.017, -0.058], [0.0135, -0.048], [0.0128, -0.04],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const glass = new THREE.Mesh(
    new THREE.LatheGeometry(glassProfile, 28),
    new THREE.MeshPhysicalMaterial({
      color: 0xfff6e6,
      emissive: BULB_COLOR,
      emissiveIntensity: 1.6,
      roughness: 0.35,
      transmission: 0,
      transparent: true,
      opacity: 0.92,
    }),
  );
  group.add(glass);

  // Filament: a small glowing coil inside the glass.
  const filament = new THREE.Mesh(
    new THREE.TorusGeometry(0.006, 0.0012, 6, 16),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(BULB_COLOR).multiplyScalar(8) }),
  );
  filament.position.y = -0.088;
  group.add(filament);

  // Screw base: a ridged metal sleeve.
  const thread = [];
  for (let i = 0; i <= 12; i++) {
    const y = -0.04 + i * 0.0022;
    thread.push(new THREE.Vector2(0.0125 + (i % 2 ? 0.0012 : 0), y));
  }
  const metal = new THREE.MeshStandardMaterial({ color: 0x8c8678, metalness: 1, roughness: 0.45 });
  group.add(new THREE.Mesh(new THREE.LatheGeometry(thread, 20), metal));

  // Bakelite socket and the cord.
  const socketProfile = [[0.0135, -0.013], [0.018, -0.012], [0.019, 0.0], [0.019, 0.03], [0.012, 0.042], [0.004, 0.046], [0.0, 0.046]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const bakelite = new THREE.MeshStandardMaterial({ color: 0x15110e, roughness: 0.38 });
  group.add(new THREE.Mesh(new THREE.LatheGeometry(socketProfile, 20), bakelite));

  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, BULB_CORD_LENGTH, 6), bakelite);
  cord.position.y = 0.046 + BULB_CORD_LENGTH / 2;
  group.add(cord);

  group.traverse((obj) => {
    if (obj.isMesh) obj.castShadow = false;
  });
  return { group, glass, filament };
}

export function createLighting(scene) {
  const high = isHighQuality();

  // --- Swinging bulb ---
  const pivot = new THREE.Group();
  pivot.position.fromArray(BULB_ANCHOR);
  scene.add(pivot);

  const bulb = createBulbModel();
  bulb.group.position.y = -BULB_CORD_LENGTH - 0.046;
  pivot.add(bulb.group);

  const bulbLight = new THREE.PointLight(BULB_COLOR, BULB_INTENSITY * BULB_SCALE, 9, 2);
  bulbLight.position.y = -BULB_CORD_LENGTH - 0.046 - 0.09;
  pivot.add(bulbLight);
  if (high) {
    bulbLight.castShadow = true;
    bulbLight.shadow.mapSize.set(1024, 1024);
    bulbLight.shadow.radius = 4;
    bulbLight.shadow.bias = -0.0012;
    bulbLight.shadow.normalBias = 0.012;
    bulbLight.shadow.camera.near = 0.03;
    bulbLight.shadow.camera.far = 6;
  }

  // --- Cold fill ---
  const fill = new THREE.HemisphereLight(FILL_COLOR, 0x1a1512, FILL_INTENSITY);
  scene.add(fill);

  // --- Spill through the curtain gap, from a light in the room outside ---
  const spill = new THREE.SpotLight(SPILL_COLOR, SPILL_INTENSITY * SPILL_SCALE, 7, THREE.MathUtils.degToRad(38), 0.7, 1.6);
  spill.position.set(1.05, 2.3, -0.75);
  spill.target.position.set(-0.3, 0.55, -1.25);
  scene.add(spill, spill.target);
  if (high) {
    spill.castShadow = true;
    spill.shadow.mapSize.set(2048, 2048);
    spill.shadow.radius = 5;
    spill.shadow.bias = -0.0008;
    spill.shadow.normalBias = 0.01;
    spill.shadow.camera.near = 0.2;
    spill.shadow.camera.far = 5;
  }

  // Lights light both the world and the hands/can, which live on the viewmodel layer.
  for (const light of [bulbLight, fill, spill]) light.layers.enableAll();

  let time = Math.random() * 10;
  const baseBulb = bulbLight.intensity;

  /** Swings the bulb, and keeps the glowing glass in step with the light's flicker. */
  function update(dt) {
    time += dt;
    const swing = THREE.MathUtils.degToRad(BULB_SWING_DEGREES);
    // Two slow pendulum motions at slightly different speeds trace a lazy ellipse, never a clean loop.
    pivot.rotation.x = Math.sin(time * BULB_SWING_SPEED * 2.1) * swing;
    pivot.rotation.z = Math.sin(time * BULB_SWING_SPEED * 1.63 + 1.2) * swing * 0.6;
    const level = bulbLight.intensity / baseBulb;
    bulb.glass.material.emissiveIntensity = 1.6 * level;
    bulb.filament.material.color.set(BULB_COLOR).multiplyScalar(8 * level + 0.2);
  }

  return {
    update,
    /** The lights the flicker effect dims. The cold fill never flickers, so it never goes black. */
    flickerLights: [bulbLight, spill],
    bulbLight,
    spill,
    fill,
    pivot,
  };
}
