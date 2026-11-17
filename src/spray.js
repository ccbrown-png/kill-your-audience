import * as THREE from 'three';
import {
  RAISE_TIME,
  CAN_LOWER_TIME,
  SPRAY_MAX,
  SPRAY_SPUTTER_PUFF_TIME,
  SPRAY_SPUTTER_GAP_MIN,
  SPRAY_SPUTTER_GAP_MAX,
  SPRAY_SPUTTER_RANGE,
  SPRAY_SPUTTER_DENSITY,
} from './config.js';

// If the crosshair isn't on any surface, aim the spray at a point this far ahead, in meters.
const DEFAULT_AIM_DISTANCE = 2;

/** Connects the mouse button to the can, ammo, particles, sounds and spider damage. */
export function createSpray({ camera, crosshair, can, particles, hiss, rattle, spiders, isPlaying }) {
  let held = false;
  let raised = 1; // 0 = can lowered out of view, 1 = up and ready
  let ammo = SPRAY_MAX; // seconds of spray left
  let nextPuff = 0; // seconds until the next empty-can puff
  let puffLeft = 0; // seconds left in the current puff
  let triggerDown = false; // true while the mouse is pressing the button on a raised can (for the hand pose)

  const nozzle = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const aimPoint = new THREE.Vector3();

  document.addEventListener('mousedown', (event) => {
    if (event.button === 0 && isPlaying()) held = true;
  });
  document.addEventListener('mouseup', (event) => {
    if (event.button === 0) held = false;
  });

  /** The touch SPRAY button presses and releases the trigger through this. */
  function setHeld(value) {
    held = value && isPlaying();
  }

  /** Stops spraying immediately, for when the game pauses with the button still down. */
  function release() {
    held = false;
    hiss.setActive(false);
  }

  function aimFromNozzle() {
    can.getNozzleWorldPosition(nozzle);
    camera.getWorldDirection(forward);
    const distance = crosshair.getHitDistance() ?? DEFAULT_AIM_DISTANCE;
    aimPoint.copy(camera.position).addScaledVector(forward, distance);
  }

  function sprayFully(dt) {
    aimFromNozzle();
    particles.emit(dt, nozzle, aimPoint);
    ammo = Math.max(0, ammo - dt);
    can.setAmmo(ammo / SPRAY_MAX);

    const spider = crosshair.findUnderCrosshair(spiders.getLiving());
    if (spider) spiders.applySpray(spider, dt);
  }

  /** Empty can: every so often a rattle and a short, weak, harmless puff. */
  function sputter(dt) {
    nextPuff -= dt;
    if (nextPuff <= 0) {
      nextPuff = THREE.MathUtils.randFloat(SPRAY_SPUTTER_GAP_MIN, SPRAY_SPUTTER_GAP_MAX);
      puffLeft = SPRAY_SPUTTER_PUFF_TIME;
      rattle.play();
    }
    if (puffLeft > 0) {
      puffLeft -= dt;
      aimFromNozzle();
      aimPoint.copy(nozzle).addScaledVector(aimPoint.sub(nozzle).normalize(), SPRAY_SPUTTER_RANGE);
      particles.emit(dt, nozzle, aimPoint, SPRAY_SPUTTER_DENSITY);
    }
  }

  /** @param {{ twoHandStep: boolean }} options whether the current routine step needs both hands */
  function update(dt, { twoHandStep }) {
    // On a two-hand step the can stays down unless the mouse is held.
    if (!twoHandStep || held) raised = Math.min(1, raised + dt / RAISE_TIME);
    else raised = Math.max(0, raised - dt / CAN_LOWER_TIME);

    const triggerPulled = held && raised >= 1 && can.isInHand();
    triggerDown = triggerPulled;
    const spraying = triggerPulled && ammo > 0;

    can.update(dt, spraying, 1 - raised);
    hiss.setActive(spraying);

    if (spraying) sprayFully(dt);
    else if (triggerPulled) sputter(dt);

    particles.update(dt);
  }

  /** Stops spraying and clears spray in the air. Ammo is kept, because the end screen reports it. */
  function stop() {
    release();
    particles.reset();
  }

  /** Back to a full can, for a new run. */
  function reset() {
    stop();
    raised = 1;
    ammo = SPRAY_MAX;
    nextPuff = 0;
    puffLeft = 0;
    can.setAmmo(1);
  }

  return {
    update,
    release,
    setHeld,
    stop,
    reset,
    areHandsFree: () => raised <= 0,
    getLowered: () => 1 - raised,
    getAmmoFraction: () => ammo / SPRAY_MAX,
    /** True while the finger is on the button (spraying or sputtering), for the hand pose. */
    isTriggerDown: () => triggerDown,
  };
}
