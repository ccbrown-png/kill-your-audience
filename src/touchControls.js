import { TOUCH_LOOK_SENSITIVITY } from './config.js';

/**
 * Phone and tablet controls. Drag anywhere to look. Hold the SPRAY button to spray, and keep
 * dragging on it to aim while you spray, so the whole game works with one thumb. Look and spray
 * can also be two separate fingers. The pause button stands in for Esc.
 * Styles live in src/screens.css (#spray-button, #pause-button).
 */
export function createTouchControls({ canvas, player, spray, isPlaying, onPauseButton }) {
  const sprayButton = document.getElementById('spray-button');
  const pauseButton = document.getElementById('pause-button');

  // Every finger that is currently steering the view: pointerId -> last x/y.
  const lookFingers = new Map();
  let sprayFinger = null;

  // Keeps a finger's moves coming to this element even if it slides off. Never let a refusal
  // (the browser can throw if it has already dropped the touch) stop the control from working.
  function capture(element, pointerId) {
    try { element.setPointerCapture(pointerId); } catch { /* fine without it */ }
  }

  function startLook(event) {
    lookFingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }

  function moveLook(event) {
    const last = lookFingers.get(event.pointerId);
    if (!last) return;
    if (isPlaying()) player.addLook(event.clientX - last.x, event.clientY - last.y, TOUCH_LOOK_SENSITIVITY);
    last.x = event.clientX;
    last.y = event.clientY;
  }

  function endLook(event) {
    lookFingers.delete(event.pointerId);
    if (event.pointerId === sprayFinger) {
      sprayFinger = null;
      spray.setHeld(false);
      sprayButton.classList.remove('is-down');
    }
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (!isPlaying()) return;
    event.preventDefault(); // no fake mouse clicks after the touch
    capture(canvas, event.pointerId);
    startLook(event);
  });

  sprayButton.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isPlaying()) return;
    capture(sprayButton, event.pointerId);
    sprayFinger = event.pointerId;
    spray.setHeld(true);
    sprayButton.classList.add('is-down');
    startLook(event); // dragging the spray thumb aims too
  });

  for (const element of [canvas, sprayButton]) {
    element.addEventListener('pointermove', moveLook);
    element.addEventListener('pointerup', endLook);
    element.addEventListener('pointercancel', endLook);
    element.addEventListener('lostpointercapture', endLook);
  }
  sprayButton.addEventListener('contextmenu', (event) => event.preventDefault());

  pauseButton.addEventListener('click', (event) => {
    event.stopPropagation();
    if (isPlaying()) onPauseButton();
  });

  /** Lets go of everything, for when the game pauses or ends with fingers still down. */
  function release() {
    lookFingers.clear();
    sprayFinger = null;
    spray.setHeld(false);
    sprayButton.classList.remove('is-down');
  }

  return { release };
}
