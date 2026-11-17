import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLSL_NOISE, canvasTexture } from './bake.js';
import { VANITY_POSITION, VANITY_ROTATION_DEGREES, RAID_CAN_SPOT_FALLBACK, REFLECTION_STRENGTH } from '../config.js';

/*
 * THE VANITY OUTSIDE THE CURTAIN
 *
 * A small bathroom cabinet with a sink, standing against the back wall just past the tub, so
 * you see it through the curtain gap. On top: the Raid can (put there by raidCan.js), a folded
 * towel (the target of "Grab the towel"), a toothbrush cup and a bar of hand soap. Above it, a
 * medicine cabinet whose mirror is fogged over with condensation. The mirror deliberately does
 * NOT reflect the scene: a real reflection would show the player's body, and the game never
 * shows a torso. The fog makes a blurry, fake reflection believable.
 *
 * Measurements are in meters. The cabinet is built around its own origin (floor level, center
 * of the back edge) and then placed with VANITY_POSITION / VANITY_ROTATION_DEGREES.
 */

const WIDTH = 0.62;
const DEPTH = 0.46;
const BODY_HEIGHT = 0.8;
const TOP_THICKNESS = 0.03;
export const COUNTER_HEIGHT = BODY_HEIGHT + TOP_THICKNESS;

function worldPos(material, key, chunk, anchor = '#include <map_fragment>') {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\n${GLSL_NOISE}`)
      .replace(anchor, `${anchor}\n${chunk}`);
  };
  material.customProgramCacheKey = () => key;
  return material;
}

/** Old painted wood: grey-green paint, grubby near the floor and around the handles. */
function paintMaterial() {
  return worldPos(
    new THREE.MeshStandardMaterial({ color: 0x7f8d84, roughness: 0.55 }),
    'vanity-paint',
    /* glsl */ `
      float grime = smoothstep(0.25, 0.0, vWPos.y) * 0.5 + fbm(vWPos.xy * 14.0 + vWPos.z * 9.0) * 0.18;
      float grain = vnoise(vec2(vWPos.x * 6.0, vWPos.y * 220.0 + vWPos.z * 40.0));
      diffuseColor.rgb *= (1.0 - grime) * (0.96 + 0.06 * grain);`,
  );
}

/** Cultured marble: off-white with soft grey veins and a glossy coat. */
function marbleMaterial() {
  return worldPos(
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: REFLECTION_STRENGTH }),
    'vanity-marble',
    /* glsl */ `
      vec2 mp = vWPos.xz * 7.0;
      float vein = abs(sin(mp.x * 3.0 + fbm(mp * 1.3) * 6.0 + mp.y * 1.5));
      vein = smoothstep(0.0, 0.08, vein);
      vec3 marble = mix(vec3(0.62, 0.62, 0.6), vec3(0.88, 0.87, 0.83), vein);
      marble *= 0.94 + 0.08 * fbm(mp * 4.0);
      diffuseColor.rgb *= marble;`,
  );
}

function chromeKnob(chrome) {
  const knob = new THREE.Mesh(
    new THREE.LatheGeometry([[0, 0], [0.006, 0], [0.006, 0.006], [0.004, 0.012], [0.011, 0.018], [0.012, 0.024], [0.008, 0.028], [0, 0.029]]
      .map(([r, y]) => new THREE.Vector2(r, y)), 20),
    chrome,
  );
  knob.rotation.x = Math.PI / 2;
  return knob;
}

function createBody(paint, chrome) {
  const group = new THREE.Group();
  const shadowy = (mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };
  // Carcass with a recessed toe-kick at the bottom.
  const carcass = shadowy(new THREE.Mesh(new RoundedBoxGeometry(WIDTH, BODY_HEIGHT - 0.08, DEPTH - 0.02, 2, 0.004), paint));
  carcass.position.set(0, 0.08 + (BODY_HEIGHT - 0.08) / 2, DEPTH / 2 - 0.01);
  group.add(carcass);
  const kick = new THREE.Mesh(new THREE.BoxGeometry(WIDTH - 0.04, 0.08, DEPTH - 0.08), new THREE.MeshStandardMaterial({ color: 0x141513, roughness: 0.8 }));
  kick.position.set(0, 0.04, DEPTH / 2 - 0.05);
  group.add(kick);

  const front = DEPTH - 0.01;
  // Shaker doors: a frame of four rails around a sunken panel.
  const door = (cx) => {
    const d = new THREE.Group();
    const w = WIDTH / 2 - 0.02;
    const h = 0.52;
    const rail = 0.045;
    const parts = [
      [w, rail, 0, h / 2 - rail / 2], [w, rail, 0, -h / 2 + rail / 2],
      [rail, h - rail * 2, -w / 2 + rail / 2, 0], [rail, h - rail * 2, w / 2 - rail / 2, 0],
    ];
    for (const [pw, ph, px, py] of parts) {
      const p = shadowy(new THREE.Mesh(new RoundedBoxGeometry(pw, ph, 0.02, 2, 0.003), paint));
      p.position.set(px, py, 0.01);
      d.add(p);
    }
    const panel = shadowy(new THREE.Mesh(new RoundedBoxGeometry(w - rail * 2 + 0.004, h - rail * 2 + 0.004, 0.012, 2, 0.002), paint));
    panel.position.z = 0.004;
    d.add(panel);
    const knob = chromeKnob(chrome);
    knob.position.set(cx < 0 ? w / 2 - 0.04 : -w / 2 + 0.04, h / 2 - 0.08, 0.02);
    d.add(knob);
    d.position.set(cx, 0.1 + h / 2, front);
    return d;
  };
  group.add(door(-WIDTH / 4), door(WIDTH / 4));

  // Drawer with a bar pull.
  const drawer = shadowy(new THREE.Mesh(new RoundedBoxGeometry(WIDTH - 0.03, 0.13, 0.022, 2, 0.003), paint));
  drawer.position.set(0, 0.705, front + 0.011);
  group.add(drawer);
  const pull = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.12, 12), chrome);
  pull.rotation.z = Math.PI / 2;
  pull.position.set(0, 0.705, front + 0.04);
  group.add(pull);
  for (const x of [-0.055, 0.055]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.02, 10), chrome);
    post.rotation.x = Math.PI / 2;
    post.position.set(x, 0.705, front + 0.03);
    group.add(post);
  }
  return group;
}

const BASIN = { x: 0.13, z: 0.24, rx: 0.15, rz: 0.12, depth: 0.13 };

function createTop(marble, chrome) {
  const group = new THREE.Group();
  // The countertop: a rounded slab with an oval hole for the sink, extruded downward.
  const shape = new THREE.Shape();
  const hw = WIDTH / 2 + 0.012;
  const d = DEPTH + 0.02;
  shape.moveTo(-hw, 0);
  shape.lineTo(hw, 0);
  shape.lineTo(hw, d - 0.02);
  shape.quadraticCurveTo(hw, d, hw - 0.02, d);
  shape.lineTo(-hw + 0.02, d);
  shape.quadraticCurveTo(-hw, d, -hw, d - 0.02);
  shape.lineTo(-hw, 0);
  const hole = new THREE.Path();
  hole.absellipse(BASIN.x, BASIN.z, BASIN.rx, BASIN.rz, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const slab = new THREE.ExtrudeGeometry(shape, { depth: TOP_THICKNESS - 0.006, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 3, curveSegments: 40 });
  slab.rotateX(Math.PI / 2); // shape's y becomes +z (toward the front), extrusion goes down
  slab.translate(0, COUNTER_HEIGHT - 0.003, 0);
  const top = new THREE.Mesh(slab, marble);
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);

  // Sink bowl: a lathe-shaped dish, squashed into an oval to fit the hole.
  const bowlProfile = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * (Math.PI / 2);
    bowlProfile.push(new THREE.Vector2(Math.sin(a) * 1.0, -Math.cos(a) * 1.0));
  }
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(bowlProfile, 40), new THREE.MeshPhysicalMaterial({
    color: 0xe2e0d8, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.BackSide, envMapIntensity: REFLECTION_STRENGTH,
  }));
  bowl.scale.set(BASIN.rx, BASIN.depth, BASIN.rz);
  bowl.position.set(BASIN.x, COUNTER_HEIGHT - 0.004, BASIN.z);
  bowl.receiveShadow = true;
  group.add(bowl);
  const drain = new THREE.Mesh(new THREE.CircleGeometry(0.016, 20), chrome);
  drain.rotation.x = -Math.PI / 2;
  drain.position.set(BASIN.x, COUNTER_HEIGHT - BASIN.depth + 0.001, BASIN.z);
  group.add(drain);

  // Backsplash.
  const splash = new THREE.Mesh(new RoundedBoxGeometry(WIDTH + 0.024, 0.09, 0.018, 2, 0.003), marble);
  splash.position.set(0, COUNTER_HEIGHT + 0.045, 0.009);
  splash.castShadow = true;
  group.add(splash);

  // Faucet: a curved spout and two cross handles on the deck behind the bowl.
  const spoutPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.07, 0.005), new THREE.Vector3(0, 0.1, 0.045), new THREE.Vector3(0, 0.085, 0.095),
  ]);
  const spout = new THREE.Mesh(new THREE.TubeGeometry(spoutPath, 24, 0.0085, 12, false), chrome);
  spout.position.set(BASIN.x, COUNTER_HEIGHT, 0.06);
  group.add(spout);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.012, 24), chrome);
  base.position.set(BASIN.x, COUNTER_HEIGHT + 0.006, 0.06);
  group.add(base);
  for (const side of [-1, 1]) {
    const handle = new THREE.Group();
    handle.position.set(BASIN.x + side * 0.085, COUNTER_HEIGHT, 0.06);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.012, 0.035, 16), chrome);
    stem.position.y = 0.0175;
    handle.add(stem);
    for (let k = 0; k < 4; k++) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.0045, 0.03, 4, 8), chrome);
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = (k * Math.PI) / 2 + 0.3;
      arm.position.y = 0.036;
      handle.add(arm);
    }
    group.add(handle);
  }
  return group;
}

function terryTexture() {
  // Tiny loops of terry cloth, as a bumpy color texture that also serves as roughness.
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#d9d6cc';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const v = 170 + Math.random() * 80;
      ctx.fillStyle = `rgb(${v},${v - 4},${v - 12})`;
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, 0.8 + Math.random() * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // A woven border stripe.
    ctx.fillStyle = 'rgba(46, 92, 98, 0.85)';
    ctx.fillRect(0, h * 0.78, w, h * 0.05);
    ctx.fillRect(0, h * 0.86, w, h * 0.015);
  });
}

/**
 * A towel folded in thirds and laid flat. It's three stacked layers, each a soft slab whose
 * folded side is fully rounded (where the cloth turns over) and whose other side is thin and
 * squared off (the loose edges). Slightly offset, sagging and lumpy, like it was folded by hand.
 */
export function createFoldedTowel() {
  const width = 0.25;
  const depth = 0.17;
  const layerThickness = 0.017;
  const map = terryTexture();
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1.6, 1.1);
  const material = new THREE.MeshStandardMaterial({ map, color: 0x9fb9b8, roughness: 0.97, bumpMap: map, bumpScale: 1.6 });

  const group = new THREE.Group();
  group.name = 'Towel';
  for (let layer = 0; layer < 3; layer++) {
    const geometry = new RoundedBoxGeometry(width - layer * 0.004, layerThickness, depth - layer * 0.003, 5, layerThickness * 0.49);
    const position = geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i);
      // The front (+z) is the fold: keep it round. The back edge pinches thin, like loose cloth.
      const back = THREE.MathUtils.smoothstep(-v.z, depth * 0.3, depth * 0.5);
      v.y *= 1 - 0.45 * back;
      // Lumps and a slight sag in the middle.
      v.y += 0.0025 * Math.sin(v.x * 37 + layer) * Math.cos(v.z * 29 - layer) - 0.004 * Math.exp(-(v.x * v.x) * 60) * (v.y > 0 ? 1 : 0);
      v.x += 0.003 * Math.sin(v.z * 25 + layer * 2);
      position.setXYZ(i, v.x, v.y, v.z);
    }
    geometry.computeVertexNormals();
    const slab = new THREE.Mesh(geometry, material);
    slab.position.set((layer - 1) * 0.003, layerThickness * (layer + 0.5) * 0.92, (layer % 2) * 0.004);
    slab.castShadow = true;
    slab.receiveShadow = true;
    group.add(slab);
  }
  return group;
}

function toothbrushCup() {
  const group = new THREE.Group();
  const cup = new THREE.Mesh(
    new THREE.LatheGeometry([[0, 0.002], [0.026, 0], [0.028, 0.004], [0.031, 0.1], [0.028, 0.1], [0.025, 0.006], [0, 0.008]].map(([r, y]) => new THREE.Vector2(r, y)), 32),
    new THREE.MeshPhysicalMaterial({ color: 0xbfd0d4, roughness: 0.15, transmission: 0.6, thickness: 0.003, transparent: true, opacity: 0.8 }),
  );
  group.add(cup);
  const colors = [0xd9534f, 0x3a7bbf];
  colors.forEach((color, i) => {
    const brush = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.0045, 0.16, 4, 8), new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 0.6 }));
    handle.position.y = 0.09;
    brush.add(handle);
    const bristles = new THREE.Mesh(new RoundedBoxGeometry(0.009, 0.026, 0.011, 2, 0.003), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.9 }));
    bristles.position.set(0, 0.165, 0.007);
    brush.add(bristles);
    brush.position.set(i ? 0.008 : -0.008, 0.004, 0);
    brush.rotation.z = i ? -0.18 : 0.22;
    brush.rotation.x = i ? 0.1 : -0.08;
    group.add(brush);
  });
  return group;
}

function handSoap() {
  const group = new THREE.Group();
  const dish = new THREE.Mesh(
    new THREE.LatheGeometry([[0, 0], [0.04, 0], [0.05, 0.006], [0.052, 0.012], [0.048, 0.012], [0.04, 0.005], [0, 0.005]].map(([r, y]) => new THREE.Vector2(r, y)), 28),
    new THREE.MeshPhysicalMaterial({ color: 0xd8d4c8, roughness: 0.3, clearcoat: 0.8 }),
  );
  dish.scale.z = 0.72;
  group.add(dish);
  const soap = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.018, 0.04, 4, 0.008), new THREE.MeshPhysicalMaterial({ color: 0xe9dcc4, roughness: 0.4, clearcoat: 0.4 }));
  soap.position.y = 0.014;
  soap.rotation.y = 0.3;
  group.add(soap);
  return group;
}

function condensationTexture() {
  // White = fogged glass. Clear streaks where drops ran down, and beads scattered across.
  return canvasTexture(512, 640, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0.92)');
    g.addColorStop(1, 'rgba(255,255,255,0.78)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Uneven fog: blotches.
    for (let i = 0; i < 60; i++) {
      const r = 30 + Math.random() * 90;
      const x = Math.random() * w;
      const y = Math.random() * h;
      const blot = ctx.createRadialGradient(x, y, 0, x, y, r);
      blot.addColorStop(0, `rgba(0,0,0,${Math.random() * 0.25})`);
      blot.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = blot;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Drip trails: clear wandering lines with a bead at the bottom.
    for (let i = 0; i < 22; i++) {
      let x = Math.random() * w;
      let y = Math.random() * h * 0.4;
      const len = h * (0.2 + Math.random() * 0.6);
      const width = 2 + Math.random() * 3.5;
      ctx.fillStyle = 'rgba(0,0,0,0.95)';
      for (let s = 0; s < len; s += 2) {
        x += (Math.random() - 0.5) * 1.2;
        ctx.fillRect(x - width / 2, y + s, width, 3);
      }
      ctx.beginPath();
      ctx.arc(x, y + len, width * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Beads: little clear dots.
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.5 + Math.random() * 0.5})`;
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, 0.6 + Math.random() * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }, { color: false });
}

function createMedicineCabinet(paint, chrome, chromeEnv) {
  const group = new THREE.Group();
  const w = 0.5;
  const h = 0.62;
  const d = 0.11;
  const box = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 0.006), paint);
  box.position.set(0, h / 2, d / 2);
  box.castShadow = true;
  group.add(box);
  // Chrome frame around the mirror door.
  const frameT = 0.014;
  for (const [fw, fh, fx, fy] of [[w, frameT, 0, h / 2 - frameT / 2], [w, frameT, 0, -h / 2 + frameT / 2], [frameT, h, -w / 2 + frameT / 2, 0], [frameT, h, w / 2 - frameT / 2, 0]]) {
    const f = new THREE.Mesh(new RoundedBoxGeometry(fw, fh, 0.01, 2, 0.003), chrome);
    f.position.set(fx, h / 2 + fy, d + 0.005);
    group.add(f);
  }
  // The mirror: polished metal reflecting the made-up environment, never the real scene.
  const mirror = new THREE.Mesh(
    new THREE.PlaneGeometry(w - frameT * 2, h - frameT * 2),
    new THREE.MeshStandardMaterial({ color: 0xc8ced2, metalness: 1, roughness: 0.08, envMap: chromeEnv, envMapIntensity: 0.9 }),
  );
  mirror.position.set(0, h / 2, d + 0.004);
  group.add(mirror);
  // Condensation: a fogged layer over the glass that diffuses light, clear where drops ran down.
  const fogMap = condensationTexture();
  const fog = new THREE.Mesh(
    new THREE.PlaneGeometry(w - frameT * 2, h - frameT * 2),
    new THREE.MeshStandardMaterial({ color: 0xc9d2d6, alphaMap: fogMap, transparent: true, roughness: 0.75, depthWrite: false }),
  );
  fog.position.set(0, h / 2, d + 0.0055);
  group.add(fog);
  return group;
}

/**
 * Builds the vanity outside the tub. Returns where the Raid can stands (world space), from a
 * Blender Empty named "RaidCanSpot" if there is one.
 */
export function createCabinet(scene, level, chrome, chromeEnv) {
  const vanity = new THREE.Group();
  vanity.name = 'Vanity';
  vanity.position.set(VANITY_POSITION[0], 0, VANITY_POSITION[1]);
  vanity.rotation.y = THREE.MathUtils.degToRad(VANITY_ROTATION_DEGREES);

  const paint = paintMaterial();
  const marble = marbleMaterial();
  vanity.add(createBody(paint, chrome));
  vanity.add(createTop(marble, chrome));

  // Props on the counter, in the cabinet's own space (x across, z out from the wall).
  const onTop = (object, x, z, turn = 0) => {
    object.position.set(x, COUNTER_HEIGHT, z);
    object.rotation.y = turn;
    object.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    vanity.add(object);
    return object;
  };
  onTop(toothbrushCup(), 0.285, 0.1, 0.4);
  onTop(handSoap(), 0.25, 0.4, -0.2);

  const cabinet = createMedicineCabinet(paint, chrome, chromeEnv);
  cabinet.position.set(0, COUNTER_HEIGHT + 0.25, 0);
  vanity.add(cabinet);

  scene.add(vanity);
  vanity.updateMatrixWorld(true);

  // The towel is a gaze target, so it must live inside the level the gaze ray checks.
  // If Blender already has a "Towel" object, that one is the target and this one isn't added.
  let towel = level.getObjectByName('Towel');
  if (!towel) {
    towel = createFoldedTowel();
    const towelSpot = new THREE.Vector3(-0.17, COUNTER_HEIGHT, 0.12).applyMatrix4(vanity.matrixWorld);
    towel.position.copy(towelSpot);
    towel.rotation.y = vanity.rotation.y + 0.06;
    level.add(towel);
  }

  // Where the can stands: a Blender Empty if there is one, otherwise on the counter's tub-side corner.
  const empty = level.getObjectByName('RaidCanSpot');
  let canSpot;
  if (empty) {
    canSpot = empty.getWorldPosition(new THREE.Vector3());
  } else {
    console.warn(
      'No "RaidCanSpot" Empty in bathtub.glb, using RAID_CAN_SPOT_FALLBACK from config.js. '
      + `In Blender: Add > Empty > Plain Axes, name it RaidCanSpot, and place it on the vanity top at about X ${RAID_CAN_SPOT_FALLBACK[0]}, `
      + `Y ${(-RAID_CAN_SPOT_FALLBACK[2]).toFixed(2)}, Z ${COUNTER_HEIGHT.toFixed(2)} (Blender's Y and Z are this game's -Z and Y).`,
    );
    canSpot = new THREE.Vector3(RAID_CAN_SPOT_FALLBACK[0], COUNTER_HEIGHT, RAID_CAN_SPOT_FALLBACK[2]);
  }
  return { vanity, towel, canSpot, counterHeight: COUNTER_HEIGHT };
}
