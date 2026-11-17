// Tunable numbers for playtesting. Change these and save — the page reloads automatically.

// Seconds of continuous gaze needed to complete a routine step.
export const HOLD_TIME = 2.5;

// How fast progress drains when looking away, as a fraction of the fill speed.
// 0.35 = drains at 35% of the speed it fills (so a full bar takes ~7s to empty).
export const DECAY_RATE = 0.35;

// Downward look angle in degrees that counts as "looking down" (0 = level, -90 = straight down).
export const LOOK_DOWN_ANGLE = -50;

// --- Spider ---

// Overall spider scale in meters, roughly the body length (legs spread about 1.5x wider).
export const SPIDER_SIZE = 0.06;

// Spider body/leg color (hex). Near-black so it reads as a dark shape under dim light.
export const SPIDER_COLOR = 0x141210;

// How fast the idle legs twitch. Higher = more frantic.
export const LEG_TWITCH_SPEED = 3;

// How far a leg flicks during a twitch, in radians (0.25 ≈ 14 degrees).
export const LEG_TWITCH_AMOUNT = 0.25;

// How much faster the legs flail while a spider is being sprayed (1 = no change).
export const SPIDER_SPRAYED_PANIC = 4;

// Radius in meters of the invisible ball around a spider that the crosshair has to touch.
// Bigger = easier to hit. Spiders are tiny, so this is more forgiving than their actual shape.
export const SPIDER_HIT_RADIUS = 0.06;

// How far behind the surface under the crosshair a spider can be and still get hit, in meters.
// Without this, a fold of the curtain sitting slightly in front of a spider shields it.
export const SPIDER_HIT_DEPTH_TOLERANCE = 0.12;

// Seconds the death animation takes (flip on back, legs curl, shrink away).
export const SPIDER_DEATH_TIME = 1;

// --- Spawning ---

// A new spider appears after a random wait between these two numbers, in seconds.
// These are the values at the start of the routine. See Escalation for the end values.
export const SPAWN_MIN = 3;
export const SPAWN_MAX = 7;

// How much more likely a spawn point is if it's off-screen or near the screen edge.
// 5 = five times as likely as a spawn point in the middle of your view.
export const SPAWN_PERIPHERAL_WEIGHT = 5;

// Where "near the edge" begins. 0 = screen center, 1 = screen edge.
export const SPAWN_EDGE_THRESHOLD = 0.65;

// Used only when bathtub.glb has no Spawn_* objects. Each spider is placed on the first surface
// found on the way from the player to this position, in meters. Names are what to add in Blender.
export const FALLBACK_SPAWN_POINTS = [
  { name: 'Spawn_CurtainGap', position: [-0.06, 1.75, -0.2] },
  { name: 'Spawn_UpperCorner', position: [-0.72, 2.08, -1.47] },
  { name: 'Spawn_Drain', position: [-0.392, 0.33, -1.182] },
  { name: 'Spawn_BesideShelf', position: [-0.64, 1.32, -1.49] },
  { name: 'Spawn_BehindPlayer', position: [-0.4, 1.55, -0.03] },
];

// --- Spray ---

// Seconds of spray a spider has to take under the crosshair before it dies.
export const SPRAY_KILL_TIME = 0.8;

// Spray particles created per second while holding the mouse.
export const SPRAY_PARTICLE_RATE = 340;

// How fast particles leave the nozzle, in meters per second.
export const SPRAY_PARTICLE_SPEED = 4;

// Seconds each particle lives before fading out completely.
export const SPRAY_PARTICLE_LIFETIME = 0.42;

// Particle size in meters. They look bigger close to the nozzle.
export const SPRAY_PARTICLE_SIZE = 0.008;

// How wide the spray cone is from its center line to its edge, in degrees.
export const SPRAY_CONE_DEGREES = 6;

// --- Raid can (held in view) ---

// Where the can sits relative to the camera, in meters: [right, up, forward is negative].
export const CAN_POSITION = [0.2, -0.2, -0.42];

// How the can leans in radians: [top tips forward, turn, top tips toward the screen center].
export const CAN_ROTATION = [-0.35, 0.12, 0.14];

// How far the can drifts while idle, in meters, and how fast that drift is.
export const CAN_SWAY_AMOUNT = 0.004;
export const CAN_SWAY_SPEED = 1.4;

// How hard the can shakes while spraying, in meters.
export const CAN_SPRAY_SHAKE = 0.0012;

// --- Audio ---

// Overall game volume, 0 to 1.
export const MASTER_VOLUME = 0.8;

// Spray hiss volume, 0 to 1.
export const SPRAY_HISS_VOLUME = 0.28;

// --- Spider approach ---

// Seconds a spider rests at each stage before moving closer, at the start of the routine.
export const STAGE_TIME = 3.5;

// How many moves it takes a spider to reach the player. Finishing the last one is an instant loss.
export const APPROACH_STAGES = 4;

// Skitter speed during a burst, in meters per second.
export const SKITTER_SPEED = 0.75;

// A skitter is a burst of movement, a pause, another burst. Durations are random between these, in seconds.
export const SKITTER_BURST_MIN = 0.04;
export const SKITTER_BURST_MAX = 0.1;
export const SKITTER_PAUSE_MIN = 0.08;
export const SKITTER_PAUSE_MAX = 0.3;

// How much faster the legs move during a burst (1 = no change).
export const SKITTER_LEG_SPEED = 6;

// How quickly a spider turns to face where it's going. Higher = snappier.
export const SPIDER_TURN_SPEED = 25;

// How many points each approach path is made of. More = follows surfaces more closely.
export const SPIDER_PATH_SAMPLES = 32;

// Wall spiders finish on a surface beside the player, this many degrees below eye level (shoulder height).
export const SPIDER_GOAL_PITCH_DEGREES = -20;

// When choosing that finishing spot, how strongly a spider prefers staying on its own side of the
// player over picking the closest surface. 0 = always the closest surface.
export const SPIDER_GOAL_SIDE_PREFERENCE = 0.25;

// --- Threat ---

// The threat meter runs from 0 to this. Reaching it is a loss.
export const THREAT_MAX = 100;

// Threat added per second by each living spider, and the extra added for each stage it has advanced.
export const THREAT_RATE_BASE = 1.5;
export const THREAT_RATE_PER_STAGE = 1.5;

// Threat removed per second while no spiders are alive.
export const THREAT_DECAY = 3;

// --- Lose and win endings ---

// Seconds for the whole lose sequence, from the moment of losing to the end screen.
export const LOSE_ZOOM_TIME = 3.5;

// Seconds, at the start of the sequence, for the camera to swing around to face the spider.
export const LOSE_TURN_TIME = 0.9;

// Seconds, at the end of the sequence, for the screen to fade to black.
export const LOSE_FADE_TIME = 0.8;

// Where the zoom ends: distance from the spider in meters, and camera field of view in degrees.
// Smaller numbers make the spider fill more of the screen.
export const LOSE_FINAL_DISTANCE = 0.13;
export const LOSE_FINAL_FOV = 18;

// Seconds of silence between finishing the routine and the win screen.
export const WIN_SILENCE_TIME = 1.5;

// Win ranks, checked top to bottom. The first one you qualify for is yours.
// minKills = at least this many kills, maxTime = finished in at most this many seconds.
export const RANKS = [
  { name: 'FINAL GIRL', minKills: 6, maxTime: 60 },
  { name: 'SURVIVOR', minKills: 4, maxTime: 80 },
  { name: 'LUCKY', minKills: 2, maxTime: 110 },
  { name: 'BARELY', minKills: 0, maxTime: Infinity },
];

// --- Raid can on the shelf, and two-hand steps ---

// NO LONGER USED since the art pass moved the can to the vanity (see RAID_CAN_SPOT_FALLBACK near the
// bottom of this file). Kept so nothing that imports it breaks.
export const CAN_SHELF_FALLBACK_POSITION = [-0.387, 1.314, -1.445];

// How wide the invisible gaze target around the can on the shelf is, in meters. Bigger = easier to look at.
export const CAN_GAZE_RADIUS = 0.07;

// Seconds for the can to fly from the shelf to your hand.
export const CAN_GRAB_TIME = 0.4;

// Seconds to raise the can during a two-hand step before it can spray.
export const RAISE_TIME = 0.5;

// Seconds to lower the can again. A two-hand step can only fill once the can is fully down.
export const CAN_LOWER_TIME = 0.25;

// How far the can drops when lowered, in meters. Must be enough to take it out of view.
export const CAN_LOWERED_DROP = 0.32;

// --- Spray ammo ---

// Total seconds of spray in the can. There are no refills.
export const SPRAY_MAX = 10;

// When the can is empty it coughs out weak puffs. Seconds each puff lasts.
export const SPRAY_SPUTTER_PUFF_TIME = 0.08;

// Random wait between puffs, in seconds.
export const SPRAY_SPUTTER_GAP_MIN = 0.2;
export const SPRAY_SPUTTER_GAP_MAX = 0.5;

// How far a puff reaches in meters, and how dense it is compared to real spray (0.5 = half).
export const SPRAY_SPUTTER_RANGE = 0.4;
export const SPRAY_SPUTTER_DENSITY = 0.5;

// Empty-can rattle volume, 0 to 1.
export const SPRAY_RATTLE_VOLUME = 0.5;

// --- Escalation ---
// Everything here slides from a start value on the first routine step to an end value on the
// last step. The start values are SPAWN_MIN, SPAWN_MAX and STAGE_TIME, further up this file.

// Spawn wait range on the last step, in seconds.
export const SPAWN_MIN_END = 1.8;
export const SPAWN_MAX_END = 3.5;

// Seconds a spider rests at each stage on the last step.
export const STAGE_TIME_END = 2.2;

// Which stage new spiders start at. 0 = at the spawn point, 2 = already halfway to you.
export const START_STAGE_START = 0;
export const START_STAGE_END = 2;

// --- Decoys ---

// Chance that a spawn is a fake shadow instead of a spider. 0.15 = 15%.
export const DECOY_CHANCE = 0.15;

// The most fake shadows that can be on the tiles at once.
export const DECOY_MAX = 2;

// Width of the shadow in meters.
export const DECOY_SIZE = 0.17;

// How close the crosshair must get for the shadow to dissolve, in meters.
export const DECOY_HIT_RADIUS = 0.08;

// Seconds a shadow takes to dissolve.
export const DECOY_DISSOLVE_TIME = 0.45;

// --- Off-direction audio ---

// Chance that a spider's skitter plays from a different spawn point than the spider. 0.25 = 25%.
export const AUDIO_LIE_CHANCE = 0.25;

// --- Atmosphere ---

// Steam color, and how thick it is at zero threat and at full threat. Higher = thicker.
export const FOG_COLOR = 0x9aa6ad;
export const FOG_DENSITY_MIN = 0.05;
export const FOG_DENSITY_MAX = 0.75;

// Average seconds between light flickers at zero threat and at full threat.
export const FLICKER_GAP_CALM = 7;
export const FLICKER_GAP_FRANTIC = 0.7;

// How long a flicker lasts, random between these, in seconds.
export const FLICKER_LENGTH_MIN = 0.05;
export const FLICKER_LENGTH_MAX = 0.18;

// How bright the lights are during a flicker. 0.25 = a quarter of normal.
export const FLICKER_BRIGHTNESS = 0.25;

// --- Post-processing ---

// Turns the tint, grain and vignette on or off all together.
export const POST_PROCESSING_ENABLED = true;

// How strong the cold tint is, 0 to 1, and its color as red, green, blue multipliers.
export const POST_TINT_STRENGTH = 0.55;
export const POST_TINT_COLOR = [0.72, 0.87, 1.15];

// How strong the film grain is. 0 = none.
export const POST_GRAIN_STRENGTH = 0.07;

// How dark the screen corners get, 0 to 1.
export const POST_VIGNETTE_STRENGTH = 0.55;

// --- More sound ---

// Volumes, 0 to 1. Master and spray volumes are in the Audio section above.
export const WATER_VOLUME = 0.22;
export const SKITTER_VOLUME = 1;
export const STING_VOLUME = 0.6;
export const HEARTBEAT_VOLUME = 0.8;

// The heartbeat starts above this much threat, from 0 to 1.
export const HEARTBEAT_START_THREAT = 0.15;

// Seconds between heartbeats when it first starts, and at full threat.
export const HEARTBEAT_GAP_SLOW = 1.1;
export const HEARTBEAT_GAP_FAST = 0.36;

// --- Looking around ---

// How far the player can look up and down, in degrees. The down limit stops short of straight
// down, so the view lands on the feet and never where a body would be.
export const PITCH_UP_LIMIT = 89;
export const PITCH_DOWN_LIMIT = -80;

// --- Hands ---
// Each pose is where a hand sits relative to the camera in meters [right, up, forward is negative],
// and how it's turned in radians.

export const HAND_POSES = {
  leftRest: { position: [-0.25, -0.7, -0.35], rotation: [-0.4, 0, 0] },
  rightRest: { position: [0.25, -0.7, -0.35], rotation: [-0.4, 0, 0] },
  leftReach: { position: [-0.07, -0.17, -0.42], rotation: [-1.15, 0, -0.25] },
  // Art pass: hands on the head sit at the top corners with the elbows raised out to the sides
  // (elbow = where the forearm goes, behind the camera, so it never crosses the screen).
  leftHead: { position: [-0.2, 0.17, -0.27], rotation: [-0.3, 3.142, 0.35], elbow: [-0.42, 0.1, 0.08] },
  rightHead: { position: [0.2, 0.17, -0.27], rotation: [-0.3, 3.142, -0.35], elbow: [0.42, 0.1, 0.08] },
  rightCan: { position: [0.262, -0.25, -0.41], rotation: [-1.04, 1.571, 0] },
  // Art pass: palm up under the water for the rinse steps, and a grabbing reach for the towel.
  leftRinse: { position: [-0.11, -0.2, -0.38], rotation: [-1.35, 0.3, 2.9] },
  leftTowel: { position: [-0.02, -0.16, -0.42], rotation: [-1.1, -0.4, -0.6] },
};

// How quickly hands move between poses. Higher = snappier.
export const HAND_MOVE_SPEED = 14;

// Seconds the left hand stays closed after finishing a step.
export const HAND_GRIP_TIME = 0.25;

// How far hands scrub back and forth while lathering, in meters, and how fast.
export const HAND_SCRUB_AMOUNT = 0.012;
export const HAND_SCRUB_SPEED = 16;

// --- Feet ---

// How far apart the art-pass feet (src/art/feet.js, no longer used in game) are, center to center, in meters.
export const FEET_SPACING = 0.18;

// Rebuilt feet (src/placeholders/feet.js): center-to-center distance in meters, and how far each
// foot's toes turn outward, in degrees. The tub floor is only flat about 0.17 m either side of
// center (it curves 6 cm up into the wall by 0.25 m), so true shoulder width (~0.34) buries the
// little toes in the tub wall. 0.22 is as wide as it goes with the toes still on the flat.
export const FOOT_SPACING = 0.22;
export const FOOT_TOE_OUT_DEG = 12;

// Used only if no floor is found below the player: floor height in meters.
export const FEET_FALLBACK_FLOOR_Y = 0.17;

// --- Towel ---

// Adds the final "Grab the towel" step after turning off the water.
export const INCLUDE_TOWEL_STEP = true;

// Where the placeholder towel hangs in meters, and its [thickness, height, width]. Ignored if the
// model has an object named "Towel".
export const TOWEL_POSITION = [0.09, 1.15, -1.2];
export const TOWEL_SIZE = [0.03, 0.6, 0.36];

// =====================================================================================
// ART PASS
// Everything below controls how things look, not how the game plays.
// =====================================================================================

// 'high' turns on the expensive extras: ambient occlusion, soft shadows from the bulb, bigger
// textures, wall droplets and condensation beads. 'low' keeps the look but drops those.
// You can also try it without editing this file by adding ?quality=low to the page address.
export const QUALITY = 'high';

// --- Exposure and tone ---

// Overall brightness of the rendered image before the cold grade. 1 = neutral.
export const EXPOSURE = 0.72;

// Bloom makes bright things (the bulb, chrome glints) glow. Strength 0 = off.
// Threshold: only pixels brighter than this glow. Radius: how far the glow spreads, 0 to 1.
export const BLOOM_STRENGTH = 0.45;
export const BLOOM_THRESHOLD = 1.6;
export const BLOOM_RADIUS = 0.35;

// Ambient occlusion darkens creases and corners (high quality only). How dark, 0 to 1,
// and how far it reaches in meters.
export const AO_STRENGTH = 0.85;
export const AO_RADIUS = 0.12;

// --- Lights ---

// The bare bulb hanging over the tub: color, brightness, and how far it swings, in degrees.
// The swing is slow and lazy, like something bumped it a minute ago.
export const BULB_COLOR = 0xffe2b8;
export const BULB_INTENSITY = 1.15;
export const BULB_SWING_DEGREES = 6;
export const BULB_SWING_SPEED = 0.55;
// Where the cord hangs from, in meters [x, y, z], and the cord length.
export const BULB_ANCHOR = [-0.38, 2.42, -1.0];
export const BULB_CORD_LENGTH = 0.36;

// Cold blue light that fills the shadows so nothing goes pure black.
export const FILL_COLOR = 0x5a78a8;
export const FILL_INTENSITY = 0.22;

// The bathroom light outside the curtain, spilling in through the gap.
export const SPILL_COLOR = 0xcfe2ff;
export const SPILL_INTENSITY = 1.9;

// How much the chrome, tile glaze and water reflect the (made-up) room around them. 0 = no reflections.
export const REFLECTION_STRENGTH = 0.55;

// --- Tiles ---

// Size of one wall tile in meters (classic 4 1/4 inch tile is 0.108), and grout line width.
export const TILE_SIZE = 0.108;
export const GROUT_WIDTH = 0.0035;
// Tile glaze color and grout color. The glaze is a cold off-white, the grout a dirty grey.
export const TILE_COLOR = 0xd9e0e2;
export const GROUT_COLOR = 0xa29e94;
// How different each tile's color is from its neighbors. 0 = all identical.
export const TILE_COLOR_VARIATION = 0.06;
// How much grime there is overall: mildew in the corners, soap scum streaks. 0 = brand new.
export const TILE_GRIME = 0.8;
// Texture detail in pixels per meter of wall. Lower = blurrier but faster to load.
export const TILE_TEXELS_PER_METER_HIGH = 1100;
export const TILE_TEXELS_PER_METER_LOW = 520;

// --- Water ---

// How many falling water streaks come out of the showerhead while the water runs.
export const WATER_STREAK_COUNT = 420;
// How fast the water falls when it leaves the nozzle, in meters per second.
export const WATER_STREAK_SPEED = 2.2;
// How many soft steam puffs drift around while the water is on.
export const STEAM_PUFF_COUNT = 20;
// How visible the steam puffs are, 0 to 1.
export const STEAM_OPACITY = 0.07;
// Seconds for the walls to go from dry to fully beaded with condensation once the water is on.
export const WALL_WETTING_TIME = 25;

// --- Curtain ---

// The vinyl curtain: color, and how see-through it is (0 = solid, 1 = invisible).
export const CURTAIN_COLOR = 0xc8d4d6;
export const CURTAIN_SEE_THROUGH = 0.2;
// How deep the folds are, in meters.
export const CURTAIN_FOLD_DEPTH = 0.045;
// Where the curtain's open edge hangs along the tub, in meters (z). The front wall is at -0.03 and
// the faucet wall at -1.5. Closer to -1.5 = more closed (cozier, but it hides the vanity and the can).
export const CURTAIN_OPEN_EDGE_Z = -0.78;

// --- Outside the curtain: vanity cabinet ---

// Used only if bathtub.glb has no Empty named "RaidCanSpot": where the bottom of the can stands, in meters.
export const RAID_CAN_SPOT_FALLBACK = [0.27, 0.86, -1.22];
// Where the vanity cabinet stands outside the tub, in meters: [x of its middle, z of its back edge],
// and which way it faces (degrees around the vertical axis). It's against the back wall, beside the tub.
export const VANITY_POSITION = [0.47, -1.524];
export const VANITY_ROTATION_DEGREES = 0;

// --- Raid can grab ---

// Seconds for the hand to reach out through the gap to the can, and to pull it back in.
export const CAN_REACH_OUT_TIME = 0.55;
export const CAN_PULL_BACK_TIME = 0.5;

// --- Hands and feet ---

// Skin tone for hands and feet. Everything else (redder knuckles, paler palms) is worked out from this.
export const SKIN_TONE = 0xc99a7c;
// How wet the skin looks, 0 to 1 (adds a clear glossy coat and water beads).
export const SKIN_WETNESS = 0.55;
// How far round toward you the right hand sits on the can, in degrees. 0 = palm flat on the can's
// right side (you see the edge of your hand); higher shows more of the back of the hand.
export const CAN_GRIP_TURN_DEGREES = 40;

// --- Spider look ---

// Number of fine hair bristles on each spider (they're tiny instanced spikes). 0 = bald.
export const SPIDER_HAIR_COUNT = 260;
// Color of the markings on the abdomen and carapace, as hex. Pale brown on a near-black body,
// like a wolf spider, so the pattern reads even in the dark.
export const SPIDER_MARKING_COLOR = 0x8c735a;
