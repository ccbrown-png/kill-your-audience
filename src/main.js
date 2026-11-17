// Entry point. The AI heads-up shows first while the game loads behind it.
import './input.js'; // marks touch screens with body.touch before anything draws
import { hideAiWarning, setUpAiWarning } from './aiWarning.js';

const params = new URLSearchParams(location.search);

if (params.has('gallery')) {
  // ?gallery=NAME shows one piece of art on a turntable instead of the game (see src/art/gallery.js).
  hideAiWarning();
  import('./art/gallery.js');
} else {
  // ?test (automated playthroughs) goes straight to the title.
  if (params.has('test')) hideAiWarning();
  else setUpAiWarning();
  import('./game.js');
}
