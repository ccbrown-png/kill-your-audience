# Art Pass Report (Nov 16, 2026)

All five phases done in one unattended run. `npm run build` passes, the game loads with no console errors, and a scripted playthrough won (all 10 steps, 8 kills, rank FINAL GIRL) and lost ("THEY WERE WATCHING YOU.") on both quality settings.

**Rollback:** `_backup_before_art_pass/` has the old `src/`, `index.html`, `DEVLOG.md`, `GAME_SPEC.md` and the original 20 MB `public/models/bathtub.glb`. To undo everything, copy those back over. This folder is not a git repo, so there were no commits.

**Review the art yourself:** `npm run dev`, then open `http://localhost:5173/?gallery=shower` (or `cabinet`, `can`, `spider`, `hand`, `feet`). Drag to turn. Extras: `&pose=relaxed|reach|grip|gripCan|spray|lather|rinse|towel|reachOut` for the hand, `&pose=idle|walk|sprayed|dead` for the spider, `&quality=low` anywhere.

---

## 1. Assets and screenshots (`art_pass_screenshots/`)

| Asset | File (`src/art/`) | Screenshots |
| --- | --- | --- |
| Tile walls, enamel, chrome, caulk | `showerMaterials.js` | `shower_1_spawn_view`, `shower_2_left_wall_and_corner`, `shower_4_looking_down`, `shower_5_wet_tile_closeup`, `shower_gallery_turntable_a/b/c` |
| Tub, drain grate, caulk lines | `tub.js` | `tub_1_drain_and_puddle`, `tub_2_drain_grate_closeup`, `tub_3_rim_caulk_corner` |
| Showerhead, handles | `fixtures.js` | `fixtures_1_handles_spout`, `fixtures_2_showerhead_face`, `fixtures_3_showerhead_side` |
| Curtain, rings, rod | `curtain.js` | `curtain_1_inside`, `curtain_2_outside`, `curtain_3_rings_and_rod` |
| Shelf props (bottles, soap, loofah, razor) | `shelfDressing.js` | `shelf_1_front`, `shelf_2_left_angle`, `shelf_3_from_above` |
| Water: streaks, puddle, steam | `water.js` | `water_1_streaks_from_spawn`, `water_2_puddle_ripples_low`, `water_3_steam_and_streaks` |
| Lighting: bulb, fill, spill | `lighting.js`, `environment.js`, `postFx.js` | `shower_3_looking_up_bulb`, plus all of the above |
| Room outside the curtain | `room.js` | `curtain_2_outside`, `cabinet_*` |
| Vanity, mirror, towel, cup, soap | `cabinet.js` | `cabinet_1_gallery_front`, `cabinet_2_gallery_left`, `cabinet_3_gallery_right`, `cabinet_4_through_gap_from_spawn` |
| Raid can and cap | `raidCan.js` | `raid_can_1_front`, `raid_can_2_three_quarter`, `raid_can_3_back_directions`, `raid_can_4_on_vanity_with_cap` |
| Spider | `spiderModel.js` | `spider_1_front`, `spider_2_side`, `spider_3_three_quarter_back`, `spider_4_walking`, `spider_5_sprayed_flailing`, `spider_6_death_pose` |
| Hands | `hands.js` | `hand_1_relaxed_back` to `hand_9_reach_out` (one per pose) |
| Feet | `feet.js` | `feet_1_front`, `feet_2_side`, `feet_3_back` |
| In game | | `gameplay_1` to `gameplay_7` (spraying, towel reach, lose zoom, grab through the gap, holding the can, faucet reach, spiders on tile) |

Supporting files: `artDirector.js` (builds and updates everything), `bake.js` (GPU texture painter), `sdfMesher.js` (sculpting tool for organic shapes), `layers.js`, `quality.js`, `gallery.js`, `galleryEntries.js`. `tools/slim-glb.mjs` shrinks the model.

Every asset was shot from at least 3 angles and revised at least twice. What changed each round:
- **Lighting:** first pass was 6x overexposed. Then a white bloom haze. Then the final contrast.
- **Chrome:** black blobs, then given its own reflection map.
- **Grout:** read as 8 mm. Sharpened.
- **Can label:** stretched tall. Canvas fixed to the can's real proportions.
- **Spider:** markings invisible and over the triangle budget. Fixed both.
- **Hands:** thumb looked like a sixth finger. Rebuilt the thumb base, then fixed pore noise, knuckle balls, the can grip and forearms crossing the screen.
- **Feet:** finger-like toes. Then hollow shin tops seen from above.

---

## 2. Decisions I made without asking

1. **Where the vanity goes:** against the back (faucet) wall, just past the tub, so it's in the curtain gap. Change it with `VANITY_POSITION`.
2. **Curtain pulled more open:** the original edge reached z -0.98. From PlayerSpawn that hid the vanity, so the can was invisible. It's now -0.78 (`CURTAIN_OPEN_EDGE_Z`). The stall feels a bit less enclosed. Try -0.85 if you want it tighter. Check the can is still visible.
3. **Curtain rebuilt in code, not reused:** the Blender cloth had a busy teal/brown pattern and black metal parts. It's now plain frosted vinyl (Psycho-white), with mildew at the hem. The mesh keeps the name `ShowerCurtain`.
4. **Black curtain bug, explained:** the curtain and rod in the .glb used a metal/roughness texture marking parts as fully metallic. With no environment map, metal reflects nothing, so it renders black. That's why it was black on some machines and not in tests. Fixed by non-metal vinyl and a reflection map for chrome.
5. **The mirror never reflects the real scene.** A real reflection would show your body (no-torso rule). It's polished metal reflecting a fake room, under a fog layer.
6. **The towel moved** from the placeholder box to a folded towel on the vanity. It's still the `Towel` gaze target.
7. **Invisible gaze box around the shelf.** The new bottles left gaps where you'd hit the tile instead. Without it, "Grab the shampoo" got stuck in testing.
8. **Spider look:** wolf-spider style, pale brown markings (`SPIDER_MARKING_COLOR`) on near-black, so the pattern reads in this lighting. The dull red eye glint is kept for the B-movie.
9. **Spider = one mesh with code-built bones.** No Blender rig. It's one draw call per spider. Geometry and materials are shared by every spider.
10. **Hands:** the left hand is a mirror of the right. While holding the can, the right hand is placed by a computed grip, so it moves with the can when it sways or lowers. `CAN_GRIP_TURN_DEGREES` shows more or less of the back of the hand.
11. **Forearms end at an "elbow" point behind the camera.** It's raised and out to the sides for the hands-on-head steps, so an arm never crosses the screen.
12. **Hand poses build in the background** while the title screen is up, about 0.35 s each. Only the relaxed pose is built before the game is clickable.
13. **Shin fade:** feet stop with a dithered fade about 20 to 29 cm up, darkening into shadow first. You never see a cut edge.
14. **Fictional brands:** SILK NOIR, MIDNIGHT ORCHID, ARCTIC SURGE. The can label is my own red/white "RAID" design. There's no `public/` label image to use, and it doesn't copy the real logo. The back has B-movie directions: "Do not use in the shower. (Too late.)"
15. **The room outside the curtain:** institutional green-grey paint and black-and-white checker linoleum. There's a dome light that is the source of the spill.
16. **Spray particles are brighter** (they glow slightly). White mist vanished against the new pale tiles.
17. **The test hook:** `window.__raid` only exists with `?test` in the URL, for the automated scripts. Players never see it.

---

## 3. What I couldn't get to look great, and why

- **Showerhead face:** the nozzle nubs are real geometry, but at game distance they're 2 to 3 pixels. From below, the head reads as a chrome dome more than a nozzle face. The bulb also throws a big hard shadow of the head onto the tiles (`fixtures_3`).
- **Hands, up close:** good silhouettes, knuckles, nails and creases, but the surface is a little "smooth clay." Real skin detail (veins, tendons, fine wrinkles) needs a sculpted mesh or a texture from a real hand. In game, at viewmodel distance, they read well.
- **Feet, up close:** believable shape, slightly chunky ankles. They're only ever seen from 1.5 m above, where they look right.
- **Hands lit by the bulb:** hands raised near the bulb (rinse, head) get very bright. That's physically correct, but harsh. I lowered the rinse hand and the skin gloss. Further control would be a separate, dimmer light rig just for hands.
- **Grime is subtle:** the cold blue grade (55% desaturation) eats the rust and scum colours. They're placed correctly, just quiet. Raise `TILE_GRIME` or lower `POST_TINT_STRENGTH` for more.

---

## 4. Known issues

- **Shelf placement:** the routine still points at the Shelf on the faucet wall, so you rarely need to turn (an existing Blender to-do).
- **Floating Drain cube:** the `Drain` marker cube in Blender floats 17 cm above the real drain. I hid it, but it's still a gaze target and still where the fallback `Spawn_Drain` lands, so the drain spider starts on an invisible ledge. See Blender steps.
- **Raised hands:** during "Wet your hair" and "Lather" the hands sit mostly above the top edge of the screen. Only fingertips show. Lower `leftHead`/`rightHead` y in `HAND_POSES` if you want to see them.
- **Asset folders outside the build:** `art_pass_screenshots/` (73 MB) and `_backup_before_art_pass/` sit in the project folder. Vite doesn't ship them. If you put this on git, add them to `.gitignore`.
- **Unused placeholder files:** `src/placeholders/raidCan.js`, `hands.js`, `feet.js`, `towel.js`, `postProcessing.js` are no longer used, but kept for reference. `CAN_SHELF_FALLBACK_POSITION` in config is unused, and marked as such.
- **The `RaidCanSpot` warning:** a console warning appears until you add the Empty. It's a warning, not an error.
- **Untested by ear and eye:** headless testing can't judge feel. I need you for frame rate on a real screen, motion of the gait and hands, and the grab timing.

---

## 5. Performance

Measured in headless Chrome on this Mac (Metal), 1440x900, during the scripted playthrough. Frame rate is capped at 60 by the browser.

| | QUALITY 'high' | QUALITY 'low' |
| --- | --- | --- |
| Frame rate | 60 fps (worst frame 18.7 to 20.5 ms) | 60 fps |
| Draw calls per frame | 674 to 752 | 253 to 264 |
| Triangles drawn per frame (all passes) | 1.7 to 2.1 M | 0.31 to 0.34 M |
| Load to "CLICK TO SHOWER" | about 1.7 s | faster |

- **Per asset:** spider 13,070 triangles (budget 15k). Hand pose about 34k triangles. Foot about 20 to 25k.
- **High vs low:** high adds ambient occlusion, bulb and spill soft shadows, frosted-vinyl transmission, wall beads and running drops, curtain beads, and finer textures and meshes.
- **Model size:** `bathtub.glb` went from 19.52 MB to **0.45 MB**. Every named object, Empty and mesh is unchanged. Only the unused textures and vertex colours were removed.

---

## 6. Blender steps for you

1. **Re-slim after every export.** The model is now tiny, but a fresh Blender export will bring back the 18 MB of textures. After exporting, run this in Terminal from the project folder:
   `node tools/slim-glb.mjs public/models/bathtub.glb public/models/bathtub.glb`
   To avoid the textures in the first place: in the glTF export dialog, open **Material** and set **Images** to **None**. Also untick **Data > Mesh > Vertex Colors**.
2. **Add `RaidCanSpot`:** Add > Empty > Plain Axes, name it `RaidCanSpot`, and in the N panel set **Location X 0.27, Y 1.22, Z 0.83**. That's on top of the vanity (Blender's Y is the game's -Z). The code uses it instead of the fallback and the warning goes away.
3. **Fix the Drain cube:** move it down onto the real drain at **X -0.389, Y 1.25, Z 0.152**, scale **0.035 x 0.035 x 0.004**.
4. **Still open from before:** add the `Spawn_*` Empties, and move the Shelf to a side wall. Bottles follow the Shelf automatically. If you move it, raise `TILE_GRIME`'s soap-scum target too: the scum position under the shelf is hard-coded in `showerMaterials.js` (`shelf` uniform).

---

## 7. One hands-on change per phase (in `src/config.js` unless noted)

1. **Phase 1:** set `BULB_SWING_DEGREES` to 15. *Why:* you'll see how a moving key light makes every shadow in the room crawl, which is free dread with zero new art.
2. **Phase 2:** set `CURTAIN_OPEN_EDGE_Z` to -0.9, reload, and look for the can from the start position. *Why:* it shows how one number of level layout decides whether the player can even see the objective.
3. **Phase 3:** set `SPIDER_MARKING_COLOR` to `0x141210` (same as the body). *Why:* the spider turns into a blob, which teaches you that readable silhouettes come from contrast, not detail.
4. **Phase 4:** set `CAN_GRIP_TURN_DEGREES` to 0, then 70. *Why:* the same anatomically correct grip reads as a stump or a hand depending only on camera angle. Viewmodels are posed for the camera, not for anatomy.
5. **Phase 5:** add `?quality=low` to the URL and compare with high, then flip `QUALITY` in config. *Why:* you'll see which expensive effects actually carry the look and which you'd never miss.
