import { HOLD_TIME, DECAY_RATE, LOOK_DOWN_ANGLE, INCLUDE_TOWEL_STEP } from './config.js';

// Special target: satisfied by pitching the camera down past LOOK_DOWN_ANGLE instead of looking at an object.
export const LOOK_DOWN = 'LOOK_DOWN';

// hint: the line under the step in the routine panel, telling a new player where to look.
const BOTH_HANDS = 'Both hands: the can drops. Spray to bring it back up';
export const STEPS = [
  { label: 'Grab the Raid', target: 'RaidCan', hands: 1, grabsCan: true, hint: 'Find the can outside the curtain. Keep the dot on it' },
  { label: 'Turn on the water', target: 'BathTubHandleMiddle', hands: 1, startsWater: true, hint: 'Keep the dot on the middle faucet handle' },
  { label: 'Wet your hair', target: 'BathTubShowerHead', hands: 2, hint: `Look up at the showerhead. ${BOTH_HANDS}` },
  { label: 'Grab the shampoo', target: 'Shelf', hands: 1, hint: 'Look at the shelf' },
  { label: 'Lather', target: LOOK_DOWN, hands: 2, hint: `Look down at your feet. ${BOTH_HANDS}` },
  { label: 'Rinse', target: 'BathTubShowerHead', hands: 1, hint: 'Look up at the showerhead' },
  { label: 'Grab the body wash', target: 'Shelf', hands: 1, hint: 'Look at the shelf' },
  { label: 'Final rinse', target: 'BathTubShowerHead', hands: 1, hint: 'Look up at the showerhead' },
  { label: 'Turn off the water', target: 'BathTubHandleMiddle', hands: 1, stopsWater: true, hint: 'Keep the dot on the middle faucet handle' },
  ...(INCLUDE_TOWEL_STEP ? [{ label: 'Grab the towel', target: 'Towel', hands: 1, hint: 'Look at the towel. Then you\'re free' }] : []),
];

/**
 * Shower routine gaze-hold logic. No DOM/UI code here — call update() each frame
 * and read getState() to draw whatever UI you like.
 */
export function createRoutine() {
  let stepIndex = 0;
  let progress = 0; // 0..1 for the current step
  let complete = false;
  let started = false;
  const listeners = { stepStart: [], stepProgress: [], stepComplete: [], routineComplete: [] };

  /** Subscribe to 'stepStart', 'stepProgress', 'stepComplete' or 'routineComplete'. Handlers get { index, step, progress }. */
  function on(eventName, handler) {
    listeners[eventName].push(handler);
  }

  function emit(eventName) {
    const payload = { index: stepIndex, step: STEPS[stepIndex], progress };
    for (const handler of listeners[eventName]) handler(payload);
  }

  function isLookingAtTarget(step, { targetName, pitchDegrees }) {
    if (step.target === LOOK_DOWN) return pitchDegrees < LOOK_DOWN_ANGLE;
    return targetName === step.target;
  }

  /**
   * @param {number} dt seconds since last frame
   * @param {{ targetName: string|null, pitchDegrees: number, handsFree: boolean }} gaze what the player
   *   is looking at, and whether the can is fully lowered
   */
  function update(dt, gaze) {
    if (complete) return;

    if (!started) {
      started = true;
      emit('stepStart');
    }

    const previousProgress = progress;
    const fillSpeed = 1 / HOLD_TIME;
    const step = STEPS[stepIndex];
    if (isLookingAtTarget(step, gaze) && (step.hands === 1 || gaze.handsFree)) {
      progress += fillSpeed * dt;
    } else {
      progress = Math.max(0, progress - fillSpeed * DECAY_RATE * dt);
    }

    if (progress !== previousProgress) emit('stepProgress');

    if (progress >= 1) completeCurrentStep();
  }

  function completeCurrentStep() {
    emit('stepComplete');
    if (stepIndex === STEPS.length - 1) {
      complete = true;
      emit('routineComplete');
      return;
    }
    stepIndex++;
    progress = 0;
    emit('stepStart');
  }

  /** Debug: finishes the current step immediately. */
  function skipStep() {
    if (complete) return;
    if (!started) {
      started = true;
      emit('stepStart');
    }
    progress = 1;
    completeCurrentStep();
  }

  function getState() {
    return {
      stepNumber: stepIndex + 1,
      stepsCompleted: complete ? STEPS.length : stepIndex,
      totalSteps: STEPS.length,
      label: STEPS[stepIndex].label,
      hands: STEPS[stepIndex].hands,
      hint: STEPS[stepIndex].hint ?? '',
      progress,
      complete,
    };
  }

  function reset() {
    stepIndex = 0;
    progress = 0;
    complete = false;
    started = false;
  }

  return { update, getState, on, reset, skipStep };
}
