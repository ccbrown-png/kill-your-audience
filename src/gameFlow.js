/**
 * Which screen the game is on: loading -> title -> playing <-> paused, then playing -> ended -> playing.
 * Browsers release the mouse when Esc is pressed, so losing the mouse is what triggers a pause.
 */
export function createGameFlow(domElement, { onPause, onRestart, onUserClick }) {
  const titleScreen = document.getElementById('title-screen');
  const startButton = document.getElementById('start-button');
  const pauseScreen = document.getElementById('pause-screen');
  const pauseHint = document.getElementById('pause-hint');
  const resumeButton = document.getElementById('resume-button');
  const restartButton = document.getElementById('restart-button');
  const homeButton = document.getElementById('home-button');
  const endButton = document.getElementById('end-button');
  const DEFAULT_PAUSE_HINT = pauseHint.textContent;

  setUpFullscreenButton();

  let state = 'loading';

  const isLocked = () => document.pointerLockElement === domElement;

  // Clicking to play only grabs the mouse; the game stays at whatever size it is embedded at.
  // Fullscreen is opt-in through the corner icon (see setUpFullscreenButton).
  function lockMouse() {
    onUserClick();
    // Newer browsers return a promise. Failures are handled by the pointerlockerror listener.
    domElement.requestPointerLock()?.catch?.(() => {});
  }

  function setPlaying(playing) {
    document.body.classList.toggle('playing', playing);
  }

  startButton.addEventListener('click', () => {
    if (state === 'title') lockMouse();
  });
  // Pause menu. Resume and Start Over grab the mouse again; Home goes back to the title, reset for a fresh run.
  resumeButton.addEventListener('click', () => {
    if (state === 'paused') lockMouse();
  });
  restartButton.addEventListener('click', () => {
    if (state !== 'paused') return;
    onRestart();
    lockMouse();
  });
  homeButton.addEventListener('click', () => {
    if (state !== 'paused') return;
    onRestart();
    state = 'title';
    pauseScreen.hidden = true;
    pauseHint.textContent = DEFAULT_PAUSE_HINT;
    titleScreen.hidden = false;
    startButton.focus({ preventScroll: true });
  });
  // Esc again while paused resumes. Browsers may refuse to lock the mouse from a key press
  // (and for about a second after Esc); the pointerlockerror handler then asks for a click.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state === 'paused' && !event.repeat) lockMouse();
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
      setPlaying(true);
    } else {
      setPlaying(false);
      if (state === 'playing') {
        state = 'paused';
        pauseScreen.hidden = false;
        resumeButton.focus({ preventScroll: true }); // so Enter resumes if the browser refuses Esc
        onPause();
      }
    }
  });

  // Chrome refuses to re-grab the mouse for about a second after Esc.
  document.addEventListener('pointerlockerror', () => {
    if (state === 'paused') pauseHint.textContent = 'CLICK RESUME (OR PRESS ENTER) TO KEEP SHOWERING';
  });

  function setReady() {
    state = 'title';
    startButton.disabled = false;
    startButton.textContent = 'START YOUR SHOWER';
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

/** Corner icon that toggles fullscreen. Hidden when the browser or the embedding iframe doesn't allow it. */
function setUpFullscreenButton() {
  const button = document.getElementById('fullscreen-button');
  const doc = document;
  const enabled = doc.fullscreenEnabled || doc.webkitFullscreenEnabled;
  if (!enabled) {
    button.hidden = true;
    return;
  }
  const current = () => doc.fullscreenElement || doc.webkitFullscreenElement;

  function sync() {
    const on = Boolean(current());
    button.classList.toggle('is-fullscreen', on);
    button.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Enter fullscreen');
    button.title = on ? 'Exit fullscreen' : 'Fullscreen';
  }

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const el = doc.documentElement;
    if (current()) {
      (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.())?.catch?.(() => {});
    } else {
      (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.())?.catch?.(() => {});
    }
    button.blur();
  });
  doc.addEventListener('fullscreenchange', sync);
  doc.addEventListener('webkitfullscreenchange', sync);
  sync();
}
