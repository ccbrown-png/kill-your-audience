import * as THREE from 'three';

/*
 * SCULPTING WITH MATH (signed distance fields)
 *
 * Instead of stacking spheres and cylinders (which shows every seam), organic shapes here are
 * described as one function: for any point in space, how far is it from the surface? Negative
 * inside, positive outside. Simple shapes (capsules, ellipsoids) are combined with a "smooth
 * minimum", which blends them together like clay instead of leaving a hard crease, so a finger
 * grows out of a palm and a spider's waist pinches between body and abdomen.
 *
 * meshSDF() samples that function on a 3D grid and builds triangles where it crosses zero
 * ("surface nets"). Normals come from the function's slope, so the result shades smoothly.
 */

/** Smooth union: blends two distances with a soft fillet of size k. */
export function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Smooth subtraction: carves b out of a with a soft edge. */
export function smax(a, b, k) {
  return -smin(-a, -b, k);
}

/** Distance to a capsule from a to b whose radius goes from ra to rb (a tapered limb). */
export function sdTaperedCapsule(px, py, pz, ax, ay, az, bx, by, bz, ra, rb) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const len2 = bax * bax + bay * bay + baz * baz;
  let t = len2 > 0 ? (pax * bax + pay * bay + paz * baz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = pax - bax * t, dy = pay - bay * t, dz = paz - baz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * t);
}

/** Approximate distance to an axis-aligned ellipsoid centered at c with radii r. */
export function sdEllipsoid(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const x = (px - cx) / rx, y = (py - cy) / ry, z = (pz - cz) / rz;
  const k0 = Math.sqrt(x * x + y * y + z * z);
  const x1 = x / rx, y1 = y / ry, z1 = z / rz;
  const k1 = Math.sqrt(x1 * x1 + y1 * y1 + z1 * z1);
  return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
}

/**
 * Builds a smooth mesh from a distance function.
 * @param {(x:number,y:number,z:number)=>number} sdf
 * @param {THREE.Box3} bounds region to sample (a little bigger than the shape)
 * @param {number} cell grid spacing; smaller = finer and slower
 * @param {{ attributes?: Record<string, { size: number, fn: (p: THREE.Vector3, n: THREE.Vector3) => number|number[] }> }} options
 *   extra per-vertex attributes worked out from each vertex's position and normal
 */
export function meshSDF(sdf, bounds, cell, { attributes = {} } = {}) {
  const min = bounds.min;
  const nx = Math.ceil((bounds.max.x - min.x) / cell) + 1;
  const ny = Math.ceil((bounds.max.y - min.y) / cell) + 1;
  const nz = Math.ceil((bounds.max.z - min.z) / cell) + 1;
  const values = new Float32Array(nx * ny * nz);
  const at = (x, y, z) => x + nx * (y + ny * z);
  // Speed-up: sample a coarse grid first (every 4th point). Far from the surface only the sign
  // matters, so points whose coarse neighbor is clearly inside or outside skip the full calculation.
  const C = 4;
  const cx = Math.ceil(nx / C) + 1, cy = Math.ceil(ny / C) + 1, cz = Math.ceil(nz / C) + 1;
  const coarse = new Float32Array(cx * cy * cz);
  for (let z = 0; z < cz; z++) {
    for (let y = 0; y < cy; y++) {
      for (let x = 0; x < cx; x++) coarse[x + cx * (y + cy * z)] = sdf(min.x + x * C * cell, min.y + y * C * cell, min.z + z * C * cell);
    }
  }
  const far = C * cell * 1.9;
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const d = coarse[Math.round(x / C) + cx * (Math.round(y / C) + cy * Math.round(z / C))];
        values[at(x, y, z)] = Math.abs(d) > far ? d : sdf(min.x + x * cell, min.y + y * cell, min.z + z * cell);
      }
    }
  }

  // One vertex per grid cell that the surface passes through, at the average of its edge crossings.
  const cellVertex = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cellAt = (x, y, z) => x + (nx - 1) * (y + (ny - 1) * z);
  const positions = [];
  const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let z = 0; z < nz - 1; z++) {
    for (let y = 0; y < ny - 1; y++) {
      for (let x = 0; x < nx - 1; x++) {
        let inside = 0;
        for (let c = 0; c < 8; c++) {
          cv[c] = values[at(x + corner[c][0], y + corner[c][1], z + corner[c][2])];
          if (cv[c] < 0) inside++;
        }
        if (inside === 0 || inside === 8) continue;
        let sx = 0, sy = 0, sz = 0, count = 0;
        for (const [a, b] of edges) {
          if ((cv[a] < 0) === (cv[b] < 0)) continue;
          const t = cv[a] / (cv[a] - cv[b]);
          sx += corner[a][0] + (corner[b][0] - corner[a][0]) * t;
          sy += corner[a][1] + (corner[b][1] - corner[a][1]) * t;
          sz += corner[a][2] + (corner[b][2] - corner[a][2]) * t;
          count++;
        }
        cellVertex[cellAt(x, y, z)] = positions.length / 3;
        positions.push(min.x + (x + sx / count) * cell, min.y + (y + sy / count) * cell, min.z + (z + sz / count) * cell);
      }
    }
  }

  // A quad for every grid edge the surface crosses, joining the four cells around that edge.
  const indices = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) indices.push(a, c, b, a, d, c);
    else indices.push(a, b, c, a, c, d);
  };
  for (let z = 1; z < nz - 1; z++) {
    for (let y = 1; y < ny - 1; y++) {
      for (let x = 1; x < nx - 1; x++) {
        const v0 = values[at(x, y, z)] < 0;
        if (v0 !== (values[at(x + 1, y, z)] < 0)) {
          quad(cellVertex[cellAt(x, y - 1, z - 1)], cellVertex[cellAt(x, y, z - 1)], cellVertex[cellAt(x, y, z)], cellVertex[cellAt(x, y - 1, z)], !v0);
        }
        if (v0 !== (values[at(x, y + 1, z)] < 0)) {
          quad(cellVertex[cellAt(x - 1, y, z - 1)], cellVertex[cellAt(x - 1, y, z)], cellVertex[cellAt(x, y, z)], cellVertex[cellAt(x, y, z - 1)], !v0);
        }
        if (v0 !== (values[at(x, y, z + 1)] < 0)) {
          quad(cellVertex[cellAt(x - 1, y - 1, z)], cellVertex[cellAt(x, y - 1, z)], cellVertex[cellAt(x, y, z)], cellVertex[cellAt(x - 1, y, z)], !v0);
        }
      }
    }
  }

  // Pull each vertex exactly onto the surface and take its normal from the slope of the function.
  const count = positions.length / 3;
  const normals = new Float32Array(count * 3);
  const h = cell * 0.35;
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const extra = Object.fromEntries(Object.entries(attributes).map(([name, { size }]) => [name, new Float32Array(count * size)]));
  for (let i = 0; i < count; i++) {
    p.fromArray(positions, i * 3);
    for (let step = 0; step < 2; step++) {
      n.set(
        sdf(p.x + h, p.y, p.z) - sdf(p.x - h, p.y, p.z),
        sdf(p.x, p.y + h, p.z) - sdf(p.x, p.y - h, p.z),
        sdf(p.x, p.y, p.z + h) - sdf(p.x, p.y, p.z - h),
      ).normalize();
      p.addScaledVector(n, -sdf(p.x, p.y, p.z));
    }
    p.toArray(positions, i * 3);
    n.toArray(normals, i * 3);
    for (const [name, { size, fn }] of Object.entries(attributes)) {
      const value = fn(p, n);
      if (size === 1) extra[name][i] = value;
      else for (let k = 0; k < size; k++) extra[name][i * size + k] = value[k];
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  for (const [name, { size }] of Object.entries(attributes)) geometry.setAttribute(name, new THREE.BufferAttribute(extra[name], size));
  geometry.setIndex(indices);
  return geometry;
}
