import * as THREE from 'three';
import {
  SPRAY_PARTICLE_RATE,
  SPRAY_PARTICLE_SPEED,
  SPRAY_PARTICLE_LIFETIME,
  SPRAY_PARTICLE_SIZE,
  SPRAY_CONE_DEGREES,
} from '../config.js';

// PLACEHOLDER: swap for a real spray effect. The game only uses emit(), update() and reset().

const START_OPACITY = 0.75;

function makeSoftDot() {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

export function createSprayParticles(scene) {
  const count = Math.ceil(SPRAY_PARTICLE_RATE * SPRAY_PARTICLE_LIFETIME * 1.25);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4).fill(1); // white; alpha is rewritten every frame
  const velocities = new Float32Array(count * 3);
  const ages = new Float32Array(count).fill(Infinity); // Infinity = not in use
  const lifetimes = new Float32Array(count); // each particle dies at its full lifetime or on reaching the surface

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));

  const points = new THREE.Points(geometry, new THREE.PointsMaterial({
    // Art pass: brighter than white (it glows a little through the bloom) and slightly bigger, so the
    // mist still shows against the pale tiles.
    color: new THREE.Color(1.7, 1.85, 2.0),
    size: SPRAY_PARTICLE_SIZE * 1.35,
    map: makeSoftDot(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
  }));
  points.frustumCulled = false; // particles move every frame, so the bounds would always be stale
  scene.add(points);

  const coneTangent = Math.tan(THREE.MathUtils.degToRad(SPRAY_CONE_DEGREES));
  const direction = new THREE.Vector3();
  const sideA = new THREE.Vector3();
  const sideB = new THREE.Vector3();
  const WORLD_UP = new THREE.Vector3(0, 1, 0);
  const WORLD_RIGHT = new THREE.Vector3(1, 0, 0);
  let nextIndex = 0;
  let owed = 0; // fraction of a particle carried over between frames
  let travelDistance = 0; // meters from the nozzle to what the crosshair is on

  function spawnParticle(origin, dt) {
    const i = nextIndex;
    nextIndex = (nextIndex + 1) % count;

    // Random point on a disc at the end of the cone. sqrt keeps it evenly filled.
    const radius = coneTangent * Math.sqrt(Math.random());
    const angle = Math.random() * Math.PI * 2;
    const a = Math.cos(angle) * radius;
    const b = Math.sin(angle) * radius;
    const speed = SPRAY_PARTICLE_SPEED * THREE.MathUtils.randFloat(0.8, 1.15);

    velocities[i * 3] = (direction.x + sideA.x * a + sideB.x * b) * speed;
    velocities[i * 3 + 1] = (direction.y + sideA.y * a + sideB.y * b) * speed;
    velocities[i * 3 + 2] = (direction.z + sideA.z * a + sideB.z * b) * speed;

    // Start each one a random part of a frame along its path, so the stream doesn't come out in clumps.
    const head = Math.random() * dt;
    positions[i * 3] = origin.x + velocities[i * 3] * head;
    positions[i * 3 + 1] = origin.y + velocities[i * 3 + 1] * head;
    positions[i * 3 + 2] = origin.z + velocities[i * 3 + 2] * head;
    lifetimes[i] = Math.min(SPRAY_PARTICLE_LIFETIME, travelDistance / speed);
    ages[i] = 0;
  }

  /** Shoots this frame's share of particles from origin toward target. density 0.5 = half as many. */
  function emit(dt, origin, target, density = 1) {
    direction.copy(target).sub(origin);
    travelDistance = direction.length();
    direction.normalize();
    const reference = Math.abs(direction.y) > 0.9 ? WORLD_RIGHT : WORLD_UP;
    sideA.crossVectors(direction, reference).normalize();
    sideB.crossVectors(direction, sideA);

    owed += SPRAY_PARTICLE_RATE * density * dt;
    while (owed >= 1) {
      spawnParticle(origin, dt);
      owed -= 1;
    }
  }

  function update(dt) {
    for (let i = 0; i < count; i++) {
      if (ages[i] >= lifetimes[i]) {
        colors[i * 4 + 3] = 0;
        continue;
      }
      ages[i] += dt;
      positions[i * 3] += velocities[i * 3] * dt;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
      positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
      colors[i * 4 + 3] = START_OPACITY * Math.max(0, 1 - ages[i] / lifetimes[i]);
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  }

  /** Removes every particle in the air. */
  function reset() {
    ages.fill(Infinity);
    update(0);
    owed = 0;
  }

  return { emit, update, reset };
}
