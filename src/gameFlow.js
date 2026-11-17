import { IS_TOUCH } from './input.js';

/**
 * Which screen the game is on: loading -> title -> (how to play) -> playing <-> paused, then
 * playing -> ended -> playing.
 * With a mouse, browsers release the mouse when Esc is pressed, so losing the mouse is what
 * triggers a pause. On touch screens there's no mouse to lock: play starts straight away and the
 * on-screen pause button (or leaving the tab) pauses.
 */
export function createGameFlow(domElement, { onPause, onRestart, onUserClick }) {
  const titleScreen = document.getElementById('title-screen');
  const startButton = document.getElementById('start-button');
  const howtoScreen = document.getElementById('howto-screen');
  const howtoButton = document.getElementById('howto-button');
  const pauseScreen = document.getElementById('pause-screen');
  const pauseHint = document.getElementById('pause-hint');
  const resumeButton = document.getElementById('resume-button');
  const howtoMenuButton = document.getElementById('howto-menu-button');
  const restartButton = document.getElementById('restart-button');
  const homeButton = document.getElementById('home-button');
  const endButton = document.getElementById('end-button');
  const DEFAULT_PAUSE_HINT = IS_TOUCH ? '' : pauseHint.textContent;
  pauseHint.textContent = DEFAULT_PAUSE_HINT;

  setUpFullscreenButton();

  let state = 'loading';
  let seenHowTo = false; // the how-to screen shows before the first run of each visit

  const isLocked = () => document.pointerLockElement === domElement;

  // With a mouse, clicking to play only grabs the mouse; the game stays at whatever size it is
  // embedded at. Fullscreen is opt-in through the corner icon (see setUpFullscreenButton).
  function startPlaying() {
    onUserClick();
    if (IS_TOUCH) {
      enterPlaying();
      return;
    }
    // Newer browsers return a promise. Failures are handled by the pointerlockerror listener.
    domElement.requestPointerLock()?.catch?.(() => {});
  }

  function setPlaying(playing) {
    document.body.classList.toggle('playing', playing);
  }

  function enterPlaying() {
    if (state === 'ended') onRestart();
    state = 'playing';
    titleScreen.hidden = true;
    pauseScreen.hidden = true;
    howtoScreen.hidden = true;
    pauseHint.textContent = DEFAULT_PAUSE_HINT;
    setPlaying(true);
  }

  function pause() {
    setPlaying(false);
    if (state !== 'playing') return;
    state = 'paused';
    pauseScreen.hidden = false;
    resumeButton.focus({ preventScroll: true }); // so Enter resumes if the browser refuses Esc
    onPause();
  }

  function showHowTo() {
    seenHowTo = true;
    howtoScreen.hidden = false;
    howtoScreen.scrollTop = 0;
    howtoButton.focus({ preventScroll: true });
  }

  startButton.addEventListener('click', () => {
    if (state !== 'title') return;
    if (seenHowTo) startPlaying();
    else showHowTo();
  });
  howtoButton.addEventListener('click', () => {
    if (state === 'title' || state === 'paused') startPlaying();
    else howtoScreen.hidden = true;
  });
  // Pause menu. Resume and Start Over go straight back in; Home goes back to the title, reset for a fresh run.
  resumeButton.addEventListener('click', () => {
    if (state === 'paused') startPlaying();
  });
  howtoMenuButton.addEventListener('click', () => {
    if (state === 'paused') showHowTo();
  });
  restartButton.addEventListener('click', () => {
    if (state !== 'paused') return;
    onRestart();
    startPlaying();
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
    if (event.key === 'Escape' && state === 'paused' && !event.repeat) startPlaying();
  });
  endButton.addEventListener('click', () => {
    if (state === 'ended') startPlaying();
  });

  document.addEventListener('pointerlockchange', () => {
    if (IS_TOUCH) return;
    if (isLocked()) enterPlaying();
    else pause();
  });

  // Chrome refuses to re-grab the mouse for about a second after Esc.
  document.addEventListener('pointerlockerror', () => {
    if (state === 'paused') pauseHint.textContent = 'CLICK RESUME (OR PRESS ENTER) TO KEEP SHOWERING';
  });

  // Phones: switching apps, locking the screen or a phone call pauses the game.
  document.addEventListener('visibilitychange', () => {
    if (IS_TOUCH && document.hidden) pause();
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
    if (IS_TOUCH) setPlaying(false);
    else document.exitPointerLock();
  }

  return { setReady, setLoadFailed, end, pause, isPlaying: () => state === 'playing' };
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
