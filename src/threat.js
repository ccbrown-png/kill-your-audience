import { THREAT_MAX, THREAT_RATE_BASE, THREAT_RATE_PER_STAGE, THREAT_DECAY } from './config.js';

/** The 0 to THREAT_MAX dread meter. Later-stage spiders push it up faster. */
export function createThreat() {
  let value = 0;

  function update(dt, livingSpiders) {
    if (livingSpiders.length === 0) {
      value = Math.max(0, value - THREAT_DECAY * dt);
      return;
    }
    for (const spider of livingSpiders) {
      value += (THREAT_RATE_BASE + THREAT_RATE_PER_STAGE * spider.stage) * dt;
    }
    value = Math.min(THREAT_MAX, value);
  }

  return {
    update,
    getFraction: () => value / THREAT_MAX,
    isFull: () => value >= THREAT_MAX,
    reset: () => { value = 0; },
  };
}
