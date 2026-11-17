import * as THREE from 'three';
import { SURFACE_GAP } from './spawnPoints.js';
import {
  SPIDER_PATH_SAMPLES,
  SPIDER_GOAL_PITCH_DEGREES,
  SPIDER_GOAL_SIDE_PREFERENCE,
} from './config.js';

const RING_DIRECTIONS = 32; // how many directions are tried when looking for a finishing spot
const DOWN = new THREE.Vector3(0, -1, 0);
const FLOOR_RAY_HEIGHT = 0.5; // floor rays start this far above the drain, in meters

function hitToSample(hit, rayDirection) {
  const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  if (normal.dot(rayDirection) > 0) normal.negate(); // materials are double-sided
  return { position: hit.point.clone().addScaledVector(normal, SURFACE_GAP), normal };
}

/** Finds the surface beside the player that this spider should finish on, as a direction from the eye. */
function findGoalDirection(spawnDirection, level, eye, raycaster) {
  const flatSpawn = new THREE.Vector3(spawnDirection.x, 0, spawnDirection.z).normalize();
  const pitch = THREE.MathUtils.degToRad(SPIDER_GOAL_PITCH_DEGREES);
  let best = null;
  let bestScore = Infinity;

  for (let i = 0; i < RING_DIRECTIONS; i++) {
    const yaw = (i / RING_DIRECTIONS) * Math.PI * 2;
    const direction = new THREE.Vector3(
      Math.cos(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.sin(yaw) * Math.cos(pitch),
    );
    raycaster.set(eye, direction);
    const hit = raycaster.intersectObject(level, true)[0];
    if (!hit) continue;

    const flat = new THREE.Vector3(direction.x, 0, direction.z).normalize();
    const score = hit.distance + flat.angleTo(flatSpawn) * SPIDER_GOAL_SIDE_PREFERENCE;
    if (score < bestScore) {
      bestScore = score;
      best = direction;
    }
  }
  return best;
}

/** Wall spiders: sweep the view direction from the spawn point to the goal, landing on whatever surface is there. */
function wallSamples(point, level, eye, raycaster) {
  const start = point.position.clone().sub(eye).normalize();
  const goal = findGoalDirection(start, level, eye, raycaster);
  if (!goal) return [];

  const fullTurn = new THREE.Quaternion().setFromUnitVectors(start, goal);
  const none = new THREE.Quaternion();
  const samples = [];
  for (let i = 1; i <= SPIDER_PATH_SAMPLES; i++) {
    const turn = none.clone().slerp(fullTurn, i / SPIDER_PATH_SAMPLES);
    const direction = start.clone().applyQuaternion(turn);
    raycaster.set(eye, direction);
    const hit = raycaster.intersectObject(level, true)[0];
    if (hit) samples.push(hitToSample(hit, direction));
  }
  return samples;
}

/** Drain spider: a straight line across the tub floor to the spot under the player's head. */
function floorSamples(point, level, eye, raycaster) {
  const samples = [];
  const origin = new THREE.Vector3();
  for (let i = 1; i <= SPIDER_PATH_SAMPLES; i++) {
    const t = i / SPIDER_PATH_SAMPLES;
    origin.set(
      THREE.MathUtils.lerp(point.position.x, eye.x, t),
      point.position.y + FLOOR_RAY_HEIGHT,
      THREE.MathUtils.lerp(point.position.z, eye.z, t),
    );
    raycaster.set(origin, DOWN);
    const hit = raycaster.intersectObject(level, true)[0];
    if (hit) samples.push(hitToSample(hit, DOWN));
  }
  return samples;
}

/** Works out where each spawn point's spider travels, and stores it on the point as point.path. */
export function buildSpiderPaths(points, level, eye) {
  level.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();

  for (const point of points) {
    const isDrain = point.name.toLowerCase().includes('drain');
    const surfaceSamples = (isDrain ? floorSamples : wallSamples)(point, level, eye, raycaster);
    if (surfaceSamples.length === 0) console.warn(`${point.name}: no surface found for its approach path.`);

    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(point.quaternion);
    const samples = [{ position: point.position.clone(), normal: up }, ...surfaceSamples];

    const distances = [0];
    for (let i = 1; i < samples.length; i++) {
      distances.push(distances[i - 1] + samples[i].position.distanceTo(samples[i - 1].position));
    }
    point.path = { samples, distances, length: distances[distances.length - 1] };
  }
}

/** Writes the position and surface normal at a given distance along a path. */
export function samplePath(path, distance, outPosition, outNormal) {
  const { samples, distances } = path;
  let i = 1;
  while (i < samples.length - 1 && distances[i] < distance) i++;
  if (samples.length === 1) {
    outPosition.copy(samples[0].position);
    outNormal.copy(samples[0].normal);
    return;
  }
  const span = distances[i] - distances[i - 1];
  const t = span > 0 ? THREE.MathUtils.clamp((distance - distances[i - 1]) / span, 0, 1) : 1;
  outPosition.lerpVectors(samples[i - 1].position, samples[i].position, t);
  outNormal.lerpVectors(samples[i - 1].normal, samples[i].normal, t).normalize();
}
