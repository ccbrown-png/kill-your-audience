# KILL YOUR AUDIENCE: Full Game Spec (Placeholder Build)

Goal: a fully playable version of the game with placeholder art and sound, so it can be played and experienced exactly as intended. Final art, models, and audio get swapped in later by CC.

## Ground rules

- Build in the phases below, in order. **Stop after each phase**, tell me exactly how to test it, and update DEVLOG.md
- Everything visual is a placeholder made from Three.js primitives in code. Everything audio is synthesized with the Web Audio API (no sound files needed yet)
- Every placeholder lives in its own file/function so it can be swapped for a real model or sound later without touching game logic
- Every tunable number goes in `src/config.js`, grouped by system, with a plain-English comment
- Keep the existing systems: PlayerSpawn/PlayerLookAt, mouse-look, raycast targeting, routine with gaze-hold and decay, `createSpider()` from spiderModel.js, routine events
- Blender stays the layout tool. If an Empty or object the code needs is missing from bathtub.glb, use a hardcoded fallback position and log a warning naming what to add in Blender
- Tone: B-movie horror parody, same exaggeration as the print ad. Not serious horror
- Never model or render a torso. Arms/hands and feet only

---

## Phase A: Game flow, spiders, spraying

**Title screen**
- Black screen, big rough horror-poster style title "SOME STALKERS HAVE EIGHT LEGS", small subtitle "a Raid production", "CLICK TO SHOWER" button. Clicking starts the game and locks the mouse
- Esc pauses (dim overlay, "PAUSED", click to resume)

**Spawn points**
- Use every object named `Spawn_*` in the model. Orient spiders so their back faces the Empty's local Z axis
- If none exist, create fallback spawn points in code: curtain gap, upper tile corner, drain, beside the shelf, and one behind the player. Log a warning listing the names to add in Blender

**Spawning**
- Spawn spiders at random free spawn points on a random timer between `SPAWN_MIN` and `SPAWN_MAX`
- One spider per spawn point at a time. Prefer spawn points that are currently off-screen or at the edge of the screen (peripheral spawns)
- No spiders spawn until the player has the Raid can (see Phase C; until Phase C exists, spawning starts after step 1)

**Raid can viewmodel (placeholder)**
- Red/white cylinder with a small cap and nozzle, fixed to the lower-right of the camera view like an FPS weapon. Slight idle sway

**Spraying**
- Hold left mouse to spray. Placeholder spray: a cone of small white particles from the nozzle toward the crosshair, plus a synthesized hiss
- A spider dies after receiving `SPRAY_KILL_TIME` seconds of spray while under the crosshair (not a single click)
- Death: spider flips on its back, legs curl, shrinks away over ~1 second
- Spiders are hit by the crosshair raycast, but must NOT block routine gaze targets behind them

**HUD (placeholder)**
- Kill counter, top right
- Keep the routine UI and debug target label

## Phase B: Threat, approach, win/lose

**Spider approach (threat is proximity, not damage)**
- Each spider has stages. After `STAGE_TIME` seconds alive, it skitters closer to the player along a path from its spawn point, in `APPROACH_STAGES` steps. Movement should be fast, jerky bursts with pauses, not smooth gliding
- The drain spider crawls along the tub floor toward the player's feet
- A spider that completes its final stage has reached the player: instant loss

**Threat meter**
- 0 to 100. Rises continuously from every living spider, more for spiders at later stages. Drops slowly when no spiders are alive
- Placeholder UI: thin bar at the top of the screen, no label. It should feel like dread, not a health bar
- Threat at 100 = loss

**Lose state**
- Freeze input, slow camera zoom toward the nearest spider until it fills the view (not a hard jumpscare cut), screen fades to black, then "THEY WERE WATCHING YOU." in the horror type
- Below: kill count, steps completed, "TRY AGAIN" button

**Win state**
- Completing the full routine wins. Water sound stops, short silence, then "KILL YOUR AUDIENCE" in big horror type
- Stats: kills, time, spray remaining, and a rank based on kills and time (placeholder rank names in B-movie style, e.g. "FINAL GIRL", "SURVIVOR", "LUCKY", "BARELY"). "PLAY AGAIN" button

**Restart**
- Full reset of routine, spiders, threat, ammo, without reloading the page

## Phase C: The Raid can lives on the shelf (art pass: now on a vanity outside the curtain)

**Grab the Raid (intro step)** *(changed in the art pass, Nov 16)*
- ~~Game starts with the can sitting on the Shelf~~ Game starts with the can standing on a small vanity cabinet OUTSIDE the curtain, visible through the curtain gap from PlayerSpawn. Its position comes from a Blender Empty named `RaidCanSpot` (code fallback `RAID_CAN_SPOT_FALLBACK` plus a console warning if it's missing)
- Step 0 is "Grab the Raid": gaze-hold the can like any other step. Then a hand reaches out through the curtain gap, grabs it, and pulls it in to the viewmodel position (`CAN_REACH_OUT_TIME`, `CAN_PULL_BACK_TIME`). This doubles as the tutorial for the gaze mechanic. No spiders until the can is fully in hand

**Two-hand steps**
- Each routine step has a `hands` value: 1 or 2. Two-hand steps: "Lather" and "Wet your hair". All others: 1
- During two-hand steps the can lowers out of view. Pressing the mouse raises it, taking `RAISE_TIME` seconds before spraying is possible. While the can is raised, two-hand step progress cannot fill (it decays as normal)
- This is the core tension: you're most vulnerable while taking care of yourself

**Spray ammo**
- Limited spray, `SPRAY_MAX` seconds of total spray time. Placeholder gauge: small vertical bar next to the can
- When empty, the can sputters (short weak puffs, dry rattle sound) and can no longer kill
- No refills. Running dry is a legitimate, dramatic way to lose

## Phase D: Escalation and creepy tactics

**Escalation**
- Difficulty scales with routine progress (step index), not just time: spawn interval shrinks, `STAGE_TIME` shrinks, spiders start at later stages (closer, bolder) rather than only spawning more often
- All scaling curves in config.js as start and end values

**Decoys**
- Occasionally spawn a decoy: a dark spider-shaped shadow on the tiles that dissolves when the crosshair passes over it. Rate controlled by `DECOY_CHANCE`

**Off-direction audio**
- Spider skitter sounds are positional (Three.js PositionalAudio or Web Audio panning). With `AUDIO_LIE_CHANCE`, play the skitter from a different spawn point than the real one

**Atmosphere (placeholders for the art pass)**
- Steam: scene fog whose density increases with threat
- Light flicker: brief random dips in the main light, more frequent as threat rises
- Basic post-processing pass: cold blue tint, film grain, vignette. All strengths in config with an on/off toggle

**Placeholder sound design (synthesized)**
- Running water loop (filtered noise) that starts at step 1 and stops at the final step
- Spray hiss, empty-can sputter
- Spider skitter (short random clicks)
- Low sting when a spider spawns at a later stage
- Heartbeat that speeds up with threat
- Master volume and per-sound volumes in config

## Phase E: Body placeholders, final step, polish, ship

**Hands (placeholder, no rigging)**
- Simple capsule/box hands. Pose-swap approach: distinct static poses per action (reach, grip, lather), moved and swapped in code using the routine events (stepStart, stepProgress, stepComplete)
- Left hand reaches toward the current target while gaze-holding. Two-hand steps bring both hands up toward the head
- Swappable later for static .glb hand poses from Blender

**Feet (placeholder)**
- Two simple foot shapes on the tub floor, visible only when looking down near the pitch limit. Never a torso. Tune the pitch clamp so looking down shows feet but not the body
- Drain spider's final stage path ends at the feet

**Towel (final step)**
- ~~Placeholder towel (flat box)~~ A folded towel on the vanity outside the curtain gap (art pass), created in code if no `Towel` object exists in the model
- Final step "Grab the towel" after "Turn off the water". Controlled by `INCLUDE_TOWEL_STEP` in config (default true)

**Fixes**
- Shower curtain renders solid black: make its material double-sided and check normals. If it still renders black, report what you found

**Debug panel**
- Toggle with the backtick key: shows threat value, current step, ammo, living spiders and their stages, FPS
- Debug keys: K kills all spiders, G toggles god mode (no loss), N skips to next step, T spawns a spider in front of the camera

**Mobile**
- On touch devices, show a styled "Best played on desktop with a mouse" screen with the title art instead of a broken game

**Ship**
- Confirm `npm run build` works, all asset paths are lowercase, then give me step-by-step instructions to deploy to Vercel
