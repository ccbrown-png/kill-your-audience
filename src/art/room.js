import * as THREE from 'three';
import { GLSL_NOISE } from './bake.js';

/*
 * THE BATHROOM AROUND THE SHOWER
 *
 * bathtub.glb is only the shower stall; everything past the curtain used to be empty grey.
 * This adds the room: a worn black-and-white checker floor, stained plaster walls above and
 * around the tiles, a ceiling, and the light fixture whose light spills in through the gap.
 * All of its dirt is drawn by shader code from world position, so there are no textures to load.
 */

const ROOM = { minX: -0.769, maxX: 1.75, minZ: -1.524, maxZ: 0.95, height: 2.45 };

function worldPosShader(material, key, fragmentChunk, extraUniforms = {}) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, extraUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\n${GLSL_NOISE}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${fragmentChunk}`);
  };
  material.customProgramCacheKey = () => key;
  return material;
}

function floorMaterial() {
  return worldPosShader(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
    'room-floor',
    /* glsl */ `
      // 30 cm checker linoleum, scuffed and yellowed, darker and grimier near the walls.
      vec2 cell = floor(vWPos.xz / 0.3);
      float checker = mod(cell.x + cell.y, 2.0);
      vec3 light = vec3(0.78, 0.76, 0.69) * (0.92 + 0.1 * hash12(cell));
      vec3 dark = vec3(0.06, 0.06, 0.065);
      vec3 floorCol = mix(light, dark, checker);
      float wear = fbm(vWPos.xz * 7.0);
      float scuffs = smoothstep(0.6, 0.85, fbm(vWPos.xz * vec2(30.0, 4.0) + wear * 3.0));
      floorCol = mix(floorCol, vec3(0.32, 0.3, 0.26), scuffs * 0.35 + wear * 0.15);
      float edge = min(min(vWPos.x - ${ROOM.minX.toFixed(3)}, ${ROOM.maxX.toFixed(3)} - vWPos.x), min(vWPos.z - ${ROOM.minZ.toFixed(3)}, ${ROOM.maxZ.toFixed(3)} - vWPos.z));
      floorCol *= 0.65 + 0.35 * smoothstep(0.0, 0.25, edge);
      diffuseColor.rgb *= floorCol;
      roughnessFactor = mix(0.35, 0.75, wear + scuffs * 0.5);
    `,
  );
}

function plasterMaterial() {
  return worldPosShader(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.BackSide }),
    'room-plaster',
    /* glsl */ `
      // Sickly institutional green-grey paint with water stains running down from the ceiling.
      vec2 wp = vec2(vWPos.x + vWPos.z, vWPos.y);
      vec3 paint = vec3(0.47, 0.53, 0.48) * (0.9 + 0.15 * fbm(wp * 3.0));
      float stain = smoothstep(0.55, 0.75, fbm(vec2(wp.x * 4.0, wp.y * 0.8))) * smoothstep(1.2, 2.4, vWPos.y);
      float tide = bell((fbm(vec2(wp.x * 3.0, 1.0)) * 0.5 + 1.6 - vWPos.y) / 0.02) * stain;
      paint = mix(paint, vec3(0.36, 0.33, 0.22), stain * 0.6);
      paint = mix(paint, vec3(0.25, 0.2, 0.12), tide * 0.7);
      paint *= 0.8 + 0.2 * smoothstep(0.0, 0.12, vWPos.y); // grimy skirting
      diffuseColor.rgb *= paint;
    `,
  );
}

function ceilingMaterial() {
  return worldPosShader(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, side: THREE.DoubleSide }),
    'room-ceiling',
    /* glsl */ `
      vec3 ceil = vec3(0.62, 0.64, 0.62) * (0.88 + 0.15 * fbm(vWPos.xz * 2.5));
      // A brown leak ring right over the shower, and mildew dots over the tub.
      float d = length(vWPos.xz - vec2(-0.25, -0.6)) + (fbm(vWPos.xz * 6.0) - 0.5) * 0.18;
      float ring = bell((d - 0.32) / 0.03) + 0.4 * smoothstep(0.32, 0.1, d);
      ceil = mix(ceil, vec3(0.42, 0.34, 0.2), ring * 0.55);
      float mold = smoothstep(0.22, 0.05, worley(vWPos.xz * 220.0).x) * smoothstep(0.62, 0.75, fbm(vWPos.xz * 5.0)) * step(vWPos.x, 0.0);
      ceil = mix(ceil, vec3(0.08, 0.09, 0.07), mold * 0.8);
      diffuseColor.rgb *= ceil;
    `,
  );
}

export function createRoom(scene) {
  const group = new THREE.Group();
  group.name = 'Room';
  const { minX, maxX, minZ, maxZ, height } = ROOM;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), floorMaterial());
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0.0, cz);
  floor.receiveShadow = true;
  group.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), ceilingMaterial());
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(cx, height, cz);
  ceiling.receiveShadow = true;
  group.add(ceiling);

  // Four walls as the inside of an open-topped box.
  const plaster = plasterMaterial();
  const none = new THREE.MeshBasicMaterial({ visible: false });
  // Box faces in order: +x, -x, top, bottom, +z, -z. Top and bottom are the ceiling and floor above.
  const walls = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), [plaster, plaster, none, none, plaster, plaster]);
  walls.position.set(cx, height / 2, cz);
  walls.receiveShadow = true;
  group.add(walls);

  // Baseboard along the room's walls, outside the stall.
  const baseboardMaterial = new THREE.MeshStandardMaterial({ color: 0x1d1c1a, roughness: 0.5 });
  const addBoard = (length, x, z, rotY) => {
    const board = new THREE.Mesh(new THREE.BoxGeometry(length, 0.09, 0.012), baseboardMaterial);
    board.position.set(x, 0.045, z);
    board.rotation.y = rotY;
    group.add(board);
  };
  addBoard(maxX, maxX / 2, minZ + 0.006, 0);
  addBoard(depth, maxX - 0.006, cz, Math.PI / 2);
  addBoard(width, cx, maxZ - 0.006, 0);

  // The fixture the spill light comes from: a frosted glass dome on a metal ring.
  const fixture = new THREE.Group();
  fixture.position.set(1.05, height, -0.75);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xe8eef5, emissive: 0xcfe2ff, emissiveIntensity: 2.2, roughness: 0.6 }),
  );
  dome.scale.y = 0.42;
  fixture.add(dome);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.008, 8, 40), new THREE.MeshStandardMaterial({ color: 0x9a968a, metalness: 1, roughness: 0.4 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.004;
  fixture.add(ring);
  group.add(fixture);

  scene.add(group);
  return { group, fixtureGlass: dome.material };
}
