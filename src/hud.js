/** Placeholder HUD. Styles live in index.html (#kill-counter, #threat-bar). */
export function createHud() {
  const killCounter = document.getElementById('kill-counter');
  const threatBar = document.getElementById('threat-bar');
  let kills = 0;

  function showKills() {
    killCounter.textContent = `KILLS: ${kills}`;
  }

  function addKill() {
    kills++;
    showKills();
  }

  /** @param {number} fraction 0 to 1. Grows from the center and gets more solid as it fills. */
  function setThreat(fraction) {
    threatBar.style.width = `${fraction * 100}%`;
    threatBar.style.opacity = 0.25 + fraction * 0.75;
  }

  function reset() {
    kills = 0;
    showKills();
    setThreat(0);
  }

  return { addKill, getKills: () => kills, setThreat, reset };
}
