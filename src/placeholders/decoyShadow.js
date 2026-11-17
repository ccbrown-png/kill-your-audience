import * as THREE from 'three';
import { DECOY_SIZE } from '../config.js';

// PLACEHOLDER: a flat spider-shaped shadow. The game uses mesh, setDissolve(t) and dispose().

const START_OPACITY = 0.8;
let sharedTexture = null;

function drawSilhouette() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  ctx.fillStyle = ctx.strokeStyle = '#000';
  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  ctx.filter = 'blur(1.5px)';

  for (const side of [-1, 1]) {
    for (const [kneeX, kneeY, tipX, tipY] of [
      [26, -26, 40, -54], [34, -8, 58, -22], [34, 8, 58, 20], [24, 24, 40, 54],
    ]) {
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(c + side * kneeX, c + kneeY);
      ctx.lineTo(c + side * tipX, c + tipY);
      ctx.stroke();
    }
  }

  ctx.beginPath();
  ctx.ellipse(c, c - 8, 10, 12, 0, 0, Math.PI * 2);
  ctx.ellipse(c, c + 16, 14, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  return new THREE.CanvasTexture(canvas);
}

export function createDecoyShadow() {
  if (!sharedTexture) sharedTexture = drawSilhouette();
  const material = new THREE.MeshBasicMaterial({
    map: sharedTexture,
    transparent: true,
    opacity: START_OPACITY,
    depthWrite: false,
    fog: false,
  });
  const geometry = new THREE.PlaneGeometry(DECOY_SIZE, DECOY_SIZE);
  const mesh = new THREE.Mesh(geometry, material);

  return {
    mesh,
    /** @param {number} t 0 = solid, 1 = gone */
    setDissolve(t) {
      material.opacity = START_OPACITY * (1 - t);
      mesh.scale.setScalar(1 + t * 0.35);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
