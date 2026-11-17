/**
 * Placeholder UI for the shower routine. Only reads routine state — restyle freely.
 * Styles live in index.html (#routine-panel).
 */
export function createRoutineUI() {
  const panel = document.getElementById('routine-panel');
  const label = document.getElementById('routine-label');
  const fill = document.getElementById('routine-fill');

  function render(state) {
    panel.hidden = state.complete;
    if (state.complete) return;
    const handsNote = state.hands === 2 ? ' (both hands)' : '';
    label.textContent = `Step ${state.stepNumber}/${state.totalSteps}: ${state.label}${handsNote}`;
    fill.style.width = `${state.progress * 100}%`;
  }

  return { render };
}
