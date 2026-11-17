import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { suspendAudio, syncListener, unlockAudio } from './audio.js';
import { createAtmosphere } from './atmosphere.js';
import { createDecoys } from './decoys.js';
import { createEndScreen } from './endScreen.js';
import { createEndings } from './endings.js';
import { createGameFlow } from './gameFlow.js';
import { createHud } from './hud.js';
import { createDebugPanel } from './debugPanel.js';
import { createHandsController } from './handsController.js';
import { createFeet } from './placeholders/feet.js';
import { createHands, prebuildHandPosesInBackground } from './art/hands.js';
import { createHeartbeat } from './placeholders/heartbeat.js';
import { createPostProcessing } from './art/postFx.js';
import { createArtDirector } from './art/artDirector.js';
import { createRaidCan } from './art/raidCan.js';
import { createSkitterSound } from './placeholders/skitterSound.js';
import { createSprayHiss } from './placeholders/sprayHiss.js';
import { createSprayParticles } from './placeholders/sprayParticles.js';
import { createSprayRattle } from './placeholders/sprayRattle.js';
import { createSting } from './placeholders/sting.js';
import { createWaterLoop } from './placeholders/waterLoop.js';
import { createPlayer } from './player.js';
import { createCrosshairRaycaster } from './raycast.js';
import { createRoutine } from './routine.js';
import { createRoutineUI } from './routineUI.js';
import { collectSpawnPoints, fallbackPoint } from './spawnPoints.js';
import { buildSpiderPaths } from './spiderPaths.js';
import { createSpiders } from './spiders.js';
import { createSpray } from './spray.js';
import { createThreat } from './threat.js';

// --- Renderer, scene, camera ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 100);
scene.add(camera); // the camera has to be in the scene for the can attached to it to render

// --- Lights, reflections and all the art (src/art/) ---
const art = createArtDirector(renderer, scene);

// --- Systems ---
const player = createPlayer(camera, renderer.domElement);
const crosshair = createCrosshairRaycaster(camera);
const debugLabel = document.getElementById('debug-label');
const routine = createRoutine();
const routineUI = createRoutineUI();
const hud = createHud();
const threat = createThreat();
const atmosphere = createAtmosphere(scene, art.lighting.flickerLights);
const postProcessing = createPostProcessing(renderer, scene, camera);
const decoys = createDecoys(scene, camera);
const water = createWaterLoop();
const skitter = createSkitterSound();
const sting = createSting();
const heartbeat = createHeartbeat();
const endScreen = createEndScreen();
const spiders = createSpiders(scene, camera, {
  onKill: hud.addKill,
  onReachedPlayer: () => endGame('lose'),
  onSkitter: (position) => skitter.play(position),
  onLateSpawn: () => sting.play(),
  trySpawnDecoy: () => decoys.trySpawn(),
});

let level = null;
let playTime = 0; // seconds of actual play, not counting pauses

const flow = createGameFlow(renderer.domElement, {
  onUserClick: unlockAudio,
  onPause: () => {
    spray.release();
    suspendAudio();
  },
  onRestart: restartGame,
});

const can = createRaidCan(camera, { chromeEnv: art.chromeEnv });
// Spiders only come once the can is actually in your hand, after the reach-and-pull.
can.setOnHeld(() => spiders.startSpawning());

const spray = createSpray({
  camera,
  crosshair,
  can,
  particles: createSprayParticles(scene),
  hiss: createSprayHiss(),
  rattle: createSprayRattle(),
  spiders,
  isPlaying: flow.isPlaying,
});

// Step 0 is "Grab the Raid": the can comes to hand, and only then do spiders start.
routine.on('stepComplete', ({ step }) => {
  if (step.grabsCan) can.grab();
  if (step.startsWater) {
    water.start();
    art.setWaterRunning(true);
  }
  if (step.stopsWater) {
    water.stop();
    art.setWaterRunning(false);
  }
});

const hands = createHands(camera);
const handsController = createHandsController(routine, hands, can, camera);

const debug = createDebugPanel({
  isPlaying: flow.isPlaying,
  killAll: spiders.killAll,
  skipStep: routine.skipStep,
  spawnInFront,
  readState: () => {
    const state = routine.getState();
    return {
      threat: threat.getFraction(),
      step: `${state.stepNumber}/${state.totalSteps} ${state.label}`,
      ammo: spray.getAmmoFraction(),
      spiders: spiders.getLiving().map((s) => ({ name: s.point.name, stage: s.stage })),
    };
  },
});

/** Debug: puts a spider on whatever surface is under the crosshair, on its own approach path. */
function spawnInFront() {
  if (!level) return;
  const ahead = camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(4).add(camera.position);
  const point = fallbackPoint({ name: 'Debug', position: ahead.toArray() }, level, camera.position, new THREE.Raycaster());
  buildSpiderPaths([point], level, camera.position);
  spiders.spawnAt(point, 0);
}
routine.on('routineComplete', () => endGame('win'));

const endings = createEndings(camera, (result) => {
  const { stepsCompleted, totalSteps } = routine.getState();
  const stats = { kills: hud.getKills(), time: playTime, stepsCompleted, totalSteps, sprayRemaining: spray.getAmmoFraction() };
  if (result === 'lose') {
    water.stop();
    endScreen.showLose(stats);
  } else {
    endScreen.showWin(stats);
  }
});

/** Stops play and starts the lose or win sequence. Only the first call in a run counts. */
function endGame(result) {
  if (!flow.isPlaying()) return;
  if (result === 'lose' && debug.isGodMode()) return;
  flow.end();
  spray.stop();
  can.setVisible(false);
  hands.setVisible(false);
  spiders.setFrozen(true);
  document.body.classList.add('ended');
  if (result === 'lose') {
    endings.startLose(spiders.getNearest(camera.position)?.hitSphere.center ?? null);
  } else {
    water.stop(); // the win is the water cutting out, then silence
    endings.startWin();
  }
}

/** Puts everything back to the start of a run, without reloading the page. */
function restartGame() {
  endings.reset();
  endScreen.hide();
  document.body.classList.remove('ended');
  routine.reset();
  spiders.reset();
  decoys.reset();
  threat.reset();
  atmosphere.reset();
  water.stop();
  art.reset();
  heartbeat.reset();
  hud.reset();
  spray.reset();
  can.returnToShelf();
  handsController.reset();
  player.placeAtSpawn(level);
  playTime = 0;
}

// --- Load the Blender scene ---
new GLTFLoader().load(
  '/models/bathtub.glb',
  (gltf) => {
    scene.add(gltf.scene);

    console.log('Objects in bathtub.glb:');
    gltf.scene.traverse((obj) => console.log(`  ${obj.name || '(unnamed)'}  [${obj.type}]`));

    for (const name of ['PlayerSpawn', 'PlayerLookAt', 'Shelf', 'Drain']) {
      if (gltf.scene.getObjectByName(name)) console.log(`✅ Found ${name}`);
      else console.warn(`❌ Missing ${name}`);
    }

    level = gltf.scene;
    const { canSpot } = art.dressLevel(level);
    player.placeAtSpawn(level);
    crosshair.setLevel(level);
    decoys.setLevel(level);
    const spawnPoints = collectSpawnPoints(level, camera.position);
    buildSpiderPaths(spawnPoints, level, camera.position);
    spiders.setSpawnPoints(spawnPoints);
    can.placeOnCabinet(level, canSpot, camera.position);
    createFeet(scene, level, camera.position, camera.getWorldDirection(new THREE.Vector3()));
    prebuildHandPosesInBackground();
    flow.setReady();
  },
  undefined,
  (error) => {
    console.error('Failed to load /models/bathtub.glb', error);
    flow.setLoadFailed();
  },
);

// --- Resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postProcessing.setSize(window.innerWidth, window.innerHeight);
});

// --- Main loop ---
let lastTargetName = null;
let lastTime = performance.now();

renderer.setAnimationLoop(() => {
  const now = performance.now();
  // Seconds since last frame, capped so switching tabs doesn't cause a huge jump.
  const realDt = (now - lastTime) / 1000;
  const dt = Math.min(realDt, 0.1);
  lastTime = now;

  const target = crosshair.update();
  const name = target ? target.name : null;
  if (name !== lastTargetName) {
    debugLabel.textContent = `Target: ${name ?? 'none'}`;
    lastTargetName = name;
  }

  // Everything that moves or counts down lives in here, so pausing freezes all of it.
  // Each stage re-checks, because the one before it can end the game.
  if (flow.isPlaying()) {
    playTime += dt;
    routine.update(dt, { targetName: name, pitchDegrees: player.getPitchDegrees(), handsFree: spray.areHandsFree() });
  }
  if (flow.isPlaying()) {
    const { stepsCompleted, totalSteps } = routine.getState();
    spiders.setEscalation(Math.min(stepsCompleted / (totalSteps - 1), 1));
    spiders.update(dt);
  }
  if (flow.isPlaying()) {
    spray.update(dt, { twoHandStep: routine.getState().hands === 2 });
    handsController.update(dt, { canInHand: can.isInHand(), lowered: spray.getLowered(), spraying: spray.isTriggerDown() });
    threat.update(dt, spiders.getLiving());
    hud.setThreat(threat.getFraction());
    decoys.update(dt, crosshair);
    atmosphere.update(dt, threat.getFraction());
    heartbeat.update(dt, threat.getFraction());
    if (threat.isFull()) endGame('lose');
  }
  if (flow.isPlaying() || endings.isRunning()) art.update(dt);
  if (endings.isRunning()) {
    spiders.update(dt);
    if (endings.isLosing()) heartbeat.update(dt, threat.getFraction());
    endings.update(dt);
  }
  syncListener(camera);
  debug.update(realDt);
  routineUI.render(routine.getState());

  postProcessing.render();
});

// --- Test hook: headless screenshot and playthrough scripts drive the game through this. ---
// Only exists when the page URL has ?test in it, so players never see it.
if (new URLSearchParams(location.search).has('test')) {
  window.__raid = {
    THREE, scene, camera, renderer, player, routine, spiders, can, spray, flow, hands, handsController,
    threat, hud, atmosphere, endGame, spawnInFront, art, postProcessing,
    getLevel: () => level,
  };
}
