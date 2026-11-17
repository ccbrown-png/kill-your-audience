import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WALLS } from './showerMaterials.js';

/*
 * THE TUB
 *
 * In bathtub.glb the tub, spout, handle plates, overflow plate, drain and shower arm are all
 * one mesh with one material. Here the mesh is split into its separate connected pieces
 * (pieces that share no vertices), and each piece gets the right material: the big one is the
 * enamel tub, the rest are chrome. The old drain is hidden and replaced with a slotted grate.
 */

/** Groups a mesh's triangles into connected pieces. Returns one array of triangle numbers per piece. */
export function connectedPieces(geometry) {
  const welded = mergeVertices(geometry.clone().deleteAttribute('normal').deleteAttribute('uv'), 1e-4);
  const index = welded.index.array;
  const parent = new Int32Array(welded.attributes.position.count).map((_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]];
    return x;
  };
  for (let i = 0; i < index.length; i += 3) {
    const a = find(index[i]);
    parent[find(index[i + 1])] = a;
    parent[find(index[i + 2])] = a;
  }
  const pieces = new Map();
  for (let tri = 0; tri < index.length / 3; tri++) {
    const root = find(index[tri * 3]);
    if (!pieces.has(root)) pieces.set(root, []);
    pieces.get(root).push(tri);
  }
  welded.dispose();
  return [...pieces.values()];
}

/** Reorders a mesh's triangles so each piece draws with the material its classifier picks. */
function assignPieceMaterials(mesh, materials, classify) {
  const geometry = mesh.geometry;
  const index = geometry.index.array;
  const position = geometry.attributes.position;
  const buckets = materials.map(() => []);
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const piece of connectedPieces(geometry)) {
    box.makeEmpty();
    for (const tri of piece) for (let k = 0; k < 3; k++) box.expandByPoint(v.fromBufferAttribute(position, index[tri * 3 + k]));
    buckets[classify(box, piece.length)].push(...piece);
  }
  const newIndex = [];
  geometry.clearGroups();
  buckets.forEach((tris, materialIndex) => {
    const start = newIndex.length;
    for (const tri of tris) newIndex.push(index[tri * 3], index[tri * 3 + 1], index[tri * 3 + 2]);
    geometry.addGroup(start, newIndex.length - start, materialIndex);
  });
  geometry.setIndex(newIndex);
  mesh.material = materials;
}

/** A round drain grate with radial slots, lying flat, plus the dark pit under it. */
function createDrainGrate(chrome) {
  const group = new THREE.Group();
  group.name = 'DrainGrate';
  const radius = 0.034;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
  // A ring of radial slots and a small cross in the middle.
  const slots = 14;
  for (let i = 0; i < slots; i++) {
    const a = (i / slots) * Math.PI * 2;
    const hole = new THREE.Path();
    const inner = 0.011;
    const outer = 0.027;
    const halfWidth = 0.0022;
    const dir = new THREE.Vector2(Math.cos(a), Math.sin(a));
    const side = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(halfWidth);
    const p0 = dir.clone().multiplyScalar(inner);
    const p1 = dir.clone().multiplyScalar(outer);
    hole.moveTo(p0.x + side.x, p0.y + side.y);
    hole.lineTo(p1.x + side.x, p1.y + side.y);
    hole.absarc(p1.x, p1.y, halfWidth, a + Math.PI / 2, a - Math.PI / 2, true);
    hole.lineTo(p0.x - side.x, p0.y - side.y);
    hole.absarc(p0.x, p0.y, halfWidth, a - Math.PI / 2, a + Math.PI / 2, true);
    shape.holes.push(hole);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const hole = new THREE.Path();
    hole.absarc(Math.cos(a) * 0.0055, Math.sin(a) * 0.0055, 0.0018, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const plate = new THREE.ExtrudeGeometry(shape, {
    depth: 0.0012,
    bevelEnabled: true,
    bevelThickness: 0.0012,
    bevelSize: 0.0012,
    bevelSegments: 2,
    curveSegments: 10,
  });
  plate.rotateX(-Math.PI / 2);
  const grate = new THREE.Mesh(plate, chrome);
  grate.castShadow = false;
  grate.receiveShadow = true;
  group.add(grate);

  // The tub has no real hole, so a dark disc right under the grate makes the slots read as a deep drain.
  const hole = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.93, 28),
    new THREE.MeshStandardMaterial({ color: 0x040404, roughness: 0.15 }),
  );
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = -0.0007;
  group.add(hole);
  return group;
}

/** A bead of caulk along the line where the tub meets the walls. */
function createCaulkLines(caulk) {
  const y = WALLS.rim + 0.002;
  const inset = 0.0025;
  const corners = [
    new THREE.Vector3(WALLS.open - 0.004, y, WALLS.front - inset),
    new THREE.Vector3(WALLS.left + inset, y, WALLS.front - inset),
    new THREE.Vector3(WALLS.left + inset, y, WALLS.back + inset),
    new THREE.Vector3(WALLS.open - 0.004, y, WALLS.back + inset),
  ];
  const curve = new THREE.CurvePath();
  for (let i = 0; i < corners.length - 1; i++) curve.add(new THREE.LineCurve3(corners[i], corners[i + 1]));
  const geometry = new THREE.TubeGeometry(curve, 240, 0.0042, 6, false);
  // Squash the round bead into a flatter smear, and let its thickness wobble like it was done by hand.
  const position = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    const wobble = 1 + 0.25 * Math.sin(v.x * 90 + v.z * 70) * Math.sin(v.x * 23 - v.z * 41);
    v.y = y + (v.y - y) * 0.75 * wobble;
    position.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, caulk);
  mesh.name = 'Caulk';
  mesh.receiveShadow = true;
  return mesh;
}

/** Dresses the tub. Returns the drain's world position, for the water pool. */
export function dressTub(level, materials) {
  const tub = level.getObjectByName('BathTub');
  const drainCenter = new THREE.Vector3(-0.389, 0.151, -1.25);
  if (!tub) {
    console.warn('No "BathTub" mesh in bathtub.glb, skipping the tub art.');
    return { drainCenter };
  }

  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  // Material 0 enamel, 1 chrome, 2 hidden (the old drain, replaced below).
  assignPieceMaterials(tub, [materials.enamel, materials.chrome, hidden], (box) => {
    const size = box.getSize(new THREE.Vector3());
    if (size.x > 0.4 && size.z > 0.4) return 0; // the tub itself
    const center = box.getCenter(new THREE.Vector3());
    if (center.y < 0.2 && size.x < 0.1) {
      drainCenter.set(center.x, box.max.y, center.z);
      return 2;
    }
    return 1;
  });
  tub.castShadow = true;
  tub.receiveShadow = true;

  const grate = createDrainGrate(materials.chrome);
  // The old drain stood slightly proud of the floor; sit the grate just above the enamel.
  grate.position.set(drainCenter.x, drainCenter.y - 0.0105, drainCenter.z);
  level.add(grate);
  drainCenter.y -= 0.012;

  level.add(createCaulkLines(materials.caulk));
  return { drainCenter };
}
