import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createArtDirector } from './artDirector.js';
import { createPostProcessing } from './postFx.js';
import { createAtmosphere } from '../atmosphere.js';

/*
 * GALLERY MODE: open the game with ?gallery=NAME to look at one piece of art on a slow
 * turntable, inside the real bathroom with the real game lighting. Names:
 *   shower, cabinet, can, spider, hand, feet
 * Drag with the mouse to spin it yourself; it carries on turning when you let go.
 * Add &pose=NAME for a hand pose (relaxed, reach, gripCan, spray, lather, rinse, towel, reachOut),
 * and &angle=DEGREES to freeze the turntable at one angle.
 */

const params = new URLSearchParams(location.search);
const assetName = params.get('gallery');
let fixedAngle = params.has('angle') ? THREE.MathUtils.degToRad(Number(params.get('angle'))) : null;

document.body.classList.add('gallery');
const label = document.createElement('div');
label.id = 'gallery-label';
label.textContent = `GALLERY: ${assetName}  (drag to turn)`;
document.body.appendChild(label);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 50);
scene.add(camera);

const art = createArtDirector(renderer, scene);
createAtmosphere(scene, art.lighting.flickerLights); // same fog as the game, no flicker updates
const post = createPostProcessing(renderer, scene, camera);

// Where small assets stand for their turntable: in the middle of the stall, in front of the shelf.
const STAGE = new THREE.Vector3(-0.39, 1.22, -1.12);

/*
 * Each entry builds its asset and says how to frame it. `spin(angle)` turns it; `update(dt)`
 * animates it. Entries for assets from later phases are added as those assets exist.
 */
const ENTRIES = {
  async shower() {
    // A slow look around the stall from where the player stands, with the water running.
    const spawn = new THREE.Vector3(-0.386, 1.7, -0.688);
    art.setWaterRunning(true);
    for (let i = 0; i < 400; i++) art.update(1 / 30); // let the water and steam build up first
    return {
      spin(angle) {
        camera.fov = 70;
        camera.position.copy(spawn);
        const yaw = Math.sin(angle) * 1.6;
        const pitch = -0.32 + Math.cos(angle * 2) * 0.18;
        camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
      },
    };
  },
};

async function loadExtraEntries() {
  // Later phases register their assets here (see the bottom of this file).
  for (const register of extraRegistrations) Object.assign(ENTRIES, await register({ THREE, scene, camera, art, STAGE, renderer }));
}
const extraRegistrations = [];
export const registerGalleryEntries = (fn) => extraRegistrations.push(fn);

/** Default framing for a small asset on the stage: camera in front, slightly above. */
export function stageFraming(object, distance = 0.45, height = 0.12) {
  return {
    spin(angle) {
      object.rotation.y = angle;
      camera.position.set(STAGE.x, STAGE.y + height, STAGE.z + distance);
      camera.lookAt(STAGE);
    },
  };
}

let entry = null;
let angle = 0;
let dragging = false;
let lastX = 0;
renderer.domElement.addEventListener('pointerdown', (e) => {
  dragging = true;
  lastX = e.clientX;
});
window.addEventListener('pointerup', () => { dragging = false; });
window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  angle += (e.clientX - lastX) * 0.01;
  lastX = e.clientX;
});

window.__gallery = {
  ready: false,
  /** Freezes the turntable at an angle (used by the screenshot scripts). */
  setAngle: (degrees) => { angle = fixedAngle = THREE.MathUtils.degToRad(degrees); },
  art,
  scene,
  camera,
  getEntry: () => entry,
};

new GLTFLoader().load('/models/bathtub.glb', async (gltf) => {
  scene.add(gltf.scene);
  art.dressLevel(gltf.scene);
  window.__gallery.level = gltf.scene;
  await import('./galleryEntries.js');
  await loadExtraEntries();
  const make = ENTRIES[assetName];
  if (!make) {
    label.textContent = `Unknown gallery asset "${assetName}". Try: ${Object.keys(ENTRIES).join(', ')}`;
    return;
  }
  entry = await make(params);
  if (fixedAngle !== null) angle = fixedAngle;
  window.__gallery.ready = true;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);
});

let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (entry) {
    if (!dragging && fixedAngle === null) angle += dt * 0.3;
    entry.spin(angle);
    entry.update?.(dt);
    camera.updateProjectionMatrix();
  }
  art.update(dt);
  post.render();
});
