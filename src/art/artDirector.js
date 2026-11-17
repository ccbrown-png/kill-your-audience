import * as THREE from 'three';
import { createEnvironment } from './environment.js';
import { createLighting } from './lighting.js';
import { createShowerMaterials, unwrapTileWalls } from './showerMaterials.js';
import { dressTub } from './tub.js';
import { dressFixtures } from './fixtures.js';
import { dressCurtain } from './curtain.js';
import { dressShelf } from './shelfDressing.js';
import { createWater } from './water.js';
import { createRoom } from './room.js';
import { createCabinet } from './cabinet.js';
import { WALL_WETTING_TIME } from '../config.js';

/*
 * The one place that builds all the art and keeps it moving. The game calls:
 *   createArtDirector(renderer, scene)  before loading the model (lights, reflections),
 *   dressLevel(level)                    once bathtub.glb is loaded,
 *   update(dt)                           every frame,
 *   setWaterRunning(true/false)          from the routine,
 *   reset()                              on restart.
 * Nothing in here changes how the game plays.
 */
export function createArtDirector(renderer, scene) {
  scene.background = new THREE.Color(0x030405);
  scene.environment = createEnvironment(renderer);
  const chromeEnv = createEnvironment(renderer, { bright: true });
  const lighting = createLighting(scene);

  let materials = null;
  let water = null;
  let curtain = null;
  let room = null;
  let time = 0;
  const spillBase = lighting.spill.intensity;
  const bulbBase = lighting.bulbLight.intensity;

  function dressLevel(level) {
    materials = createShowerMaterials(renderer, chromeEnv);

    const tiles = level.getObjectByName('BathTiles');
    if (tiles?.isMesh) {
      unwrapTileWalls(tiles);
      tiles.material = materials.tile;
      tiles.material.side = THREE.DoubleSide;
      tiles.receiveShadow = true;
    } else {
      console.warn('No "BathTiles" mesh in bathtub.glb, skipping the tile art.');
    }

    const { drainCenter } = dressTub(level, materials);
    const { nozzles, axis } = dressFixtures(level, materials);
    curtain = dressCurtain(level, materials.chrome);
    dressShelf(level, materials.chrome);

    // The Drain marker cube from Blender floats above the real drain; keep it for the gaze ray but hide it.
    const drainMarker = level.getObjectByName('Drain');
    if (drainMarker?.isMesh) drainMarker.material = new THREE.MeshBasicMaterial({ visible: false });

    room = createRoom(scene);
    water = createWater(scene, { nozzles, axis, drainCenter, level });
    const cabinet = createCabinet(scene, level, materials.chrome, chromeEnv);
    return { drainCenter, canSpot: cabinet.canSpot };
  }

  function update(dt) {
    time += dt;
    lighting.update(dt);
    const bulbLevel = lighting.bulbLight.intensity / bulbBase;
    const spillLevel = lighting.spill.intensity / spillBase;
    if (materials) materials.update(dt, time, water?.isRunning() ? 1 : 0, WALL_WETTING_TIME);
    water?.update(dt, bulbLevel);
    curtain?.update(spillLevel);
    if (room) room.fixtureGlass.emissiveIntensity = 2.2 * spillLevel;
  }

  return {
    lighting,
    chromeEnv,
    dressLevel,
    update,
    setWaterRunning: (running) => water?.setRunning(running),
    reset: () => water?.reset(),
    getMaterials: () => materials,
  };
}
