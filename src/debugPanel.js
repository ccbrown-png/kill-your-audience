/**
 * Backtick toggles the panel. While playing: K kills all spiders, G toggles god mode (no losing),
 * N skips to the next step, T spawns a spider in front of the camera.
 */
export function createDebugPanel({ isPlaying, killAll, skipStep, spawnInFront, readState }) {
  const panel = document.getElementById('debug-panel');
  let godMode = false;
  let smoothedFps = 60;

  document.addEventListener('keydown', (event) => {
    if (event.code === 'Backquote') {
      panel.hidden = !panel.hidden;
      return;
    }
    if (!isPlaying() || event.repeat) return;
    if (event.code === 'KeyK') killAll();
    else if (event.code === 'KeyG') godMode = !godMode;
    else if (event.code === 'KeyN') skipStep();
    else if (event.code === 'KeyT') spawnInFront();
  });

  /** @param {number} realDt seconds since the last frame, uncapped */
  function update(realDt) {
    if (realDt > 0) smoothedFps += (1 / realDt - smoothedFps) * 0.05;
    if (panel.hidden) return;

    const { threat, step, ammo, spiders } = readState();
    const spiderLines = spiders.length > 0
      ? spiders.map((s) => `  ${s.name}: stage ${s.stage}`).join('\n')
      : '  none';
    panel.textContent = [
      `FPS: ${Math.round(smoothedFps)}`,
      `Threat: ${Math.round(threat * 100)}`,
      `Step: ${step}`,
      `Ammo: ${Math.round(ammo * 100)}%`,
      `God mode: ${godMode ? 'ON' : 'off'}`,
      `Spiders (${spiders.length}):`,
      spiderLines,
      '',
      'K kill all   G god   N next step   T spawn',
    ].join('\n');
  }

  return { update, isGodMode: () => godMode };
}
