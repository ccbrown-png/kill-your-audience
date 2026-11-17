import * as THREE from 'three';

// PLACEHOLDER: small vertical ammo bar attached beside the can. The game only uses set() and setVisible().

const HEIGHT = 0.11;
const WIDTH = 0.007;
const FULL_COLOR = 0xefece2;
const LOW_COLOR = 0xc4161c;
const LOW_FRACTION = 0.25; // the bar turns red below this much spray

export function createSprayGauge(parent) {
  const group = new THREE.Group();
  group.position.set(0.058, -0.03, 0);
  parent.add(group);

  // Drawn after the can and on top of everything, like the can itself.
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(WIDTH + 0.004, HEIGHT + 0.004, 0.001),
    new THREE.MeshBasicMaterial({ color: 0x111111, depthTest: false }),
  );
  back.position.y = HEIGHT / 2;
  back.renderOrder = 2000;
  group.add(back);

  // Moving the shape up by half its height makes it shrink toward its bottom edge.
  const fillGeometry = new THREE.BoxGeometry(WIDTH, HEIGHT, 0.001);
  fillGeometry.translate(0, HEIGHT / 2, 0);
  const fill = new THREE.Mesh(fillGeometry, new THREE.MeshBasicMaterial({ color: FULL_COLOR, depthTest: false }));
  fill.renderOrder = 2001;
  group.add(fill);

  /** @param {number} fraction 0 = empty, 1 = full */
  function set(fraction) {
    fill.scale.y = Math.max(fraction, 0.001);
    fill.material.color.setHex(fraction < LOW_FRACTION ? LOW_COLOR : FULL_COLOR);
  }

  return { set, setVisible: (visible) => { group.visible = visible; } };
}
