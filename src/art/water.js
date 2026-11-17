import * as THREE from 'three';
import { GLSL_NOISE, canvasTexture } from './bake.js';
import { WATER_STREAK_COUNT, WATER_STREAK_SPEED, STEAM_PUFF_COUNT, STEAM_OPACITY, REFLECTION_STRENGTH } from '../config.js';

/*
 * WATER
 *
 * Streaks: hundreds of thin strips falling from the showerhead's nozzles. The CPU never moves
 * them. Each strip knows its nozzle, direction and a random start time, and the GPU works out
 * where it is from the clock with the falling-object formula: position = start + velocity * t
 * + half of gravity * t squared. That costs nothing per frame no matter how many there are.
 *
 * The puddle: a flat sheet on the tub floor running from where the water lands to the drain.
 * Its shader draws rings spreading from random splash points and a slow pull toward the drain,
 * and only bends the reflections, so it reads as a thin layer of water over the enamel.
 *
 * Steam: soft, blurry cloud sprites (flat pictures that always face the camera) drifting up.
 */

const GRAVITY = 9.81;

function createStreaks(nozzles, axis, floorY) {
  const count = nozzles.length ? WATER_STREAK_COUNT : 0;
  const quad = new THREE.PlaneGeometry(1, 1);
  quad.translate(0, 0.5, 0); // y from 0 (head of the streak) to 1 (its tail)
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.attributes.position = quad.attributes.position;
  geometry.attributes.uv = quad.attributes.uv;

  const origin = new Float32Array(count * 3);
  const velocity = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const v = new THREE.Vector3();
  const side = new THREE.Vector3(1, 0, 0).cross(axis).normalize();
  const up = axis.clone().cross(side).normalize();
  for (let i = 0; i < count; i++) {
    const nozzle = nozzles[i % nozzles.length];
    origin.set(nozzle.position.toArray(), i * 3);
    // Each nozzle sprays along the head's axis, splayed outward by how far out it sits on the face.
    const out = nozzle.local.clone().setY(0);
    const outward = out.lengthSq() > 0 ? out.normalize() : out;
    const spread = 0.12 * nozzle.spread + 0.04;
    v.copy(axis)
      .addScaledVector(side, outward.x * spread + (Math.random() - 0.5) * 0.04)
      .addScaledVector(up, outward.z * spread + (Math.random() - 0.5) * 0.04)
      .normalize()
      .multiplyScalar(WATER_STREAK_SPEED * (0.85 + Math.random() * 0.3));
    velocity.set(v.toArray(), i * 3);
    seed[i] = Math.random();
  }
  geometry.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(origin, 3));
  geometry.setAttribute('aVelocity', new THREE.InstancedBufferAttribute(velocity, 3));
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
  geometry.instanceCount = count;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFlow: { value: 0 },
      uFloorY: { value: floorY },
      uGravity: { value: GRAVITY },
      uLight: { value: new THREE.Color(0xc9d8e8) },
      uBrightness: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aOrigin; attribute vec3 aVelocity; attribute float aSeed;
      uniform float uTime; uniform float uFlow; uniform float uFloorY; uniform float uGravity;
      varying float vAlpha; varying vec2 vUv;
      vec3 at(float t) { return aOrigin + aVelocity * t + vec3(0.0, -0.5 * uGravity * t * t, 0.0); }
      void main() {
        float life = 0.6;
        float age = fract(uTime / life + aSeed) * life;
        // When does this drop reach the floor? Solve the falling formula for y = floor.
        float a = 0.5 * uGravity; float b = -aVelocity.y; float c = uFloorY - aOrigin.y;
        float tFloor = (-b + sqrt(max(b * b - 4.0 * a * c, 0.0))) / (2.0 * a);
        float head = min(age, tFloor);
        float tail = max(head - 0.016 - 0.018 * aSeed, 0.0);
        vec3 pHead = at(head); vec3 pTail = at(tail);
        vec3 along = pTail - pHead;
        vec3 mid = (pHead + pTail) * 0.5;
        vec3 toCam = normalize(cameraPosition - mid);
        vec3 across = normalize(cross(along + 1e-5, toCam)) * (0.0007 + 0.0005 * aSeed);
        vec3 p = pHead + along * position.y + across * position.x * 2.0;
        // Fade out drops that have landed, and thin the stream out when the water is turning off.
        vAlpha = step(aSeed, uFlow) * (1.0 - smoothstep(tFloor - 0.02, tFloor + 0.04, age)) * smoothstep(0.0, 0.05, age);
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uLight; uniform float uBrightness;
      varying float vAlpha; varying vec2 vUv;
      void main() {
        float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
        float a = vAlpha * edge * (0.35 + 0.65 * (1.0 - vUv.y));
        gl_FragColor = vec4(uLight * uBrightness * 0.75, a * 0.45);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.name = 'WaterStreaks';
  return mesh;
}

function createPuddle(drainCenter, landing, level) {
  // A flat sheet covering the strip of floor between the drain and where the water lands.
  const length = Math.max(0.3, Math.abs(landing.z - drainCenter.z) + 0.35);
  const geometry = new THREE.PlaneGeometry(0.34, length, 24, 48);
  geometry.rotateX(-Math.PI / 2);
  // The tub floor isn't flat (it rises toward the ends), so drape the sheet onto it: drop a ray
  // from above each point and sit the water 2 mm over whatever it hits.
  const center = new THREE.Vector3((drainCenter.x + landing.x) / 2, 0, (drainCenter.z + landing.z) / 2);
  const tub = level?.getObjectByName('BathTub');
  const position = geometry.attributes.position;
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const from = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    from.set(center.x + position.getX(i), 1.0, center.z + position.getZ(i));
    ray.set(from, down);
    const hit = tub ? ray.intersectObject(tub, false)[0] : null;
    position.setY(i, (hit ? hit.point.y : drainCenter.y) + 0.002);
  }
  geometry.computeVertexNormals();
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x9fb2bd,
    roughness: 0.02,
    metalness: 0,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    envMapIntensity: REFLECTION_STRENGTH * 1.6,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
  });
  const uniforms = {
    uTime: { value: 0 },
    uPool: { value: 0 },
    uDrain: { value: new THREE.Vector2(drainCenter.x, drainCenter.z) },
    uLanding: { value: new THREE.Vector2(landing.x, landing.z) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos; uniform float uTime; uniform float uPool; uniform vec2 uDrain; uniform vec2 uLanding;
        ${GLSL_NOISE}
        // Height of the water surface: rings from splash points near where the water lands.
        float ripples(vec2 p) {
          float h = 0.0;
          for (int i = 0; i < 7; i++) {
            float fi = float(i);
            float period = 0.55 + 0.4 * hash11(fi * 3.7);
            float tt = uTime / period + hash11(fi);
            float cycle = floor(tt);
            float age = fract(tt) * period;
            vec2 c = uLanding + (hash22(vec2(fi, cycle)) - 0.5) * vec2(0.16, 0.3);
            float d = length(p - c);
            float front = age * 0.28;
            h += sin((d - front) * 160.0) * bell((d - front) / 0.025) * (1.0 - fract(tt)) * 0.6;
          }
          // Slow wobbling current toward the drain.
          vec2 toDrain = normalize(uDrain - p + 1e-4);
          h += 0.25 * sin(dot(p, toDrain) * 90.0 + uTime * 5.0) * fbm(p * 20.0 + uTime * 0.3);
          return h;
        }`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec2 pp = vWPos.xz;
        // Puddle outline: a wobbly blob along the line from landing spot to drain, growing with uPool.
        vec2 ab = uLanding - uDrain; float tline = clamp(dot(pp - uDrain, ab) / dot(ab, ab), 0.0, 1.0);
        float dLine = length(pp - (uDrain + ab * tline));
        float width = (0.05 + 0.07 * sin(tline * 3.14159)) * (0.6 + 0.8 * fbm(pp * 9.0));
        float pool = smoothstep(width, width * 0.6, dLine) * uPool;
        pool = max(pool, smoothstep(0.075, 0.05, length(pp - uDrain)) * uPool);
        diffuseColor.a = pool * 0.55;
        if (diffuseColor.a < 0.01) discard;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        float e = 0.002;
        float h0 = ripples(pp);
        vec2 grad = vec2(ripples(pp + vec2(e, 0.0)) - h0, ripples(pp + vec2(0.0, e)) - h0) / e;
        // Bend the view-space normal by the ripple slope (world x and z, converted to view space).
        vec3 wx = (viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz; vec3 wz = (viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz;
        normal = normalize(normal - (grad.x * wx + grad.y * wz) * 0.0035);`,
      );
  };
  material.customProgramCacheKey = () => 'puddle';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(center.x, 0, center.z);
  mesh.name = 'Puddle';
  mesh.renderOrder = 2;
  mesh.receiveShadow = true;
  return { mesh, uniforms };
}

function createSteam(center) {
  const texture = canvasTexture(128, 128, (ctx, w, h) => {
    // A soft cloud: lots of faint overlapping blobs inside a round falloff.
    const image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (x - w / 2) / (w / 2);
        const dy = (y - h / 2) / (h / 2);
        const r = Math.sqrt(dx * dx + dy * dy);
        const n = 0.5 + 0.25 * Math.sin(x * 0.21 + Math.sin(y * 0.13) * 3) + 0.25 * Math.sin(y * 0.17 + Math.cos(x * 0.11) * 2.5);
        const a = Math.max(0, 1 - r) ** 2 * n;
        const i = (y * w + x) * 4;
        image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
        image.data[i + 3] = a * 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  });
  const group = new THREE.Group();
  group.name = 'Steam';
  const puffs = [];
  for (let i = 0; i < STEAM_PUFF_COUNT; i++) {
    const material = new THREE.SpriteMaterial({ map: texture, color: 0xb9c6cf, transparent: true, opacity: 0, depthWrite: false, fog: true });
    material.rotation = Math.random() * Math.PI * 2;
    const sprite = new THREE.Sprite(material);
    group.add(sprite);
    const puff = { sprite, age: Math.random() * 8, life: 6 + Math.random() * 5, spin: (Math.random() - 0.5) * 0.15, base: new THREE.Vector3() };
    respawn(puff, true);
    puffs.push(puff);
  }
  function respawn(puff, anyAge = false) {
    puff.base.set(center.x + (Math.random() - 0.5) * 0.55, 0.4 + Math.random() * 0.9, center.z + (Math.random() - 0.5) * 1.1);
    if (!anyAge) puff.age = 0;
  }
  return {
    group,
    update(dt, amount, light) {
      for (const puff of puffs) {
        puff.age += dt;
        if (puff.age > puff.life) respawn(puff);
        const t = puff.age / puff.life;
        puff.sprite.position.set(puff.base.x + Math.sin(puff.age * 0.4 + puff.life) * 0.06, puff.base.y + t * 0.9, puff.base.z);
        const size = 0.35 + t * 0.6;
        puff.sprite.scale.set(size, size, 1);
        puff.sprite.material.rotation += puff.spin * dt;
        puff.sprite.material.opacity = STEAM_OPACITY * amount * Math.sin(Math.PI * t) * (0.6 + 0.4 * light);
      }
    },
  };
}

/**
 * @param {{ nozzles, axis, drainCenter }} parts from the fixtures and tub art
 */
export function createWater(scene, { nozzles, axis, drainCenter, level }) {
  const floorY = drainCenter.y + 0.004;
  const streaks = createStreaks(nozzles, axis, floorY);
  scene.add(streaks);

  // Work out where the middle of the stream hits the floor, so the puddle starts there.
  const landing = new THREE.Vector3(-0.389, floorY, -0.85);
  if (nozzles.length) {
    const start = nozzles[0].position;
    const vel = axis.clone().multiplyScalar(WATER_STREAK_SPEED);
    const a = 0.5 * GRAVITY;
    const t = (vel.y + Math.sqrt(vel.y * vel.y + 4 * a * (start.y - floorY))) / (2 * a);
    landing.set(start.x + vel.x * t, floorY, start.z + vel.z * t);
  }
  const puddle = createPuddle(drainCenter, landing, level);
  scene.add(puddle.mesh);

  const steam = createSteam(new THREE.Vector3(-0.38, 0, -0.85));
  scene.add(steam.group);

  let running = false;
  let flow = 0; // 0..1 how much water is coming out
  let pool = 0; // 0..1 how much water is standing in the tub
  let steamAmount = 0;
  let time = 0;

  return {
    setRunning(value) {
      running = value;
    },
    /** @param {number} light 0..1 current brightness of the bulb (so streaks and steam dim with flickers) */
    update(dt, light = 1) {
      time += dt;
      flow = THREE.MathUtils.clamp(flow + (running ? dt / 0.6 : -dt / 0.35), 0, 1);
      pool = THREE.MathUtils.clamp(pool + (running ? dt / 6 : -dt / 14), 0, 1);
      steamAmount = THREE.MathUtils.clamp(steamAmount + (running ? dt / 12 : -dt / 25), 0, 1);
      streaks.material.uniforms.uTime.value = time;
      streaks.material.uniforms.uFlow.value = flow;
      streaks.material.uniforms.uBrightness.value = 0.35 + 0.65 * light;
      streaks.visible = flow > 0;
      puddle.uniforms.uTime.value = time;
      puddle.uniforms.uPool.value = pool;
      puddle.mesh.visible = pool > 0;
      steam.update(dt, steamAmount, light);
    },
    reset() {
      running = false;
      flow = 0;
      pool = 0;
      steamAmount = 0;
    },
    isRunning: () => running,
    getPool: () => pool,
  };
}
