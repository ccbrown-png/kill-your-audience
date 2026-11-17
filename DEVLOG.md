# KILL YOUR AUDIENCE: Dev Log

Raid "Some Stalkers Have Eight Legs" game. Three.js + Blender + Vercel.
Full build plan: `GAME_SPEC.md` (Phases A to E).

---

## Current status

- **Done:** Milestone 1 (look around), Milestone 2 (crosshair + targeting), Milestone 3 (shower routine), Phase A (title, pause, spider spawning, Raid can, hold-to-spray, kill counter)
- **Now:** playtest Phase A by hand (spray feel, hiss, real Esc key)
- **Next:** Phase B (spider approach, threat meter, win/lose, restart)
- **Blender to-do:**
  - Add the full set of spawn Empties at once (Add > Empty > Arrows, Z arrow pointing away from the surface, -Y arrow is where the head points): `Spawn_CurtainGap`, `Spawn_UpperCorner`, `Spawn_Drain`, `Spawn_BesideShelf`, `Spawn_BehindPlayer`. The first one added turns off all code fallbacks
  - Move Shelf to a side wall so the routine forces you to turn
  - Shrink Drain flat (X 0.08, Y 0.08, Z 0.01)
- **Known issues:** see ART_PASS_REPORT.md (Nov 16 art pass). bathtub.glb is now 0.45 MB and the curtain no longer renders black

---

## Decisions

**Locked**
- Three.js, not a game engine. Considered Unity, Godot, PlayCanvas. Staying because it's already working, loads fast for a portfolio link, works on mobile, and fits the Claude Code workflow
- One `bathtub.glb` for the stall with named objects inside. Separate .glb files only for things that move on their own (Raid can, hands, feet)
- Player never walks. Stands in the tub, mouse-look only
- Blender is the layout tool: Empties mark positions (PlayerSpawn, PlayerLookAt, Spawn_ points), code reads them by name. Missing objects get a code fallback plus a console warning
- Spiders are built from code primitives, not Blender. Lets legs twitch without rigging. Might be the final spider
- Build ugly first (greybox), art pass after mechanics work. AI generates the full playable game with placeholders, then CC swaps in real art and sound
- Every placeholder lives in its own file (`src/placeholders/`) so real models and sounds can replace it without touching game logic
- Spraying is hold-to-spray, not click-to-kill. Damage adds up across bursts and never heals (`SPRAY_KILL_TIME`, currently 0.8 s)
- Spiders favor off-screen and edge-of-screen spawn points (5x more likely than center of view)

**Agreed direction (written into GAME_SPEC.md)**
- Tone: B-movie horror parody, same exaggeration as the print ad. Not serious horror
- ~~Raid can starts on the shelf next to the shampoo.~~ **Changed in the art pass (Nov 16):** the Raid can starts on a vanity cabinet OUTSIDE the curtain, visible through the curtain gap. "Grab the Raid" is still the tutorial step: gaze-hold the can, a hand reaches out through the gap, grabs it and pulls it in. No spiders until it's in hand. "Keep Raid where you're most vulnerable" is still the product message (now: it's just out of reach, which is the point)
- Threat is proximity, not damage. Lose = spider reaches you or threat maxes out
- Limited spray ammo, no refills. Running dry is a legit way to lose
- Two-hand steps (Wet your hair, Lather): the can lowers, and raising it takes time
- Body: arms/hands and feet only, torso never modeled (Hitchcock framing). Drain spider crawls toward your feet
- Hands: pose-swap static models, no rigging
- Towel as final routine step, just outside the curtain gap (art pass: it's now a folded towel on the vanity, next to where the can was)

**Still deciding**
- Which handle is "turn on water" (currently BathTubHandleMiddle)
- Final `SPRAY_KILL_TIME` after playtesting

---

## Code map

| File | Job |
| --- | --- |
| `src/main.js` | Sets up the 3D view, lights, loads the model, runs the game loop |
| `src/config.js` | Every tunable number |
| `src/player.js` | Camera at PlayerSpawn, mouse-look, pitch clamp |
| `src/raycast.js` | Gaze targeting (bathroom only) plus a separate spider check |
| `src/routine.js` | Shower steps, gaze-hold and decay, events (`stepStart`, `stepProgress`, `stepComplete`) |
| `src/gameFlow.js` | Title, playing and paused states, mouse locking |
| `src/spawnPoints.js` | Finds `Spawn_*` Empties or builds fallback points |
| `src/spiderModel.js` | Code-built spider, twitch, `setDeathPose()` |
| `src/spiders.js` | Spawn timing, spider animation, damage, removal |
| `src/spray.js` | Mouse button to can, particles, hiss, damage |
| `src/audio.js` | Shared Web Audio context and master volume |
| `src/hud.js` | Kill counter |
| `src/placeholders/raidCan.js` | Placeholder can model |
| `src/placeholders/sprayParticles.js` | Placeholder spray particles |
| `src/placeholders/sprayHiss.js` | Placeholder hiss sound |

---

## Session log

### Sep 28, 2026: Setup through first spider

**Built**
- Vite + Three.js project scaffolded by Claude Code
- Camera spawns at PlayerSpawn, faces PlayerLookAt (the faucet)
- Crosshair + raycast debug label showing target names
- 8-step shower routine with gaze-hold progress bar that drains slowly instead of resetting. Tunable numbers live in `src/config.js`
- Spider built from spheres and cylinders with a twitch animation (`src/spiderModel.js`)
- Added Shelf, Drain, PlayerSpawn, PlayerLookAt in Blender

**What I struggled with**
- Moving Empties in Blender (solution: type numbers in the Item panel, or G then an axis key)
- Understanding what Three.js actually is vs a game engine
- Feeling behind learning Blender, code, and game design all at once
- Doubting whether the concept made sense (resolved: it's heightened ad logic, not realism)

**What AI struggled with / got wrong**
- Claude (chat) told me to scale the shelf cube to 0.3, not accounting for Blender's default cube being 2 m. Result: a 60 cm box buried in the wall, hiding the test spider
- Claude (chat) didn't warn that Blender's export dialog remembers the last folder, so exports went to the wrong place
- Claude Code can't see the browser, so it can't confirm visuals. I have to test and report back

**What we debugged**
- Spider not showing: the .glb was exporting to my Blender folder, not `raid game/public/models/`. The game never saw my changes
- Multiple dev servers running at once (ports 5173, 5174, 5175). Fix: quit Terminal, run one `npm run dev`
- Filename capitalization: `Bathtub.glb` vs `bathtub.glb`. Mac doesn't care, Vercel does. Keep everything lowercase

**What I learned**
- Scene graph: objects in a tree with parents and children. The Blender Outliner IS the scene graph
- Game loop: code runs ~60 times per second (check input, update, draw)
- Raycasting: invisible laser from the camera, how the game knows what I'm looking at
- State: what the game remembers (current step, progress)
- Delta time: progress fills by seconds, not frames
- Tuning: game feel lives in numbers in config.js
- The pipeline: **save .blend, export .glb to public/models, hard refresh (Cmd + Shift + R)**. The game only reads the .glb
- Greyboxing: make it work ugly, then make it pretty
- Level design: placing objects to control where the player looks. Everything on one wall means no reason to turn around, which kills the concept

---

### Nov 8, 2026: Planning the full build

**Decided**
- AI-generate the rest of the game with placeholders so it's fully playable, then do my own art and sound pass later
- Wrote `GAME_SPEC.md`: five phases (A: flow + spraying, B: threat + win/lose, C: Raid on the shelf + two-hand steps + ammo, D: escalation + creepy tactics + atmosphere, E: hands, feet, towel, debug panel, mobile, ship)
- Build one phase at a time and playtest before saying "next phase"

**What I learned**
- Angular (`ng serve`, `ng build`) is for my carnival portfolio. This game is Vite: `npm run dev` to play, `npm run build` to package for Vercel
- The `compdef: command not found` line in Terminal is harmless

---

### Nov 9, 2026: Phase A built (awaiting playtest)

**Built**
- **Title screen** with "CLICK TO SHOWER". The button says LOADING... until the bathroom finishes downloading
- **Pause** on Esc, with a dim overlay and click to resume. Everything freezes, including spiders, timers, particles and the routine
- **Spiders** appear 3 to 7 seconds apart once step 1 ("Turn on the water") is done, one per spawn point. Off-screen and edge-of-screen spots are five times as likely as spots in the middle of your view
- **Raid can** in the lower right with a slight sway, drawn on top of everything so the curtain can't poke through it
- **Spraying:** hold left mouse for white particles and a hiss. A spider dies after 0.8 seconds of total spray under the crosshair, and its legs flail faster while being sprayed
- **Death:** the spider flips on its back, curls its legs and shrinks away over 1 second
- **Kill counter** top right. Routine UI and debug target label unchanged
- Spiders, the can and the spray can't block the routine's gaze targets

**Changes to existing files**
- `routine.js`: added the events the spec refers to (`stepStart`, `stepProgress`, `stepComplete`). Gaze logic unchanged
- `spiderModel.js`: added `setDeathPose()` and put the body parts inside one inner group so the body can flip in place
- `raycast.js`: gaze now tests the bathroom model only. Added a separate spider check
- `player.js`: mouse locking moved to `gameFlow.js`
- `main.js`: removed the test spider on the shelf and wired in the new systems

**Technical decisions**
- The crosshair hits an invisible ball around each spider (`SPIDER_HIT_RADIUS`), because the real body is only a few centimeters wide
- A spider can be up to 12 cm behind the surface under the crosshair and still get hit (`SPIDER_HIT_DEPTH_TOLERANCE`). Without this, curtain folds shielded the curtain spider

**What AI struggled with / got wrong**
- Claude Code didn't find DEVLOG.md in the project folder and created a fresh one, dropping the Sep 28 history. Merged back by hand
- Routine events from an earlier prompt had never actually been added to the code. Claude Code added them in Phase A
- Testing was an automated headless browser run. It measured the hiss as a signal but couldn't hear it, and released the mouse through code instead of the real Esc key

**Tested (automated)**
- Title and loading, mouse lock, step 1 starting spawns, one-per-point limit, all five spawn points hittable, a spider behind a wall not hittable, a short click not killing, a held spray killing, removal after death, gaze passing through spiders, pause freezing and resume, hiss on and off, `npm run build`

**Still needs me**
- How the spray and sway feel at full frame rate
- How the hiss sounds
- Pressing the real Esc key mid-spray
- Hands-on: try `SPRAY_KILL_TIME` at 2.0, predict first, then pick the value that feels best

**Next session**
- Playtest Phase A, tune `SPRAY_KILL_TIME`
- Optional: add the full set of `Spawn_` Empties in Blender, move the Shelf to a side wall
- Say "next phase" for Phase B
- Deploy to Vercel early, even as greybox

## Phase B: Threat, approach, win/lose (2026-11-09, built, awaiting playtest)

### What now exists
- **Approach:** every 3.5 seconds a spider moves one stage closer, 4 stages in all, in short bursts with pauses. Finishing stage 4 is an instant loss.
- **Paths:** wall and curtain spiders follow the surfaces to a spot at shoulder height beside the player. The drain spider crosses the tub floor to the player's feet.
- **Threat meter:** thin unlabeled bar on the top edge, growing from the center and getting more solid. Every living spider raises it, later stages faster. It drains slowly only when no spiders are alive. Full is a loss.
- **Lose:** input stops, the camera swings to the nearest spider and slowly zooms until it fills the view, fades to black, then "THEY WERE WATCHING YOU." with kills, steps completed and TRY AGAIN.
- **Win:** finishing the routine freezes the scene for 1.5 seconds of silence, then "KILL YOUR AUDIENCE" with kills, time, rank and PLAY AGAIN.
- **Restart:** resets routine, spiders, threat, kills, time, camera and spray without reloading.

### Files
| File | Job |
| --- | --- |
| `src/spiderPaths.js` | Works out each spawn point's route over the surfaces |
| `src/threat.js` | Threat meter value |
| `src/endings.js` | Lose zoom and win silence |
| `src/endScreen.js` | **Placeholder:** lose and win screens |

`spiders.js` gained the stage and burst movement. `routine.js` gained `routineComplete` and `reset()`. The old "ROUTINE COMPLETE" banner is gone because the win screen replaces it. Tunables are in `src/config.js` under Spider approach, Threat, and Lose and win endings.

### Decisions worth knowing
- **Spray remaining** is left off the win screen until Phase C adds ammo. Phase C only needs to pass a real value in place of `sprayRemaining: null` in `main.js`.
- **Water stopping** on win has nothing to stop yet, since the water loop arrives in Phase D. The 1.5 seconds of silence is already in place.
- A spider being sprayed keeps moving. It doesn't stop to take the hit.
- A spider keeps its spawn point reserved for as long as it lives, even after crawling away.
- **Balance:** a run takes about 20 seconds of pure gaze time. A bot with instant aim ignored every spider and still won at about 21 seconds, at 79% threat. A run that sat on step 2 lost at about 22 seconds. Phase D's escalation is meant to tighten this, and `STAGE_TIME` and the `THREAT_RATE` numbers are the first ones to adjust.

### Tested
Automated run in headless Chromium: spiders advance through stages in bursts, loss by a spider arriving, loss by a full meter, threat draining at the configured rate with no spiders, drain path staying on the tub floor and ending under the player, win flow with stats and rank, lose zoom and fade, mouse released on end screens, and full restart with no leftover spiders, zoom or fade. `npm run build` passes.

Still needs a human: how the skitter, zoom and threat bar feel at full frame rate, and whether the difficulty is right.

## Phase C: The Raid can lives on the shelf (2026-11-09, built, awaiting playtest)

### What now exists
- **Can on the shelf:** the game starts with the placeholder can standing on the Shelf and nothing in hand. The mouse does nothing until it's grabbed.
- **Step 1 of 9, "Grab the Raid":** gaze-hold the can like any other step. It flies to your hand, and spiders only start after this.
- **Two-hand steps ("Wet your hair" and "Lather"):** the routine label adds "(both hands)" and the can drops out of view. Holding the mouse raises it, which takes 0.5 seconds before it can spray. While it's up, the step can't fill and decays as usual. Letting go lowers it in 0.25 seconds.
- **Limited spray:** 10 seconds in total, shown on a small vertical bar beside the can that turns red below 25%. No refills.
- **Empty can:** holding the mouse gives short weak puffs and a dry rattle, and it can't hurt spiders.
- **Win screen** now shows spray remaining.

### Files
| File | Job |
| --- | --- |
| `src/placeholders/sprayGauge.js` | **Placeholder:** ammo bar beside the can |
| `src/placeholders/sprayRattle.js` | **Placeholder:** empty-can rattle |

`raidCan.js` is now one object that moves from the shelf to the camera. `spray.js` now holds raising, lowering, ammo and the sputter. Each step in `routine.js` has a `hands` value. Tunables are in `src/config.js` under "Raid can on the shelf, and two-hand steps" and "Spray ammo".

### Decisions worth knowing
- The spec says pressing the mouse raises the can but not when it lowers. I made it **hold to keep it up, release to lower it**, because a two-hand step can only continue once the can is down.
- A two-hand step only fills once the can is **fully** down, so a raise always costs a little time.
- The can also rises by itself after a two-hand step ends, and can't spray until it's fully up.
- The gaze target on the shelf can is wider than the can (`CAN_GAZE_RADIUS`) so the first step is easy.
- The ammo bar is attached to the can, so it disappears when the can is lowered.

### Tested
Automated run in headless Chromium: no spray or spiders before the grab, gazing at the can grabbing it, the can moving to the hand, two-hand step lowering, 0.5 seconds of raise before spray, progress decaying while raised, ammo draining to zero, rattle playing in bursts when empty, no damage when empty, spray remaining on the win screen, and restart returning a full can to the shelf. `npm run build` passes.

Still needs a human: how the raise timing and 10 seconds of spray feel, and how the rattle sounds.

## Phase D: Escalation and creepy tactics (2026-11-09, built, awaiting playtest)

### What now exists
- **Escalation:** tied to routine progress. Spawn wait shrinks from 3-7 seconds to 1.8-3.5, stage rest from 3.5 seconds to 2.2, and new spiders start up to 2 stages closer by the last step. All start and end values are in `src/config.js`.
- **Decoys:** 15% of spawns are a flat spider shadow on the tiles (2 at most) that dissolves when the crosshair crosses it.
- **Off-direction audio:** skitters come from the spider's position in 3D sound. 25% of the time a spider's skitter plays from a different spawn point instead.
- **Atmosphere:** fog thickens with threat, the lights dip more often as threat rises (about 7 flickers a minute at zero threat, 66 at full), and there's a cold tint, film grain and vignette. `POST_PROCESSING_ENABLED` turns those three off.
- **Sounds:** water loop, skitter, low sting when a spider appears at a later stage, and a heartbeat that starts at 15% threat and speeds up (about 29 beats in 30 seconds early on, 82 at full). Volumes are in `src/config.js`. Pausing silences everything.

### Files
`src/atmosphere.js`, `src/decoys.js`, `src/peripheral.js`. Placeholders: `postProcessing.js`, `decoyShadow.js`, `waterLoop.js`, `skitterSound.js`, `sting.js`, `heartbeat.js`.

### Balance check
A scripted player with a 0.7 second reaction time, shooting anything that had advanced a stage, played 5 full runs: 4 wins and 1 loss, 50 to 61 seconds each, 10 to 12 kills, and out of spray in 3 of the 5. A person also has to find each spider, so expect it to be harder than this.

## Phase E: Body placeholders, final step, polish, ship (2026-11-09, built, awaiting playtest)

### What now exists
- **Hands:** capsule and box hands with static reach, grip and lather poses, driven by the routine events. The left hand reaches while a step fills, and the right hand holds the can. Both come up toward the head on two-hand steps. No torso anywhere.
- **Feet:** two feet on the tub floor directly under the player. The look-down limit is now -80 degrees. The drain spider's path ends between them.
- **Towel:** "Grab the towel" is the final step, using a placeholder box beyond the open end of the curtain. `INCLUDE_TOWEL_STEP` turns it off. The water now stops at "Turn off the water", so the towel step plays in silence.
- **Debug panel:** backtick toggles it. K kills all, G god mode, N next step, T spawns a spider under the crosshair.
- **Mobile:** touch-only devices get the title art and "BEST PLAYED ON DESKTOP WITH A MOUSE", without downloading the game.

### Files
`src/debugPanel.js`, `src/handsController.js`. Placeholders: `hands.js`, `feet.js`, `towel.js`. `src/main.js` is now a small entry point that checks for touch devices, and the game itself moved to `src/game.js`.

### To add in Blender
A `Towel` object replaces the placeholder box, and a warning is logged until one exists.

### Curtain report
The curtain was not black in any test render. In `bathtub.glb` its material is already double-sided and it has normals. The code also forces double-sided on load. If it's black on your machine, that's something these tests didn't reproduce. The curtain rod and rings do render black.

### Ship check
`npm run build` passes, the only asset path (`/models/bathtub.glb`) is lowercase, and the built game loaded and started from `vite preview` with no errors or failed requests. Not deployed. Debug keys are still active in the built game.

### Tested
Automated run in headless Chromium: escalation values at the start, middle and end, decoy and sound-lie rates, left and right panning (the very first skitter after loading plays centered while the browser loads its 3D audio data), heartbeat rate, flicker rate, water starting and stopping at the right steps, silence on win, audio suspended on pause, decoys dissolving, reach and head poses, feet at the look-down limit, towel gaze, all debug keys, restart, post-processing off, towel step off, and the phone screen.

Still needs a human: all the sounds by ear, frame rate on a real graphics card with post-processing on, difficulty, and how the hands look in motion.

## Art pass (2026-11-16, built unattended, awaiting playtest)

Full write-up, screenshots list, Blender steps and perf numbers: **ART_PASS_REPORT.md**. Screenshots: `art_pass_screenshots/`. Rollback copy of the pre-pass `src/`, `index.html`, docs and the 20 MB model: `_backup_before_art_pass/`.

### What was built (all new code in `src/art/`, all tunables in the ART PASS section at the bottom of `src/config.js`)
- **Phase 1, the shower:** procedural tile walls painted on the GPU at load (grout recess, per-tile color, chips, mildew in the real corners, soap scum under the shelf, rust drips under the handles, wet roughness), plus live condensation beads and drops running down while the water's on. Enamel tub with rust and a water-line ring, chrome with a fake-room reflection map, rebuilt showerhead with 61 rubber nozzles, slotted drain grate, mildewed caulk. Curtain rebuilt in code (pleats, belly, hem tucked in the tub, rings, rod, frosted see-through vinyl, mildew at the hem). Shelf props: three fictional bottles with labels, soap, loofah, razor. Water streaks, a rippling puddle running to the drain, steam. A swinging bare bulb, cold fill, light spilling in from the room outside, soft shadows, bloom, ambient occlusion on high. The room outside the curtain now exists (checker floor, stained walls, ceiling, light fixture).
- **Phase 2, the vanity:** a cabinet with sink, faucet, foggy medicine-cabinet mirror, folded towel, toothbrush cup and hand soap, outside the curtain gap. The Raid can (lathe-built, crimped rim, actuator, scuffed label) stands on it with its clear cap. "Grab the Raid" now sends a hand out through the gap to fetch it; spiders start only once it's in hand.
- **Phase 3, spiders:** sculpted body, 8 eyes in two rows, chelicerae with fangs, pedipalps, 8 legs of 6 segments with spines and claws, wolf-spider markings, hair. One mesh per spider moved by code-built bones (13,070 triangles, shared). Alternating-leg gait during skitter bursts, twitches when still, flailing when sprayed. `createSpider()` and `setDeathPose()` unchanged.
- **Phase 4, hands and feet:** 9 hand poses each sculpted from joint angles (relaxed, reach, grip, grip can, spray, lather, rinse, towel, reach out), nails, creases, wet skin, drops; forearms always leave the frame. Feet with toes, nails, arch, ankle bones and a shin that fades into shadow, standing in water with soap foam.
- **Phase 5:** bathtub.glb 19.5 MB to 0.45 MB (`tools/slim-glb.mjs`), full scripted playthrough (win and lose), 60 fps, gallery mode (`?gallery=shower|cabinet|can|spider|hand|feet`).

### Decisions made without asking (details in the report)
- Can on a vanity against the back wall beside the tub; curtain pulled further open (edge at z -0.78 instead of -0.98) so you can actually see it from PlayerSpawn
- The mirror is fogged and fake-reflective on purpose: a real reflection would show your body
- Spiders became wolf-spider style (pale markings on near-black) so the pattern reads in the dark
- Hands are mirrored copies of one sculpted right hand; the right hand holds the can by a computed grip, not a hand-tuned pose
- Added an invisible gaze box around the shelf (the new bottles left gaps that made "Grab the shampoo" hard to hit)

### What I (Claude) struggled with
- Steam sprites blacked out the walls: the ambient-occlusion pass treats see-through objects as solid. Now hidden from that pass
- A GLSL `pow()` on negative numbers turned one pixel into NaN, and bloom spread it to a full black screen when looking down. Never use `pow(x, 2.0)` in shaders
- First lighting was 6x too bright; three.js light units are physical
- Holding the can: the first grip was anatomically right but read as a stump from the camera. Turning the grip 40 degrees toward the camera fixed it

### What to playtest
- The new grab: does the hand reaching out read? Is the 0.55 s + 0.5 s timing right?
- Is the curtain too open now? (`CURTAIN_OPEN_EDGE_Z`)
- Spiders on the pale tiles: easier to spot than before. Does the game get easier?
- Frame rate on your MacBook with QUALITY 'high', then 'low'
- Hands at the top of the screen during Wet your hair / Lather: visible enough?
