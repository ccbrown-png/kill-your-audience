import { RANKS } from './config.js';

// The lose and win screens. Styles live in src/screens.css (#end-screen[data-result=...]).

function formatTime(seconds) {
  const whole = Math.floor(seconds);
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

function rankFor(kills, time) {
  return RANKS.find((rank) => kills >= rank.minKills && time <= rank.maxTime).name;
}

/** A typed case-file field: bold label, plain value. */
function field(label, value) {
  const strong = document.createElement('span');
  strong.className = 'field-label';
  strong.textContent = `${label}: `;
  return [strong, document.createTextNode(value)];
}

export function createEndScreen() {
  const screen = document.getElementById('end-screen');
  const title = document.getElementById('end-title');
  const stats = document.getElementById('end-stats');
  const rankLine = document.getElementById('end-rank');
  const button = document.getElementById('end-button');

  function fillStats(rows) {
    stats.replaceChildren(...rows.map(([label, value]) => {
      const line = document.createElement('p');
      line.append(...field(label, value));
      return line;
    }));
  }

  function showLose() {
    screen.dataset.result = 'lose';
    title.textContent = 'THEY WERE WATCHING YOU.';
    fillStats([]);
    rankLine.hidden = true;
    button.textContent = 'TRY AGAIN';
    screen.hidden = false;
  }

  function showWin({ kills, time }) {
    screen.dataset.result = 'win';
    title.textContent = 'CASE CLOSED';
    fillStats([['STALKERS ELIMINATED', String(kills)], ['TIME', formatTime(time)]]);
    rankLine.replaceChildren(...field('RANK', rankFor(kills, time)));
    rankLine.hidden = false;
    button.textContent = 'SHOWER AGAIN';
    screen.hidden = false;
  }

  return { showLose, showWin, hide: () => { screen.hidden = true; } };
}
