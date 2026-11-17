import * as THREE from 'three';
import { createSpider } from './spiderModel.js';
import { surfaceRotation } from './spawnPoints.js';
import { samplePath } from './spiderPaths.js';
import { isPeripheral } from './peripheral.js';
import {
  SPAWN_MIN,
  SPAWN_MAX,
  SPAWN_PERIPHERAL_WEIGHT,
  SPRAY_KILL_TIME,
  SPIDER_SIZE,
  SPIDER_HIT_RADIUS,
  SPIDER_DEATH_TIME,
  SPIDER_SPRAYED_PANIC,
  SPIDER_TURN_SPEED,
  STAGE_TIME,
  APPROACH_STAGES,
  SKITTER_SPEED,
  SKITTER_BURST_MIN,
  SKITTER_BURST_MAX,
  SKITTER_PAUSE_MIN,
  SKITTER_PAUSE_MAX,
  SKITTER_LEG_SPEED,
  SPAWN_MIN_END,
  SPAWN_MAX_END,
  STAGE_TIME_END,
  START_STAGE_START,
  START_STAGE_END,
  DECOY_CHANCE,
  AUDIO_LIE_CHANCE,
} from './config.js';

const randomBurst = () => THREE.MathUtils.randFloat(SKITTER_BURST_MIN, SKITTER_BURST_MAX);
const randomPause = () => THREE.MathUtils.randFloat(SKITTER_PAUSE_MIN, SKITTER_PAUSE_MAX);

// How far ahead on the path a spider looks to decide which way to face, in meters.
const LOOK_AHEAD = 0.02;

/** Creates, moves, damages and removes spiders. Knows nothing about the mouse or the can. */
export function createSpiders(scene, camera, { onKill, onReachedPlayer, onSkitter, onLateSpawn, trySpawnDecoy }) {
  let spawnPoints = [];
  let spawning = false;
  let frozen = false; // true during endings: spiders keep twitching but stop advancing
  let timer = 0;
  let escalation = 0; // 0 = first routine step, 1 = last routine step
  const spiders = [];
  const pathPosition = new THREE.Vector3();
  const pathNormal = new THREE.Vector3();
  const aheadPosition = new THREE.Vector3();
  const aheadNormal = new THREE.Vector3();

  const escalated = (start, end) => THREE.MathUtils.lerp(start, end, escalation);
  const stageDistance = (point, stage) => point.path.length * (stage / APPROACH_STAGES);

  function randomWait() {
    return THREE.MathUtils.randFloat(escalated(SPAWN_MIN, SPAWN_MIN_END), escalated(SPAWN_MAX, SPAWN_MAX_END));
  }

  /** Which stage a new spider starts at. In-between values round up or down at random. */
  function rollStartStage() {
    const stage = Math.floor(escalated(START_STAGE_START, START_STAGE_END) + Math.random());
    return Math.min(stage, APPROACH_STAGES - 1);
  }

  /** Weighted random pick from the free spawn points, favoring peripheral ones. */
  function pickSpawnPoint(startStage) {
    const free = spawnPoints.filter((p) => !p.occupied);
    if (free.length === 0) return null;

    const weights = free.map((p) => {
      samplePath(p.path, stageDistance(p, startStage), pathPosition, pathNormal);
      return isPeripheral(camera, pathPosition) ? SPAWN_PERIPHERAL_WEIGHT : 1;
    });
    let roll = Math.random() * weights.reduce((sum, w) => sum + w, 0);
    for (let i = 0; i < free.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return free[i];
    }
    return free[free.length - 1];
  }

  function setHitSphere(spider, position, normal) {
    spider.hitSphere.center.copy(position).addScaledVector(normal, SPIDER_SIZE * 0.4);
  }

  /** Sometimes returns another spawn point's position, so the player hears the spider in the wrong place. */
  function rollSoundLie(point) {
    if (Math.random() >= AUDIO_LIE_CHANCE) return null;
    const others = spawnPoints.filter((p) => p !== point);
    if (others.length === 0) return null;
    return others[Math.floor(Math.random() * others.length)].position;
  }

  function playSkitter(spider) {
    onSkitter(spider.soundFrom ?? spider.model.position);
  }

  function spawn() {
    if (Math.random() < DECOY_CHANCE && trySpawnDecoy()) return;

    const startStage = rollStartStage();
    const point = pickSpawnPoint(startStage);
    if (point) spawnAt(point, startStage);
  }

  function spawnAt(point, startStage) {
    const startDistance = stageDistance(point, startStage);
    samplePath(point.path, startDistance, pathPosition, pathNormal);
    const model = createSpider();
    model.position.copy(pathPosition);
    if (startStage === 0) {
      model.quaternion.copy(point.quaternion);
    } else {
      samplePath(point.path, startDistance + LOOK_AHEAD, aheadPosition, aheadNormal);
      model.quaternion.copy(surfaceRotation(pathNormal, pathPosition, aheadPosition));
    }
    scene.add(model);
    point.occupied = true;

    const spider = {
      model,
      point,
      hitSphere: new THREE.Sphere(new THREE.Vector3(), SPIDER_HIT_RADIUS),
      sprayTaken: 0,
      sprayedThisFrame: false,
      animationTime: Math.random() * 100,
      deathTime: null, // seconds into the death animation, null while alive
      stage: startStage, // how many approach moves it has started
      stageTimer: 0, // seconds rested at the current stage
      travelled: startDistance, // meters moved along the path
      stageTarget: startDistance, // meters along the path where the current move ends
      burstLeft: 0,
      pauseLeft: 0,
      inBurst: false,
      soundFrom: rollSoundLie(point), // where its skitter is heard from, null = the spider itself
    };
    setHitSphere(spider, pathPosition, pathNormal);
    spiders.push(spider);
    playSkitter(spider);
    if (startStage > 0) onLateSpawn();
  }

  function remove(spider) {
    scene.remove(spider.model);
    spider.point.occupied = false;
    // Every spider shares one mesh and one set of materials (see src/art/spiderModel.js), so only
    // throw away things that belong to this spider alone.
    spider.model.traverse((obj) => {
      if (obj.userData.shared) return;
      obj.geometry?.dispose();
      obj.material?.dispose?.();
    });
  }

  function moveAlongPath(spider, dt) {
    const { path } = spider.point;
    spider.travelled = Math.min(spider.stageTarget, spider.travelled + SKITTER_SPEED * dt);
    samplePath(path, spider.travelled, pathPosition, pathNormal);
    spider.model.position.copy(pathPosition);
    setHitSphere(spider, pathPosition, pathNormal);

    if (spider.travelled < path.length - LOOK_AHEAD / 4) {
      samplePath(path, spider.travelled + LOOK_AHEAD, aheadPosition, aheadNormal);
      const facing = surfaceRotation(pathNormal, pathPosition, aheadPosition);
      spider.model.quaternion.slerp(facing, 1 - Math.exp(-SPIDER_TURN_SPEED * dt));
    }
  }

  /** Rest at a stage, then skitter to the next one in bursts. */
  function approach(spider, dt) {
    spider.inBurst = false;

    if (spider.travelled >= spider.stageTarget) {
      if (spider.stage === APPROACH_STAGES) {
        onReachedPlayer();
        return;
      }
      spider.stageTimer += dt;
      if (spider.stageTimer >= escalated(STAGE_TIME, STAGE_TIME_END)) {
        spider.stageTimer = 0;
        spider.stage++;
        spider.stageTarget = stageDistance(spider.point, spider.stage);
        spider.burstLeft = randomBurst();
        spider.pauseLeft = 0;
        spider.soundFrom = rollSoundLie(spider.point);
        playSkitter(spider);
      }
      return;
    }

    if (spider.pauseLeft > 0) {
      spider.pauseLeft -= dt;
      if (spider.pauseLeft <= 0) playSkitter(spider);
      return;
    }

    spider.inBurst = true;
    moveAlongPath(spider, dt);
    spider.burstLeft -= dt;
    if (spider.burstLeft <= 0) {
      spider.burstLeft = randomBurst();
      spider.pauseLeft = randomPause();
    }
  }

  function update(dt) {
    if (spawning && !frozen) {
      timer -= dt;
      if (timer <= 0) {
        spawn();
        timer = randomWait();
      }
    }

    for (let i = spiders.length - 1; i >= 0; i--) {
      const spider = spiders[i];
      if (spider.deathTime === null) {
        if (!frozen) approach(spider, dt);
        let legSpeed = 1;
        if (spider.sprayedThisFrame) legSpeed = SPIDER_SPRAYED_PANIC;
        else if (spider.inBurst) legSpeed = SKITTER_LEG_SPEED;
        spider.animationTime += dt * legSpeed;
        const sprayed = spider.sprayedThisFrame;
        spider.sprayedThisFrame = false;
        spider.model.update(spider.animationTime, { moving: spider.inBurst, sprayed });
      } else {
        spider.deathTime += dt;
        const t = Math.min(spider.deathTime / SPIDER_DEATH_TIME, 1);
        spider.model.setDeathPose(t);
        if (t >= 1) {
          remove(spider);
          spiders.splice(i, 1);
        }
      }
    }
  }

  /** Adds spray to one spider, killing it once it has taken enough. */
  function applySpray(spider, dt) {
    spider.sprayedThisFrame = true;
    spider.sprayTaken += dt;
    if (spider.sprayTaken >= SPRAY_KILL_TIME) {
      spider.deathTime = 0;
      onKill();
    }
  }

  const getLiving = () => spiders.filter((s) => s.deathTime === null);

  /** Debug: kills every living spider at once. */
  function killAll() {
    for (const spider of getLiving()) {
      spider.deathTime = 0;
      onKill();
    }
  }

  /** The living spider closest to a world position, or null if there are none. */
  function getNearest(position) {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const spider of getLiving()) {
      const distance = spider.hitSphere.center.distanceTo(position);
      if (distance < nearestDistance) {
        nearest = spider;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  function reset() {
    spiders.forEach(remove);
    spiders.length = 0;
    spawning = false;
    frozen = false;
    timer = 0;
    escalation = 0;
  }

  return {
    setSpawnPoints: (points) => { spawnPoints = points; },
    startSpawning: () => {
      spawning = true;
      timer = randomWait();
    },
    setFrozen: (value) => { frozen = value; },
    setEscalation: (value) => { escalation = value; },
    spawnAt,
    killAll,
    getLiving,
    getNearest,
    update,
    applySpray,
    reset,
  };
}
