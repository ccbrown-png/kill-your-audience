// Entry point. Phones and tablets get a message instead of downloading a game they can't play.
const touchOnly = window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches;

if (new URLSearchParams(location.search).has('gallery')) {
  // ?gallery=NAME shows one piece of art on a turntable instead of the game (see src/art/gallery.js).
  import('./art/gallery.js');
} else if (touchOnly) {
  document.getElementById('start-button').hidden = true;
  document.getElementById('mobile-note').hidden = false;
} else {
  import('./game.js');
}
