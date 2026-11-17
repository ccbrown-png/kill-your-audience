import * as THREE from 'three';
import { registerGalleryEntries, stageFraming } from './gallery.js';
import { createRaidCan } from './raidCan.js';
import { createSpider, spiderTriangleCount } from './spiderModel.js';
import { createHands, prebuildHandPoses, HAND_SHAPES, CAN_GRIP } from './hands.js';
import { setLayerDeep, WORLD_LAYER } from './layers.js';
import { createFeet } from '../placeholders/feet.js';

// Gallery entries for each art asset. Each returns { spin(angle), update?(dt) }.
registerGalleryEntries(async ({ camera, art, STAGE }) => ({
  async cabinet() {
    // Orbit in front of the vanity (it stands against a wall, so swing side to side, not all the way round).
    const center = new THREE.Vector3(0.47, 0.95, -1.3);
    return {
      spin(angle) {
        camera.fov = 50;
        const yaw = Math.sin(angle) * 1.05;
        camera.position.set(center.x + Math.sin(yaw) * 1.25, center.y + 0.35, center.z + 0.2 + Math.cos(yaw) * 1.25);
        camera.lookAt(center);
      },
    };
  },

  async can() {
    const can = createRaidCan(camera, { chromeEnv: art.chromeEnv });
    can.root.position.copy(STAGE);
    camera.parent.add(can.root);
    can.setGaugeVisible(false);
    return stageFraming(can.root, 0.42, 0.06);
  },

  async spider(params) {
    // Cycles through standing still, skittering and being sprayed. &pose=idle|walk|sprayed|dead freezes one.
    const spider = createSpider();
    spider.position.copy(STAGE).add(new THREE.Vector3(0, -0.03, 0));
    camera.parent.add(spider);
    console.log(`Spider triangles: ${spiderTriangleCount()}`);
    const fixed = params.get('pose');
    let time = 0;
    const framing = stageFraming(spider, 0.19, 0.07);
    return {
      spin: framing.spin,
      update(dt) {
        const cycle = fixed ?? ['idle', 'walk', 'sprayed'][Math.floor(time / 3) % 3];
        if (cycle === 'dead') {
          spider.setDeathPose(0.3);
          return;
        }
        const speed = cycle === 'walk' ? 6 : cycle === 'sprayed' ? 4 : 1;
        time += dt;
        spider.update(time * speed, { moving: cycle === 'walk', sprayed: cycle === 'sprayed' });
      },
    };
  },

  async hand(params) {
    // The right hand on the turntable, palm toward you at angle 0. Cycles through every pose
    // (2.5 s each), or &pose=NAME holds one. Grip and spray poses hold a can.
    console.log('Hand poses built:', JSON.stringify(prebuildHandPoses()));
    const holder = new THREE.Group();
    holder.position.copy(STAGE);
    camera.parent.add(holder);
    const pivot = new THREE.Camera(); // createHands attaches hands to a "camera"; this one is just a group
    holder.add(pivot);
    const hands = createHands(pivot);
    hands.left.root.visible = false;
    setLayerDeep(hands.right.root, WORLD_LAYER);
    hands.right.root.position.set(0, -0.08, 0);
    const can = createRaidCan(camera, { chromeEnv: art.chromeEnv });
    can.setGaugeVisible(false);
    hands.right.root.add(can.root);
    // Where the can sits in the hand for the grip poses: the inverse of the in-game grip.
    const inverse = new THREE.Matrix4().compose(CAN_GRIP.position, CAN_GRIP.quaternion, new THREE.Vector3(1, 1, 1)).invert();
    inverse.decompose(can.root.position, can.root.quaternion, can.root.scale);
    const names = Object.keys(HAND_SHAPES);
    const fixed = params.get('pose');
    let time = 0;
    const framing = stageFraming(holder, 0.42, 0.02);
    return {
      spin: framing.spin,
      update(dt) {
        time += dt;
        const name = fixed ?? names[Math.floor(time / 2.5) % names.length];
        hands.right.setShape(name);
        hands.right.updateForearm();
        hands.right.root.children.find((c) => c.isMesh && c.geometry.type === 'LatheGeometry').visible = false;
        can.root.visible = name === 'gripCan' || name === 'spray';
      },
    };
  },

  async feet() {
    // The feet stand on the tub floor, so the camera circles them instead of spinning them.
    const level = window.__gallery.level;
    const stand = new THREE.Vector3(-0.39, 1.2, -0.95);
    createFeet(camera.parent, level, stand, new THREE.Vector3(0, 0, -1));
    const center = new THREE.Vector3(stand.x, 0.24, stand.z - 0.08);
    return {
      spin(angle) {
        camera.fov = 45;
        camera.position.set(center.x + Math.sin(angle) * 0.3, center.y + 0.3, center.z + Math.cos(angle) * 0.5); // the tub is narrow, so an oval orbit
        camera.lookAt(center);
      },
    };
  },
}));
