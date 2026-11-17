import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvasTexture } from './bake.js';
import { REFLECTION_STRENGTH } from '../config.js';

/*
 * THE SHELF AND WHAT'S ON IT
 *
 * Bottles are lathe shapes: an outline of half the bottle, spun around its center line. Squashing
 * the result front-to-back turns a round bottle into the usual oval squeeze bottle. Labels are a
 * separate thin sleeve wrapped around the front, printed on a canvas (fictional brands only).
 *
 * Everything is put inside the Shelf object, so looking at a bottle counts as looking at the
 * shelf for "Grab the shampoo". The shelf in Blender is a scaled cube, so the holder group undoes
 * that scale, letting the props be built in plain meters.
 */

const v2 = (points) => points.map(([r, y]) => new THREE.Vector2(r, y));

function plastic(color, roughness = 0.38) {
  return new THREE.MeshPhysicalMaterial({ color, roughness, clearcoat: 0.5, clearcoatRoughness: 0.25, envMapIntensity: REFLECTION_STRENGTH });
}

function drawLabel({ bg, ink, accent, brand, line, sub, stripe }) {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    if (stripe) {
      ctx.fillStyle = accent;
      ctx.fillRect(0, h * 0.68, w, h * 0.07);
    }
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.22, h * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = ink;
    ctx.font = `bold ${brand.length > 8 ? 62 : 80}px Georgia, 'Times New Roman', serif`;
    ctx.fillText(brand, w / 2, h * 0.48);
    ctx.font = '600 34px Helvetica, Arial, sans-serif';
    ctx.fillText(line, w / 2, h * 0.6);
    ctx.font = '24px Helvetica, Arial, sans-serif';
    ctx.globalAlpha = 0.8;
    ctx.fillText(sub, w / 2, h * 0.83);
    ctx.fillText('12 FL OZ (355 mL)', w / 2, h * 0.92);
    ctx.globalAlpha = 1;
    // Wear: the print rubs off along the edges and where thumbs go.
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.18})`;
      const x = Math.random() < 0.5 ? Math.random() * w * 0.12 : w - Math.random() * w * 0.12;
      ctx.fillRect(x, Math.random() * h, 2 + Math.random() * 6, 2 + Math.random() * 6);
    }
  });
}

/** Label sleeve wrapped around the front of a lathe bottle. */
function labelSleeve(radius, bottom, top, texture, arc = 2.2) {
  const geometry = new THREE.CylinderGeometry(radius, radius, top - bottom, 32, 1, true, -arc / 2, arc);
  geometry.translate(0, (top + bottom) / 2, 0);
  return new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({ map: texture, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 }));
}

function shampoo() {
  const group = new THREE.Group();
  const body = new THREE.LatheGeometry(v2([
    [0, 0], [0.028, 0], [0.033, 0.003], [0.035, 0.012], [0.0355, 0.08], [0.035, 0.15], [0.032, 0.166],
    [0.025, 0.179], [0.017, 0.186], [0.0135, 0.188],
  ]), 40);
  group.add(new THREE.Mesh(body, plastic(0x1f4a52)));
  group.add(labelSleeve(0.0358, 0.03, 0.135, drawLabel({
    bg: '#e9e4d6', ink: '#1a2d33', accent: '#2c6670', brand: 'SILK NOIR', line: 'SHAMPOO', sub: 'for hair that keeps secrets', stripe: true,
  })));
  // Flip-top cap with its hinge line.
  const cap = new THREE.Mesh(new THREE.LatheGeometry(v2([[0, 0.212], [0.0145, 0.212], [0.0158, 0.208], [0.0162, 0.19], [0.0155, 0.186], [0, 0.186]]), 32), plastic(0x0d1215, 0.3));
  group.add(cap);
  group.scale.z = 0.62;
  return group;
}

function conditioner() {
  // Stands upside down on its wide cap, like a real conditioner bottle.
  const group = new THREE.Group();
  const cap = new THREE.LatheGeometry(v2([[0, 0], [0.026, 0], [0.0285, 0.003], [0.029, 0.018], [0.0265, 0.021], [0, 0.021]]), 36);
  group.add(new THREE.Mesh(cap, plastic(0xd8d2c8, 0.3)));
  const body = new THREE.LatheGeometry(v2([
    [0.0255, 0.021], [0.03, 0.03], [0.0335, 0.05], [0.0345, 0.09], [0.034, 0.14], [0.031, 0.158], [0.022, 0.166], [0, 0.169],
  ]), 40);
  group.add(new THREE.Mesh(body, plastic(0x6e4a6e)));
  group.add(labelSleeve(0.0348, 0.05, 0.135, drawLabel({
    bg: '#f2e9f0', ink: '#3c2240', accent: '#8c5a8c', brand: 'MIDNIGHT ORCHID', line: 'CONDITIONER', sub: 'smooth. silent. deadly soft.', stripe: false,
  }), 2.0));
  group.scale.z = 0.6;
  return group;
}

function bodyWash() {
  const group = new THREE.Group();
  const body = new THREE.LatheGeometry(v2([
    [0, 0], [0.032, 0], [0.036, 0.004], [0.0368, 0.015], [0.0368, 0.13], [0.034, 0.145], [0.024, 0.156], [0.015, 0.16], [0.0145, 0.172],
  ]), 40);
  group.add(new THREE.Mesh(body, plastic(0x2a4f7a)));
  group.add(labelSleeve(0.0372, 0.025, 0.12, drawLabel({
    bg: '#dfe9f2', ink: '#0f2236', accent: '#3a7bbf', brand: 'ARCTIC SURGE', line: 'BODY WASH', sub: 'cold-blooded clean', stripe: true,
  })));
  // Pump: collar, stem, head with a spout pointing forward.
  const white = plastic(0xe9e9e4, 0.3);
  group.add(new THREE.Mesh(new THREE.LatheGeometry(v2([[0.0145, 0.16], [0.0175, 0.161], [0.018, 0.182], [0.0145, 0.184], [0.005, 0.184]]), 28), white));
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.02, 12), white);
  stem.position.y = 0.192;
  group.add(stem);
  const head = new THREE.Mesh(new RoundedBoxGeometry(0.026, 0.014, 0.028, 3, 0.005), white);
  head.position.y = 0.207;
  group.add(head);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.004, 0.034, 10), white);
  spout.rotation.x = Math.PI / 2 - 0.12;
  spout.position.set(0, 0.209, 0.027);
  group.add(spout);
  return group;
}

function soapBar() {
  const geometry = new RoundedBoxGeometry(0.074, 0.024, 0.048, 5, 0.011);
  // Worn into a pillow: thinner at the ends, slightly dished on top from use.
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) / 0.037;
    const z = position.getZ(i) / 0.024;
    const y = position.getY(i);
    const squash = 1 - 0.28 * (x * x) - 0.15 * (z * z);
    position.setY(i, y > 0 ? y * squash - 0.0015 * Math.exp(-(x * x + z * z) * 3) : y * 0.9);
  }
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({
    color: 0xb9cdb0, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.4, sheen: 0.4, sheenColor: 0xffffff,
  }));
  mesh.position.y = 0.0105;
  const group = new THREE.Group();
  group.add(mesh);
  // A slimy little puddle of melted soap under it.
  const puddle = new THREE.Mesh(
    new THREE.CircleGeometry(0.045, 24),
    new THREE.MeshPhysicalMaterial({ color: 0xc9d6c0, roughness: 0.08, transparent: true, opacity: 0.55, clearcoat: 1 }),
  );
  puddle.rotation.x = -Math.PI / 2;
  puddle.scale.set(1, 0.7, 1);
  puddle.position.y = 0.0004;
  group.add(puddle);
  return group;
}

// Small repeatable 3D noise for the loofah's ruffles.
function noise3(x, y, z) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}
function smoothNoise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const fade = (t) => t * t * (3 - 2 * t);
  const u = fade(xf), v = fade(yf), w = fade(zf);
  const lerp = THREE.MathUtils.lerp;
  const c = (dx, dy, dz) => noise3(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

function loofah() {
  const geometry = new THREE.IcosahedronGeometry(0.045, 24);
  const position = geometry.attributes.position;
  const n = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    n.fromBufferAttribute(position, i).normalize();
    // Ridged noise: sharp crests with soft valleys, like gathered mesh ruffles.
    let ridge = 0;
    let amp = 1;
    let freq = 5;
    for (let o = 0; o < 3; o++) {
      ridge += amp * (1 - Math.abs(smoothNoise3(n.x * freq + 3, n.y * freq + 7, n.z * freq) * 2 - 1));
      amp *= 0.5;
      freq *= 2.1;
    }
    const r = 0.04 * (0.72 + 0.32 * ridge / 1.75);
    position.setXYZ(i, n.x * r, n.y * r * 0.85, n.z * r);
  }
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xb06a6a, roughness: 0.85 }));
  mesh.position.y = 0.033;
  const group = new THREE.Group();
  group.add(mesh);
  // The cord loop.
  const cord = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0016, 6, 24), new THREE.MeshStandardMaterial({ color: 0xa05a5a, roughness: 0.8 }));
  cord.position.set(0.02, 0.074, 0);
  cord.rotation.set(0.3, 0.4, 0.9);
  group.add(cord);
  return group;
}

function razor() {
  const group = new THREE.Group();
  const pink = plastic(0xd98ca8, 0.4);
  // Handle: a slightly curved, tapered bar built from a tube along a gentle arc.
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.055, 0.004, 0), new THREE.Vector3(-0.01, 0.006, 0), new THREE.Vector3(0.04, 0.009, 0), new THREE.Vector3(0.062, 0.012, 0),
  ]);
  const handle = new THREE.TubeGeometry(path, 24, 0.0042, 8, false);
  const position = handle.attributes.position;
  const p = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    p.z *= 1.5; // flatter than it is tall... wide grip
    position.setXYZ(i, p.x, p.y, p.z);
  }
  handle.computeVertexNormals();
  group.add(new THREE.Mesh(handle, pink));
  // Head: plastic housing, two steel blades, a white lubricating strip.
  const housing = new THREE.Mesh(new RoundedBoxGeometry(0.012, 0.009, 0.04, 2, 0.002), pink);
  housing.position.set(0.066, 0.014, 0);
  housing.rotation.z = -0.5;
  group.add(housing);
  const steel = new THREE.MeshStandardMaterial({ color: 0xcfd4d6, metalness: 1, roughness: 0.2 });
  for (let i = 0; i < 2; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.0016, 0.036), steel);
    blade.position.set(0.069 + i * 0.0025, 0.0185 - i * 0.0012, 0);
    blade.rotation.z = -0.5;
    group.add(blade);
  }
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.0025, 0.0012, 0.036), new THREE.MeshStandardMaterial({ color: 0xe8f0e8, roughness: 0.6 }));
  strip.position.set(0.0745, 0.0165, 0);
  strip.rotation.z = -0.5;
  group.add(strip);
  return group;
}

function bracket(chrome) {
  // L-shaped shelf bracket: a wall plate and an arm under the shelf.
  const group = new THREE.Group();
  const plate = new THREE.Mesh(new RoundedBoxGeometry(0.014, 0.05, 0.004, 2, 0.0015), chrome);
  plate.position.set(0, -0.03, -0.0565);
  group.add(plate);
  const arm = new THREE.Mesh(new RoundedBoxGeometry(0.01, 0.006, 0.1, 2, 0.002), chrome);
  arm.position.set(0, -0.0045, -0.008);
  group.add(arm);
  const brace = new THREE.Mesh(new RoundedBoxGeometry(0.006, 0.05, 0.004, 2, 0.0015), chrome);
  brace.position.set(0, -0.025, -0.03);
  brace.rotation.x = -0.75;
  group.add(brace);
  return group;
}

/** Restyles the shelf and fills it with props. */
export function dressShelf(level, chrome) {
  const shelf = level.getObjectByName('Shelf');
  if (!shelf) return;
  shelf.material = new THREE.MeshPhysicalMaterial({
    color: 0xdedbd2, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2, envMapIntensity: REFLECTION_STRENGTH,
  });
  shelf.castShadow = true;
  shelf.receiveShadow = true;

  // Undo the cube's scale, so everything inside is in plain meters with the shelf's center at 0.
  const holder = new THREE.Group();
  holder.name = 'ShelfProps';
  holder.scale.set(1 / shelf.scale.x, 1 / shelf.scale.y, 1 / shelf.scale.z);
  shelf.add(holder);
  const top = shelf.scale.y; // the unit cube's top face, in meters above the center

  const place = (object, x, z, turn = 0) => {
    object.position.set(x, top, z);
    object.rotation.y += turn;
    object.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    holder.add(object);
    return object;
  };

  place(shampoo(), -0.125, -0.012, -0.12);
  place(conditioner(), -0.06, -0.018, 0.18);
  place(bodyWash(), 0.115, -0.01, 0.25);
  place(soapBar(), 0.03, 0.02, 0.35);
  place(loofah(), -0.148, 0.05, 0);
  const r = place(razor(), 0.05, 0.035, -0.4);
  r.position.y += 0.0005;

  // Invisible box around the shelf and everything on it. The props have gaps between them where
  // you'd see tile, so without this, looking "at the shelf" for the shampoo step could miss.
  const gaze = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.26, 0.13));
  gaze.position.set(0, top + 0.1, 0.005);
  gaze.visible = false;
  holder.add(gaze);

  for (const x of [-0.12, 0.12]) {
    const b = bracket(chrome);
    b.position.set(x, -top, 0);
    holder.add(b);
  }
}
