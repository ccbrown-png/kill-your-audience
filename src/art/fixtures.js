import * as THREE from 'three';
import { canvasTexture } from './bake.js';

/*
 * FIXTURES: the showerhead and the three handles.
 *
 * The handles keep their shape from bathtub.glb and just become chrome, with little porcelain
 * H and C caps. The showerhead is rebuilt: the original mesh stays in place (invisible) so the
 * gaze ray still finds "BathTubShowerHead", and a new head is built inside it from a lathe
 * (a 2D outline spun around an axis, like a pot on a potter's wheel) with a face of rubber
 * nozzles, each one a tiny nub with a real hole in it.
 */

// Which way the showerhead face points: down and toward the player.
const HEAD_AXIS = new THREE.Vector3(0, -0.82, 0.57).normalize();

function createNozzleNubs(faceY, rubber) {
  // A nub: a little rounded bump with a hole down the middle (the profile includes the hole wall).
  const profile = [
    [0.0, -0.0006], [0.00055, -0.0006], [0.00058, 0.0011], [0.0011, 0.00145], [0.00165, 0.0011], [0.002, 0.0004], [0.0021, 0.0],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const geometry = new THREE.LatheGeometry(profile, 10);
  const rings = [[0, 1], [0.0085, 6], [0.0165, 12], [0.0245, 18], [0.0315, 24]];
  const count = rings.reduce((sum, [, n]) => sum + n, 0);
  const nubs = new THREE.InstancedMesh(geometry, rubber, count);
  const matrix = new THREE.Matrix4();
  const nozzles = [];
  let i = 0;
  for (const [radius, n] of rings) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + radius * 40;
      const position = new THREE.Vector3(Math.cos(a) * radius, faceY, Math.sin(a) * radius);
      matrix.makeTranslation(position.x, position.y, position.z);
      nubs.setMatrixAt(i++, matrix);
      // Outer rings spray slightly outward, so the water fans out like a real head.
      nozzles.push({ position, spread: radius / 0.0315 });
    }
  }
  return { nubs, nozzles };
}

function createShowerhead(chrome) {
  const head = new THREE.Group();
  head.name = 'ShowerheadArt';

  // The ball joint where the head meets the arm.
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.0115, 20, 14), chrome);
  head.add(ball);

  // Built pointing along +Y, then turned to face down toward the player.
  const body = new THREE.Group();
  body.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), HEAD_AXIS);
  head.add(body);

  const shell = [
    [0.0085, 0.004], [0.0105, 0.011], [0.0135, 0.017], [0.019, 0.024], [0.027, 0.031], [0.0345, 0.037],
    [0.0395, 0.042], [0.0412, 0.0465], [0.041, 0.0505], [0.0396, 0.0532], [0.0372, 0.0542], [0.0362, 0.0535],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  body.add(new THREE.Mesh(new THREE.LatheGeometry(shell, 40), chrome));

  // The face: a slightly domed dark rubber plate inside the chrome rim.
  const faceProfile = [[0.0363, 0.0533], [0.03, 0.0539], [0.018, 0.0544], [0.0, 0.0546]].map(([r, y]) => new THREE.Vector2(r, y));
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.55 });
  const face = new THREE.Mesh(new THREE.LatheGeometry(faceProfile, 40), rubber);
  face.geometry.scale(1, 1, 1);
  body.add(face);
  // Lathe faces point outward from the axis; the face plate needs to face down the axis instead.
  face.material.side = THREE.DoubleSide;

  const { nubs, nozzles } = createNozzleNubs(0.0545, new THREE.MeshStandardMaterial({ color: 0x2b2c2e, roughness: 0.45 }));
  body.add(nubs);

  head.traverse((obj) => {
    if (obj.isMesh) obj.castShadow = true;
  });
  return { head, body, nozzles };
}

function createHandleCap(letter, color) {
  const texture = canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w * 0.42, h * 0.38, 4, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#fbfaf5');
    g.addColorStop(1, '#d8d3c4');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    if (letter) {
      ctx.fillStyle = color;
      ctx.font = 'bold 84px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, w / 2, h / 2 + 4);
    }
  });
  const geometry = new THREE.CylinderGeometry(0.0085, 0.009, 0.003, 24);
  geometry.rotateX(Math.PI / 2);
  // Map the label onto the front cap only.
  const material = new THREE.MeshPhysicalMaterial({ map: texture, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
  const uv = geometry.attributes.uv;
  const position = geometry.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, position.getX(i) / 0.019 + 0.5, position.getY(i) / 0.019 + 0.5);
  return new THREE.Mesh(geometry, material);
}

/** Chromes the handles and showerhead. Returns the nozzles in world space, for the water. */
export function dressFixtures(level, materials) {
  const labels = { BathTubHandleLeft: ['H', '#a3201c'], BathTubHandleMiddle: ['', ''], BathTubHandleRight: ['C', '#1d3f8a'] };
  for (const [name, [letter, color]] of Object.entries(labels)) {
    const handle = level.getObjectByName(name);
    if (!handle) continue;
    handle.material = materials.chrome;
    handle.castShadow = true;
    const box = new THREE.Box3().setFromBufferAttribute(handle.geometry.attributes.position);
    const cap = createHandleCap(letter, color);
    cap.position.set((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.max.z + 0.0005);
    handle.add(cap);
  }

  const original = level.getObjectByName('BathTubShowerHead');
  const nozzleWorld = [];
  const axisWorld = HEAD_AXIS.clone();
  if (!original) {
    console.warn('No "BathTubShowerHead" in bathtub.glb, skipping the showerhead art.');
    return { nozzles: nozzleWorld, axis: axisWorld };
  }
  // Keep the original for the gaze ray but don't draw it.
  original.material = new THREE.MeshBasicMaterial({ visible: false });
  const { head, body, nozzles } = createShowerhead(materials.chrome);
  original.add(head);
  original.updateWorldMatrix(true, true);
  for (const nozzle of nozzles) {
    const world = nozzle.position.clone().applyMatrix4(body.matrixWorld);
    nozzleWorld.push({ position: world, spread: nozzle.spread, local: nozzle.position });
  }
  axisWorld.transformDirection(original.matrixWorld);
  return { nozzles: nozzleWorld, axis: axisWorld, faceCenter: new THREE.Vector3(0, 0.0545, 0).applyMatrix4(body.matrixWorld) };
}
