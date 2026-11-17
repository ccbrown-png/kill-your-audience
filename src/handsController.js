import * as THREE from 'three';
import { GAP_POINT, curveThrough } from './art/raidCan.js';
import { CAN_GRIP } from './art/hands.js';
import { HAND_GRIP_TIME, HAND_SCRUB_AMOUNT, HAND_SCRUB_SPEED, HAND_POSES } from './config.js';

/*
 * Decides which pose each hand should be in, from the routine's events and the can's state.
 *
 * Left hand: rests low, reaches toward whatever you're gaze-holding (open hand for handles and
 * the shelf, palm-up cup under the showerhead for the rinse steps, a grabbing hand for the
 * towel), closes for a moment when a step completes, and scrubs your head on two-hand steps.
 * Right hand: reaches out through the curtain for the can, then holds it (index finger on the
 * button while spraying), and joins the left hand on your head when the can is lowered.
 */
export function createHandsController(routine, hands, can = null, camera = null) {
  let step = null;
  let lastProgress = 0;
  let holding = false; // true while the current step is actually filling
  let gripLeft = 0; // seconds left of the closed hand after finishing a step
  let time = 0;
  let rightInWorld = false;

  const canLocal = new THREE.Vector3();
  const reachPosition = new THREE.Vector3();
  const restPosition = new THREE.Vector3();
  const reachRotation = new THREE.Quaternion();
  const restRotation = new THREE.Quaternion();
  const gapLocal = new THREE.Vector3();
  const gripPosition = new THREE.Vector3();
  const gripRotation = new THREE.Quaternion();
  // Palm turned toward the can as it closes round it.
  const graspRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, 1.4, 0.1));

  routine.on('stepStart', ({ step: nextStep }) => {
    step = nextStep;
    lastProgress = 0;
    holding = false;
  });
  routine.on('stepProgress', ({ progress }) => {
    holding = progress > lastProgress;
    lastProgress = progress;
  });
  routine.on('stepComplete', () => {
    gripLeft = HAND_GRIP_TIME;
  });

  /** What the left hand does while you gaze-hold the current step. */
  function leftReachFor(currentStep) {
    if (currentStep?.target === 'BathTubShowerHead' && /rinse/i.test(currentStep.label)) return ['leftRinse', 'rinse'];
    if (currentStep?.target === 'Towel') return ['leftTowel', 'reach'];
    return ['leftReach', 'reach'];
  }

  function setRightWorld(inWorld) {
    if (inWorld === rightInWorld) return;
    rightInWorld = inWorld;
    hands.setRightInWorld?.(inWorld);
  }

  /** @param {{ canInHand: boolean, lowered: number, spraying?: boolean }} can lowered: 0 = raised, 1 = out of view */
  function update(dt, { canInHand, lowered, spraying = false }) {
    time += dt;
    gripLeft = Math.max(0, gripLeft - dt);

    const handsOnHead = step?.hands === 2 && lowered >= 1;
    const scrub = handsOnHead && holding ? Math.sin(time * HAND_SCRUB_SPEED) * HAND_SCRUB_AMOUNT : 0;

    if (handsOnHead) hands.setLeft('leftHead', 'lather', scrub);
    else if (gripLeft > 0) hands.setLeft(leftReachFor(step)[0], step?.target === 'Towel' ? 'towel' : 'grip');
    else if (holding) hands.setLeft(...leftReachFor(step));
    else hands.setLeft('leftRest', 'relaxed');

    const canPhase = can?.getPhase();
    if (camera && (canPhase === 'reaching' || canPhase === 'pulling')) {
      // Grabbing the can: the right hand goes out through the curtain gap to wherever the can is
      // (worked out in camera space every frame), then rides back in with it. While it's out
      // there it's part of the world, so the curtain hides it properly.
      setRightWorld(true);
      can.getWorldPosition(canLocal);
      camera.worldToLocal(canLocal);
      if (canPhase === 'reaching') {
        const t = THREE.MathUtils.smootherstep(Math.min(1, can.getPhaseProgress()), 0, 1);
        restPosition.fromArray(HAND_POSES.rightRest.position);
        restRotation.setFromEuler(new THREE.Euler(...HAND_POSES.rightRest.rotation));
        gapLocal.copy(GAP_POINT);
        camera.worldToLocal(gapLocal);
        curveThrough(restPosition, gapLocal, canLocal, t, reachPosition);
        reachRotation.slerpQuaternions(restRotation, graspRotation, t);
        hands.setRightTarget(reachPosition, reachRotation, t > 0.85 ? 'gripCan' : 'reachOut');
      } else {
        hands.setRightTarget(canLocal, graspRotation, 'gripCan');
      }
    } else if (handsOnHead) {
      setRightWorld(false);
      hands.setRight('rightHead', 'lather', 0, -scrub);
    } else if (canInHand && can?.root) {
      // Holding the can: the hand sits on the can, wherever the can is (it sways, lowers, shakes).
      setRightWorld(false);
      gripPosition.copy(CAN_GRIP.position).applyQuaternion(can.root.quaternion).add(can.root.position);
      gripRotation.copy(can.root.quaternion).multiply(CAN_GRIP.quaternion);
      hands.setRightTarget(gripPosition, gripRotation, spraying ? 'spray' : 'gripCan', true);
    } else {
      setRightWorld(false);
      hands.setRight('rightRest', 'relaxed');
    }

    hands.update(dt);
  }

  function reset() {
    step = null;
    lastProgress = 0;
    holding = false;
    gripLeft = 0;
    setRightWorld(false);
    hands.setLeft('leftRest', 'relaxed');
    hands.setRight('rightRest', 'relaxed');
    hands.snap();
    hands.setVisible(true);
  }

  reset();
  return { update, reset };
}
