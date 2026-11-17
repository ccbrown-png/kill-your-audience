/**
 * True on phones and tablets, where the main pointer is a finger. Those get on-screen touch
 * controls (drag to look, a SPRAY button) instead of mouse lock. Add ?touch to the page address
 * to force touch mode on a desktop for testing, or ?mouse to force mouse mode.
 */
const params = new URLSearchParams(location.search);
export const IS_TOUCH = params.has('touch')
  || (!params.has('mouse') && window.matchMedia('(pointer: coarse)').matches);

if (IS_TOUCH) document.body.classList.add('touch');
