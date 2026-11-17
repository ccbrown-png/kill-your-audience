/**
 * The generative-AI heads-up shown before anything else. "I'll allow it" reveals the title
 * screen; "Shield my eyes" swaps to a polite goodbye (with a way back, in case of curiosity).
 * Markup is #ai-warning in index.html; styles are in src/screens.css.
 */
export function setUpAiWarning() {
  const screen = document.getElementById('ai-warning');
  const enter = document.getElementById('ai-enter');
  const leave = document.getElementById('ai-leave');
  const back = document.getElementById('ai-back');

  enter.addEventListener('click', () => {
    screen.hidden = true;
    document.getElementById('start-button').focus({ preventScroll: true });
  });
  leave.addEventListener('click', () => {
    screen.dataset.state = 'shielded';
    back.focus({ preventScroll: true });
  });
  back.addEventListener('click', () => {
    delete screen.dataset.state;
    enter.focus({ preventScroll: true });
  });
}

/** Test and gallery pages skip the warning. */
export function hideAiWarning() {
  document.getElementById('ai-warning').hidden = true;
}
