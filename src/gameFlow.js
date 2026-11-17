/**
 * Which screen the game is on: loading -> title -> playing <-> paused, then playing -> ended -> playing.
 * Browsers release the mouse when Esc is pressed, so losing the mouse is what triggers a pause.
 */
export function createGameFlow(domElement, { onPause, onRestart, onUserClick }) {
  const titleScreen = document.getElementById('title-screen');
  const startButton = document.getElementById('start-button');
  const pauseScreen = document.getElementById('pause-screen');
  const pauseHint = document.getElementById('pause-hint');
  const endButton = document.getElementById('end-button');
  const DEFAULT_PAUSE_HINT = pauseHint.textContent;

  let state = 'loading';

  const isLocked = () => document.pointerLockElement === domElement;

  // Mouse look in a small embedded box is rough, so inside an iframe the game goes fullscreen on click.
  // (The embedding <iframe> needs allow="fullscreen; pointer-lock" for this.)
  const embedded = window.self !== window.top;

  function grabPointer() {
    // Newer browsers return a promise. Failures are handled by the pointerlockerror listener.
    domElement.requestPointerLock()?.catch?.(() => {});
  }

  function lockMouse() {
    onUserClick();
    if (embedded && document.fullscreenEnabled && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(grabPointer, grabPointer);
    } else {
      grabPointer();
    }
  }

  /** Esc (or the end of a round) leaves fullscreen cleanly, back to the embedded box. */
  function leaveFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  startButton.addEventListener('click', () => {
    if (state === 'title') lockMouse();
  });
  pauseScreen.addEventListener('click', () => {
    if (state === 'paused') lockMouse();
  });
  endButton.addEventListener('click', () => {
    if (state === 'ended') lockMouse();
  });

  document.addEventListener('pointerlockchange', () => {
    if (isLocked()) {
      if (state === 'ended') onRestart();
      state = 'playing';
      titleScreen.hidden = true;
      pauseScreen.hidden = true;
      pauseHint.textContent = DEFAULT_PAUSE_HINT;
    } else if (state === 'playing') {
      state = 'paused';
      pauseScreen.hidden = false;
      onPause();
      leaveFullscreen();
    }
  });

  // Chrome refuses to re-grab the mouse for about a second after Esc.
  document.addEventListener('pointerlockerror', () => {
    if (state === 'paused') pauseHint.textContent = 'ONE SECOND... CLICK AGAIN';
  });

  function setReady() {
    state = 'title';
    startButton.disabled = false;
    startButton.textContent = 'CLICK TO SHOWER';
  }

  function setLoadFailed() {
    startButton.textContent = 'THE BATHROOM FAILED TO LOAD';
  }

  /** Stops play and frees the mouse so the end screen's button can be clicked. */
  function end() {
    state = 'ended';
    document.exitPointerLock();
  }

  return { setReady, setLoadFailed, end, isPlaying: () => state === 'playing' };
}
