import * as THREE from 'three';
import { createSprayGauge } from '../placeholders/sprayGauge.js';
import { canvasTexture } from './bake.js';
import { setLayerDeep, VIEWMODEL_LAYER, WORLD_LAYER } from './layers.js';
import {
  CAN_POSITION,
  CAN_ROTATION,
  CAN_SWAY_AMOUNT,
  CAN_SWAY_SPEED,
  CAN_SPRAY_SHAKE,
  CAN_GAZE_RADIUS,
  CAN_LOWERED_DROP,
  CAN_REACH_OUT_TIME,
  CAN_PULL_BACK_TIME,
} from '../config.js';

/*
 * THE RAID CAN
 *
 * The body is a lathe: the outline of half a can (concave bottom, straight wall, domed shoulder,
 * the rolled rim crimped around the valve cup) spun around its center line. The printed label
 * is a cylinder sleeve with a canvas texture wrapped all the way round. On top: the actuator
 * button with its nozzle. The clear overcap is left standing on the vanity once you grab the can.
 *
 * Grabbing happens in stages, so a hand can come out through the curtain gap to fetch it:
 *   'idle'      on the vanity, waiting for the gaze step,
 *   'reaching'  the hand travels out to the can (the can stays put),
 *   'pulling'   the can travels back with the hand to where you hold it,
 *   'held'      in your hand, drawn on the viewmodel layer, ready to spray.
 * The game only treats the can as "in hand" (spray works, spiders come) once it's 'held'.
 *
 * The root is named "RaidCan" so the gaze step can find it.
 */

const RADIUS = 0.033;
// A point in the middle of the curtain gap (world space). The hand and the can both travel along a
// curve through it, so they never pass through the curtain on the way out or back.
export const GAP_POINT = new THREE.Vector3(-0.07, 1.12, -1.12);
const gapLocal = new THREE.Vector3();
/** Quadratic curve from a to c bending toward b, at t (0..1). */
export function curveThrough(a, b, c, t, target) {
  const u = 1 - t;
  return target.set(0, 0, 0).addScaledVector(a, u * u).addScaledVector(b, 2 * u * t).addScaledVector(c, t * t);
}
const BOTTOM_OFFSET = 0.11; // from the can's base to its center (the root's origin)
const v2 = (points) => points.map(([r, y]) => new THREE.Vector2(r, y - BOTTOM_OFFSET));

function drawLabel() {
  // 1024 x 812 matches the label's real shape (its circumference is 1.26 times its height), so text isn't stretched.
  return canvasTexture(1024, 812, (ctx, w, h) => {
    // Red lithographed can with a white band, the word RAID, and directions on the back.
    const red = ctx.createLinearGradient(0, 0, 0, h);
    red.addColorStop(0, '#9e0f17');
    red.addColorStop(0.5, '#c4161c');
    red.addColorStop(1, '#8a0c13');
    ctx.fillStyle = red;
    ctx.fillRect(0, 0, w, h);

    // Front panel is the middle of the texture (it wraps round, so u = 0.5 faces the player).
    const cx = w / 2;
    ctx.fillStyle = '#f2ede1';
    ctx.beginPath();
    ctx.moveTo(cx - 240, h * 0.32);
    ctx.lineTo(cx + 240, h * 0.25);
    ctx.lineTo(cx + 240, h * 0.6);
    ctx.lineTo(cx - 240, h * 0.67);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.translate(cx, h * 0.47);
    ctx.rotate(-0.08);
    ctx.font = 'bold 185px Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#111';
    ctx.strokeText('RAID', 0, 0);
    ctx.fillStyle = '#c4161c';
    ctx.fillText('RAID', 0, 0);
    ctx.restore();

    ctx.fillStyle = '#f2ede1';
    ctx.textAlign = 'center';
    ctx.font = 'bold 34px Helvetica, Arial, sans-serif';
    ctx.fillText('SPIDER & INSECT KILLER', cx, h * 0.8);
    ctx.font = '22px Helvetica, Arial, sans-serif';
    ctx.fillText('FAST ACTING  •  NET WT 17.5 OZ (496 g)', cx, h * 0.88);

    // Little spider in a no-entry circle, top of the front panel.
    ctx.save();
    ctx.translate(cx, h * 0.13);
    ctx.strokeStyle = '#f2ede1';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(0, 0, 38, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.ellipse(0, 4, 11, 15, 0, 0, Math.PI * 2);
    ctx.ellipse(0, -14, 8, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, -6 + i * 6);
        ctx.quadraticCurveTo(s * 22, -16 + i * 10, s * 27, -2 + i * 9);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = '#f2ede1';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-27, -27);
    ctx.lineTo(27, 27);
    ctx.stroke();
    ctx.restore();

    // Back of the can (the texture's left and right edges): small print.
    ctx.fillStyle = '#f2ede1';
    ctx.textAlign = 'left';
    ctx.font = 'bold 20px Helvetica, Arial, sans-serif';
    const lines = [
      'DIRECTIONS FOR USE', 'Shake well. Hold can upright.', 'Spray directly on spiders', 'until they stop moving.',
      'Do not use in the shower.', '(Too late.)', '', 'CAUTION: CONTENTS UNDER', 'PRESSURE. KEEP OUT OF', 'REACH OF CHILDREN.',
    ];
    lines.forEach((line, i) => ctx.fillText(line, 30, 120 + i * 34));
    lines.forEach((line, i) => ctx.fillText(line, w - 290, 120 + i * 34));

    // Scuffs and scratches: the can has rolled around a bathroom.
    for (let i = 0; i < 140; i++) {
      ctx.strokeStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.12})`;
      ctx.lineWidth = 0.6 + Math.random();
      const x = Math.random() * w;
      const y = Math.random() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 12);
      ctx.stroke();
    }
    // Rub-through to bare metal along the top and bottom edges.
    for (let i = 0; i < 400; i++) {
      const top = Math.random() < 0.5;
      ctx.fillStyle = `rgba(200,200,205,${Math.random() * 0.5})`;
      ctx.fillRect(Math.random() * w, top ? Math.random() * 10 : h - Math.random() * 10, 1 + Math.random() * 5, 1 + Math.random() * 3);
    }
  });
}

function drawRoughness() {
  // Grey = roughness. Mostly glossy paint, rougher scuffed patches and scratches.
  return canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = 'rgb(70,70,70)';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
      const x = Math.random() * w;
      const y = Math.random() * h;
      g.addColorStop(0, 'rgba(160,160,160,0.6)');
      g.addColorStop(1, 'rgba(160,160,160,0)');
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1 + Math.random() * 2, 0.6);
      ctx.fillStyle = g;
      ctx.fillRect(-30, -30, 60, 60);
      ctx.restore();
    }
    for (let i = 0; i < 120; i++) {
      ctx.strokeStyle = `rgba(200,200,200,${0.3 + Math.random() * 0.4})`;
      ctx.lineWidth = 0.7;
      const x = Math.random() * w;
      const y = Math.random() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 8);
      ctx.stroke();
    }
  }, { color: false });
}

function buildCanModel(chromeEnv) {
  const group = new THREE.Group();
  const tinplate = new THREE.MeshStandardMaterial({ color: 0xcdd0d2, metalness: 1, roughness: 0.3, envMap: chromeEnv, envMapIntensity: 1 });

  // Bare metal body: concave base, chime, wall, domed shoulder, rolled rim, valve cup.
  const metal = new THREE.LatheGeometry(v2([
    [0, 0.009], [0.015, 0.0075], [0.024, 0.0045], [0.0295, 0.0015], [0.031, 0], [0.0325, 0.001], [0.033, 0.004],
    [0.033, 0.176], [0.0328, 0.18], [0.0315, 0.188], [0.0285, 0.197], [0.0235, 0.2045], [0.0185, 0.2095],
    [0.0158, 0.2115], [0.0148, 0.2125], [0.0151, 0.2148], [0.0158, 0.2168], [0.0148, 0.2186], [0.0128, 0.2192],
    [0.0118, 0.2178], [0.0112, 0.2152], [0.0068, 0.2148], [0.0052, 0.2165], [0.0045, 0.2188], [0, 0.219],
  ]), 48);
  const body = new THREE.Mesh(metal, tinplate);
  group.add(body);

  // The printed label, wrapped all the way round the straight part of the can.
  const labelMap = drawLabel();
  const label = new THREE.Mesh(
    new THREE.CylinderGeometry(RADIUS + 0.0003, RADIUS + 0.0003, 0.164, 64, 1, true, Math.PI, Math.PI * 2),
    new THREE.MeshPhysicalMaterial({
      map: labelMap,
      roughnessMap: drawRoughness(),
      roughness: 1,
      metalness: 0.35,
      clearcoat: 0.8,
      clearcoatRoughness: 0.12,
      envMap: chromeEnv,
      envMapIntensity: 0.8,
    }),
  );
  label.position.y = 0.012 + 0.082 - BOTTOM_OFFSET;
  group.add(label);

  // Actuator button: a little white plastic cap with a dished finger pad and a forward nozzle.
  const plastic = new THREE.MeshPhysicalMaterial({ color: 0xece8de, roughness: 0.35, clearcoat: 0.3 });
  const actuator = new THREE.Mesh(new THREE.LatheGeometry(v2([
    [0, 0.2185], [0.0102, 0.2185], [0.0108, 0.2215], [0.011, 0.2315], [0.0098, 0.2342], [0.006, 0.2335], [0, 0.2338],
  ]), 32), plastic);
  group.add(actuator);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0032, 0.007, 14), plastic);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0, 0.2275 - BOTTOM_OFFSET, -0.0125);
  group.add(nozzle);
  const orifice = new THREE.Mesh(new THREE.CircleGeometry(0.0011, 12), new THREE.MeshBasicMaterial({ color: 0x050505 }));
  orifice.position.set(0, 0.2275 - BOTTOM_OFFSET, -0.0161);
  orifice.rotation.y = Math.PI;
  group.add(orifice);

  const nozzleTip = new THREE.Object3D();
  nozzleTip.position.set(0, 0.2275 - BOTTOM_OFFSET, -0.017);
  group.add(nozzleTip);
  group.traverse((obj) => {
    if (obj.isMesh) obj.castShadow = true;
  });
  return { group, nozzleTip };
}

/** The clear overcap, left standing on the vanity. */
function buildCap() {
  const shell = new THREE.LatheGeometry([
    [0.0335, 0], [0.0338, 0.002], [0.0338, 0.052], [0.031, 0.058], [0.02, 0.0605], [0, 0.061],
    [0, 0.0595], [0.0195, 0.059], [0.0298, 0.0565], [0.0326, 0.051], [0.0326, 0.002], [0.0322, 0],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 40);
  const cap = new THREE.Mesh(shell, new THREE.MeshPhysicalMaterial({
    color: 0xece4e4, roughness: 0.12, transmission: 0.9, thickness: 0.002, transparent: true, opacity: 0.6, side: THREE.DoubleSide,
  }));
  cap.name = 'RaidCanCap';
  cap.castShadow = true;
  // Thin plastic: let the gaze ray pass through it, so it never hides the can from the gaze step.
  cap.raycast = () => {};
  return cap;
}

export function createRaidCan(camera, { chromeEnv } = {}) {
  const root = new THREE.Group();
  root.name = 'RaidCan';
  const { group: model, nozzleTip } = buildCanModel(chromeEnv);
  root.add(model);

  // Invisible and wider than the can, so the gaze step doesn't need pixel-perfect aim.
  const gazeTarget = new THREE.Mesh(new THREE.CylinderGeometry(CAN_GAZE_RADIUS, CAN_GAZE_RADIUS, 0.25, 12));
  gazeTarget.position.y = 0.02;
  gazeTarget.visible = false;
  root.add(gazeTarget);

  const cap = buildCap();
  const gauge = createSprayGauge(root);

  const handRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...CAN_ROTATION));
  const handPosition = new THREE.Vector3();
  const pullStartPosition = new THREE.Vector3();
  const pullStartRotation = new THREE.Quaternion();
  const restSpot = new THREE.Vector3();
  const restRotation = new THREE.Quaternion();
  let level = null;
  let phase = 'idle';
  let phaseTime = 0;
  let time = 0;
  let onHeld = () => {};

  /** Puts the can back on the vanity, as part of the room so the gaze ray can find it. */
  function returnToShelf() {
    phase = 'idle';
    phaseTime = 0;
    level.add(root);
    root.position.copy(restSpot);
    root.quaternion.copy(restRotation);
    root.visible = true;
    setLayerDeep(root, WORLD_LAYER);
    gauge.setVisible(false);
  }

  /**
   * @param {THREE.Vector3} spot where the base of the can stands, in world space
   * @param {THREE.Vector3} [faceToward] a point the label should face (the player)
   */
  function placeOnShelf(levelRoot, spot, faceToward = null) {
    level = levelRoot;
    restSpot.copy(spot);
    restSpot.y += BOTTOM_OFFSET;
    const yaw = faceToward ? Math.atan2(faceToward.x - spot.x, faceToward.z - spot.z) : 0;
    restRotation.setFromEuler(new THREE.Euler(0, yaw, 0));
    // The cap stands beside the can, a little behind it from the player's side.
    cap.position.set(spot.x + Math.cos(yaw) * 0.085, spot.y, spot.z - Math.sin(yaw) * 0.085);
    level.add(cap);
    returnToShelf();
  }

  /** Starts the grab: a hand reaches out for the can, then pulls it in. */
  function grab() {
    if (phase !== 'idle') return;
    phase = 'reaching';
    phaseTime = 0;
  }

  /** The hand has the can: from here it travels with the hand back to the holding position. */
  function startPull() {
    camera.attach(root); // keeps it exactly where it is in the world, but now it moves with the camera
    pullStartPosition.copy(root.position);
    pullStartRotation.copy(root.quaternion);
    gapLocal.copy(GAP_POINT);
    camera.worldToLocal(gapLocal);
    phase = 'pulling';
    phaseTime = 0;
  }

  /**
   * @param {boolean} spraying shakes the can
   * @param {number} lowered 0 = raised, 1 = fully out of view
   */
  function update(dt, spraying, lowered) {
    time += dt;
    if (phase === 'idle') return;
    phaseTime += dt;

    if (phase === 'reaching') {
      if (phaseTime >= CAN_REACH_OUT_TIME) startPull();
      return;
    }

    const swayTime = time * CAN_SWAY_SPEED;
    const shake = spraying ? CAN_SPRAY_SHAKE : 0;
    handPosition.set(
      CAN_POSITION[0] + Math.sin(swayTime) * CAN_SWAY_AMOUNT + (Math.random() - 0.5) * shake,
      CAN_POSITION[1] + Math.sin(swayTime * 1.7) * CAN_SWAY_AMOUNT * 0.7 + (Math.random() - 0.5) * shake
        - THREE.MathUtils.smoothstep(lowered, 0, 1) * CAN_LOWERED_DROP,
      CAN_POSITION[2],
    );

    if (phase === 'pulling') {
      const t = Math.min(1, phaseTime / CAN_PULL_BACK_TIME);
      // Ease in and out, with a little lift in the middle so it arcs up over the tub rim.
      const blend = THREE.MathUtils.smootherstep(t, 0, 1);
      curveThrough(pullStartPosition, gapLocal, handPosition, blend, root.position);
      root.quaternion.slerpQuaternions(pullStartRotation, handRotation, blend);
      if (t >= 1) {
        phase = 'held';
        setLayerDeep(root, VIEWMODEL_LAYER);
        gazeTarget.layers.set(WORLD_LAYER);
        gauge.setVisible(true);
        onHeld();
      }
      return;
    }

    root.position.copy(handPosition);
    root.quaternion.copy(handRotation);
  }

  return {
    placeOnShelf,
    placeOnCabinet: placeOnShelf,
    returnToShelf,
    grab,
    update,
    /** Called once the can is fully in hand (spiders start then). */
    setOnHeld: (fn) => { onHeld = fn; },
    isInHand: () => phase === 'held',
    getPhase: () => phase,
    /** 0..1 through the current grab stage. */
    getPhaseProgress: () => (phase === 'reaching' ? phaseTime / CAN_REACH_OUT_TIME : phase === 'pulling' ? phaseTime / CAN_PULL_BACK_TIME : 1),
    getWorldPosition: (target) => root.getWorldPosition(target),
    getNozzleWorldPosition: (target) => nozzleTip.getWorldPosition(target),
    setAmmo: gauge.set,
    setVisible: (visible) => { root.visible = visible; },
    setGaugeVisible: (visible) => gauge.setVisible(visible),
    root,
  };
}
