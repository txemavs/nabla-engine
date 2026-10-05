# Changelog

## Unreleased

### Fixed

- **Boot / play ground wait:** `waitForGround` (and `PlanetWorld.ensureGround`) now stage
  terrain with a blocking install budget (12 ms/tick, ~rAF poll) instead of the 1.5 ms/frame
  gameplay budget polled every 100–200 ms. That drip-feed left ~15 ms of mesh staging per
  second before the frame loop started, so ~11 MB LiDAR cells could sit on loading for
  minutes. Gameplay frames keep the small budget.
- **Game host boot status:** `game/main.ts` replaces the HTML «Initializing...» placeholder
  immediately, uses analyzable `import()` paths so Vite can pre-transform both hosts, and
  `terrain-main` logs `[nabla-boot]` phase timings. `vite.game.config` pre-bundles three /
  Rapier / zod so the first visit is not an optimizeDeps discovery run.

- Add per-vehicle control profiles (`vehicle.controls`: `road`, `flight`, `none`, or a host profile from `registerControlProfile`). The browser runtime resolves the seated vehicle's profile each frame and drives the touch rigs and HUD from it instead of branching on vehicle kind. The carrier now hides the car speedometer/gear readouts (GameHud and the game's `#speed-display`/`#gear-display`) and shows only the Mode 2 sticks; on foot and trailers show neither. `GameFrame.controls` exposes the active profile to hosts. See docs/vehicle-controls.md.
- Drawing the sidearm (**Tab** on foot) captures the mouse like an FPS with pointer lock; holstering, boarding a vehicle, pausing or stopping releases it, and a click re-captures after **Esc**. Each sidearm shot plays a synthesized gunshot (`VehicleAudio.gunshot`, `src/audio/gunshot.ts`): crack, boom, thump and a short tail, scheduled on nodes built once.
- **Dynamic resolution scale.** `DisplaySettings.resolutionScaleMode` is `'auto'` by default: the drawing buffer starts at 50% of the quality profile and moves within 0.5..1 by frame budget (FPS-cap aware). An explicit `resolutionScale` is a fixed **manual** value (0.25..1) the engine never changes. `GameRuntime.resolutionScaleState`, `onResolutionScale` and `AdaptiveResolutionScale` expose it. Behaviour change: hosts that omitted `display` used to render at 100%; pass `display: { resolutionScale: 1 }` to keep that.
- **Boot probe.** `GameRuntime.probeMachine()` runs a ~3 s planet-render timing probe before play, applies the suggested start scale in auto mode and returns a `qualityTier` hint. It can overlap the terrain wait; `play()` finishes it first.
- **Skinnable splash.** `@nabla/engine/runtime/splash` (`EngineSplashSkin`: logo URL, title, message list, theme CSS, centred/corner layout) with the Nabla skin as default. The demo splash uses `--splash-*` CSS variables and reads `window.NABLA_BOOT` / `VITE_NABLA_BOOT`.
- **Attract boot view.** `GameRuntime.startAttract()` renders only sky and planet from a slow orbit while `play()` streams terrain and vehicles; `play()` stops it. The demo enables it with `?boot=attract` or the host boot config. See docs/boot-and-splash.md.

- `installHostVehicles` skips (with a console warning) any host vehicle whose ground footprint overlaps an earlier one, including a hitched trailer at its towed position and a `tow: true` trailer whose tractor was skipped. Bodies spawned inside each other were flipped by the physics, so a stall grid laid out for another heading left free trailers standing on end with their axles in the air.
- `createTerrainDriveScene({ includeDemoFleet: false })` skips the built-in parked row (car, a3, white-truck, carrier). The terrain game passes that when `?vehicles=` is non-empty so a host fleet does not stack a second carrier.
- Split `white-trailer` into `trailer.chassis.glb` + `trailer.box.glb`. `white-trailer` still spawns chassis + `white-box`; `white-trailer-chassis` is the bare frame. Host `box: false | "white-box"` and `presetVehicle(..., { box })` compose at spawn. Other box types can replace only the cargo GLB.
- Free `white-trailer` spawns rest on landing legs (Stützbein colliders + visual drop). Hitching retracts the legs; unhitching deploys them. `Simulation.hitchTrailer` / `unhitchTrailer` / `toggleHitch` couple at runtime; **F** on a tractor hitches or releases. Host `?vehicles=` accepts `color` (`#rrggbb`, same `entity.color` as cars) and `tow: true` (hitch to the previous tractor). Truck/trailer paint uses the existing White paint materials via `nabla.truck`.
- Let the standalone game (drive and terrain-folder entries) spawn extra catalog vehicles from WGS84 `lat`/`lon`/`heading` after terrain is ready, via `?vehicles=` JSON, `VITE_NABLA_VEHICLES`, or a typed `HostVehicle[]`. Existing `lat`/`lon`/`alt`/`heading`/`vehicle` remain the player start. See docs/game-library.md.
- At Alto/Ultra quality, the truck's authored left mirror captures at 16 Hz and 768×512; the right mirror and cheaper presets stay at 8 Hz / 384×256.

- Replace the invented circular Volante/Pedales pads with Studio's agency-ui drive rig: CSS steering wheel, accelerator slider, red handbrake and turbo, using the same pad mapping as `drive.ts`.

- Write ocean-sheet depth from a few centimetres inward along the planet normal instead of pulling `clip.w` 1.4 m toward the camera, so the shoreline stays on the true sea contour in overhead and map views.

- Add a terrain-folder game mode (`/?terrain=<base>&tile=<x>/<y>`) that plays the Studio play mode on real nabla-atlas Z15 packages: `@nabla/engine/planet/atlas-z15` adapts `nabla-z15-package/1` cells (LiDAR terrain name, orthophoto, package verification), static tile hosts no longer re-poll older geometry revisions or 404 neighbours, `imagery: 'package'` replaces the ArcGIS roof/ground photo, `GameRuntime` can rest every parked vehicle on the loaded ground, and the game dev server can mount a terrain folder read-only (`NABLA_TERRAIN_DIR`). See docs/terrain-folder.md.

- Make D/R changes brake to a real standstill, dwell briefly (0.3 s instead of a 1 s timer) and then engage with a torque-cut moment, and add a synthesized per-vehicle gear-change clack (`VehicleAudio.gearChange`, `powertrain.shift.clack`). Give the stock truck its own heavy gearbox: shift points, 0.55 s shift, engine inertia, launch rpm, wheel-force limit and a low clunk with air release.

- Treat OSM building outlines with contained 3D parts as non-rendered envelopes, preserving explicit parts and neighboring buildings. Add a regression for the detailed JFK building in Boston.
- Open Desktop utility windows at their final viewport position with a neutral dark titlebar and monochrome SVG controls.

- Fix Studio Play commands accidentally selecting flight entry; await physics before completing the transition. Rebuild simulated views on Stop so wheels and equipment return to authored poses.
- Use local planetary up and a consistent floating origin for the carrier horizon; correct its pitch direction. Expose explicit vehicle equipment and paint in the new inspector, preserving saved tuning and poses.

- Remove obsolete compatibility import paths, preset/portal/placement/palette upgrades and filename-based vehicle equipment lookup. Current factories explicitly compose the carrier stern portal.
- Accept only current version-3 Studio projects; remove v1/v2 conversion and old CacheStorage migration. Remove unused Studio prepared BIN/JSON and anchored-GLB loaders, their inspector, and proposal-only contracts. Update callers, documentation and current-system regressions.

- Fix Rapier gallery shots through window portals and remove invisible tree-trunk colliders from animated targets.
- Initialize fallback relief collisions even with no detailed-tile coverage, and tolerate unavailable/corrupt optional photos. Restore the geoEuskadi comparison URL and flush incremental tile installation in the zoom viewer.

- Expose composable wheeled, boat and flight runtimes, physics, monitors, menus and vehicle equipment through public package subpaths; retain version-1 scenes and existing root/catalog imports.
- Move stock road-model selection, S3 mounts and lamp selectors into catalogue adapters; reuse layered navigation readings on the boat and carrier.
- Add creation guides, dependency-boundary tests and an installed-package consumer check for independent hosts.
- Repair browser fixtures left behind by the source reorganization: dynamic module paths, CSS selectors, asset suffix checks and a shared Three.js instance.
- Smooth keyboard steering, retain manual DSG shifts and engine braking, add launch/tire feedback, adjustable mirrors and vehicle-following cameras.
- Simplify the custom wheel mesh, add vegetation crown caps, and retain bounded secondary-screen/mirror refresh and shared-resource disposal checks.

- Use sparse collision-contact history instead of resetting a quadratic dense matrix every physics tick.
- Share cockpit road-chart projections and cull paths by cached bounds at the current zoom.
- Document remaining performance work and measurement limits in docs/performance.md.

- Add a cached, worker-decoded OpenFreeMap sea layer with coastline/island polygons and animated water normals.
- Adapt the Streets GL angular sun disc/halo and retain its MIT notice and water texture attribution.
- Bound physics catch-up to four steps, remove redundant validated graph parsing and share streamed additions across undo snapshots; expose physics and sector-install timings.

- Preserve unchanged road cell buffers across map streaming and defer hidden road batch preparation.
- Prepare streamed terrain, roads and building render buffers in the world worker and transfer them without copying.

- Add a component-derived entity capability API and catalogue factories for the A3, flying container with stern portal, and highway streetlight.
- Add editable night lighting with six nearby shadowless spotlights, scene placement and saved light settings.

- Start with the weapon holstered; Tab draws/holsters it and F8 starts/stops play.
- Keep carrier screens active throughout the occupied interior and lower/retract the pilot eye and monitor anchor by 10/20 cm.

- Preserve generated map fingerprints across saves so unchanged sectors remain evictable; verify legacy saved zones against their source before reclaiming them.
- Let moving-world downloads finish warming the cache instead of repeatedly cancelling them in fast flight; retain cancellation on scene changes.
- Retry transient OSM HTTP failures once and use consistent origin-sector identifiers when reloading the starting zone.

- Keep selection bounds in object-local axes so the outline rotates with the selected entity instead of changing size with its world orientation.

- Stabilize side-mirror captures against head rotation by fitting the whole lens from the eye position, independently of the viewport crop.

- Match the upper helm screen titles to the flight desk typography: telemetry, navigation and portal.
- Add cockpit-only, visibility-culled A3 side-mirror reflections capped at 8 Hz.
- Power down unoccupied A3 displays and lamps; add lower red brake lights, inner white reverse lights and upper amber turn signals.

- Lower the A3 cockpit eye anchor 5 cm; add white dashboard speed digits and a label-free blue map on the original navigation display.

- Reorganize the helm into left telemetry, central local road chart and right stern controls; add paired mode-2 circular D-pads and desk switches with clearance from the upright screens.
- Batch static OSM roads by spatial cell/material while playing, skip their per-frame simulation pose updates, and add an independent road detail distance.
- Avoid inactive CSS screen raycasts, redundant DOM/resize work and closed-portal preparation; expose frame P95, CPU frame time and render counters under Performance.

- Centre one 8 mm landscape tablet on each independent portal rear; use black closed surfaces and dark rear panels.
- Reuse the carrier helm for flight mode, stern portal controls, live speed/altitude and adjustable flight speed.
- Replace the nose-camera feed with a horizontal CSS flight touchscreen; close the bow with armoured glass and physical collision.
- Apply the original Agency room atlas to darker, non-emissive interior panels.
- Animate the garage door and require complete closure before connecting its portal; opening the garage disconnects it first.

- Replace floating portal controls with black, perspective-matched CSS tablets that activate within one metre and expose native destination/open/close controls.

- Add visible carrier interior lining and camera-matched HTML/CSS displays with WebGL occlusion.

- Add a persistent map-building visibility option, disabling hidden building collisions while retaining terrain, roads and scene data.

- Remove permanent solid edge overlays and retain topology lines in the solid editor.
- Make room for dense map zones before installation, prioritizing nearby unedited detail within an 18,000-entity residency budget.
- Keep streamed map updates out of undo snapshots belonging to other geographic destinations.

- Raise A3 chassis ground clearance by 5 cm through suspension extension; migrate recognized saved stock A3 presets without repeated lifts.

- Keep the latest 64 solid-surface bullet impact marks, aligned to hit normals and attached to moving objects, including shots through portals.

- Add an Ir menu with city presets, coordinate travel, loading/cancellation, failure preservation and undo back to the previous scene.
- Isolate malformed imported OSM buildings so one degenerate solid cannot reject an entire district; report omitted building counts.

- Recover failed map imagery, fill neighborhood corners and extend the continuous flight prefetch corridor to 4.8 km.
- Remove the eight-second delay for cached zones, isolate per-zone retry cooldowns and cancel obsolete loads after travel.

- Accelerate carrier drone flight to a 1000 km/h target with altitude hold and automatic braking.
- Add persistent draw distance, map collision radius, render resolution and shadow quality controls.
- Organize file actions, environment/performance settings and controls in File, Options and Help header menus; reserve the inspector for selected entity properties.
- Cull distant map rendering separately for main and portal cameras, and suspend distant map building physics around every actor.

- Add a private Docker disk cache for OSM queries and Esri elevation, configured outside the repository.
- Extend real-world visibility to approximately 4 km with coarse distant terrain and consistent atmospheric fog.

- Stream neighboring OSM/Esri zones ahead of travel without resetting actors; cache extracts, release distant clean zones, retain edits and guard unloaded ground.
- Save large streamed scenes through IndexedDB when localStorage is full.

- Generate editable gabled, hipped and skillion roofs for compatible OSM building footprints, preserving tagged total height.

- Add the first real-data district in Irun Ventas/Katea, with 376 OSM building
  footprints, named streets, local edits and Esri terrain heights.
- Share triangulated terrain between visual roads and physics, protect the finite
  ground boundary and preserve the original circuit as an explicit scene.

- Introduce individual editable solid building entities with points, lines, convex
  faces, corner editing, face extrusion and deletion, independent cloning and undo.
- Use authored face collision so openings remain traversable; migrate reference
  buildings from separate blocks and window strips to topology components.
- Document the solid format, current modeling limits and future catalog boundary.

- Reveal viewport selections in the entity tree by expanding ancestor groups and
  scrolling to the selected row.
- Consolidate creation actions in a + menu beside the scene entity count.

- Repair the original Stargate frame's inward triangle winding and flat-face
  normals at load time, preserving the source GLB and portal behaviour.

- Halve the monitor presentation size in exploration and at the wheel.
- Keep tree billboards upright, mix the generated tree back into the scenery and
  soften the original Videotiro foliage with shader saturation.
- Add inexpensive fixed ground silhouettes sharing each tree texture, without
  shadow maps or extra image assets.

- Align the A3 steering wheel to its measured column cap and centre its animated
  rim axis; migrate recognised old mounts without changing the cockpit camera.
- Prevent tree/target depth flicker with alpha-tested opaque cutouts and separated
  gallery depth rows, including upgrades for the original target placements.
- Add the user's five original Videotiro trees, distributed at varied sizes over
  the circuit's grass and used in the gallery.

- Integrate the supplied HK USP Compact body and slide GLBs, preserving materials
  and alignment, with a first-person visual slide cycle and loading fallback.
- Record the Videotiro layered-scene formats and the distinction between fixed
  photographic planes and billboards before designing an importer.

- Restore gravity after monitor drops, brake back to normal hover clearance and
  give Space a single jump impulse.
- Align 18 building footprints with the Agency circuit JPEG and keep painted
  streets visible; migrate the previous saved baseline plan undoably.
- Add local transparent PNG billboards with shared textures, alpha-aware hits and
  an optional timed 2.5D window gallery with one-hop portal shots.
- Allow leaving the carrier helm inside its cabin at altitude, moving in its local
  frame, visiting a ground destination and returning while flight hold continues.

- Activate the container's original bow/stern Stargates with nearby destination,
  open and close controls; preserve ordinary garage access while inactive.
- Add atomic runtime relinking, occupied-frame protection and host-relative
  moving-mouth transfers. Level the stern ramp during an active connection.
- Install hosted mouths additively in older container scenes and preserve their
  metadata through copy, delete, undo and scene persistence.

- Start monitor exploration in first person, with C/B toggling third person.
- Add compact ground-following hover locomotion for curbs and ramps.
- Add a provisional sidearm, reticle, hitscan impacts and impulses on dynamic props.

- Attach cockpit gaze rigidly to the car with relative mouse look; share its
  unchanged eye anchor with a seated CRT avatar visible in exterior views.

- Stabilize driving presentation with shared physics/render interpolation and
  filtered camera telemetry; remove instantaneous speed-based FOV/distance changes.
- Add a north-up overhead driving camera, with mouse-wheel height adjustment.
- Restore the monitor avatar's forward-facing orientation; retain cockpit height.

- Move the car cockpit eye forward/down and enable responsive automatic heading
  follow in both camera modes, with bounded speed/turn anticipation.
- Replace the placeholder character with Agency's CRT monitor avatar, animated
  with travel banking, braking recovery and a subtle hover.

- Add an opt-in fixed Stargate pair with the original Agency frame, live remote
  views, reciprocal destination editing and closed/window/open modes.
- Transfer walkers and vehicles within the existing simulation, with aperture
  checks, box-collider exit clearance, velocity rotation and retained driver state.
- Document the prototype limits and the design for hosted gates and CSS interiors.

### Changed

- **Mouse look without a click:** in the chase/third-person view, on-foot first person and
  the cockpit view, moving the mouse over the focused viewport orbits or turns the head with
  no button held. The vehicle overhead view still leaves the cursor for wheel zoom. The first
  hover delta after the cursor re-enters the canvas (and any single warp-sized jump) is
  ignored so the view does not jerk.
- **Flight chase perspective:** while a vehicle is in flight mode the chase camera leans back
  `flightChaseTilt` (0.12 rad, about 7°), eased by `flightTiltDamping`, so the aircraft sits
  lower in frame with more of the route ahead visible. The tilt fades out with the
  high-altitude top-down travel pitch and never applies to the cockpit or overhead views.

## 0.2.0 — Working foundation

This baseline replaces the earlier Agency extraction with an independent engine
and reference browser playground. It is a breaking API revision, not an npm release.

### Included

- Validated scene-v1 documents, rigid hierarchies and transactional editing.
- Shared fixed-step physics, walking, driving, safe vehicle exits and reset isolation.
- Original Audi A3 Cabrio assets, driver camera and steering limited to ±90°.
- Original 5 × 10 m carrier with compound interior, folding ramp and cargo latching.
- Ground/assisted flight, mode 2 controls, altitude hold and loaded geographic travel.
- GPS origin, Agency ground JPEG, connected/offline maps and planetary rendering.
- Earth, Sun, Moon, day/night lighting, persistent time selection and a live clock.
- Shared horizon haze across local and planetary rendering scales.
- Official Nabla SVG branding and English project documentation.
- Unit/physics and browser regression suites, production builds and CI checks.

### Deferred

Portals, Agency integration, physical terrain/buildings from map data, NPCs,
multiplayer, interactive model import, nonstandard radio calibration and orbital
mechanics. Earlier implementation details remain available in Git history.

### Studio desktop UI

- Adopt Vue UI components and `@nabla/desktop` 0.2 for shared menus, tools,
  inspector fields, scene categories, sidebar windows and the information console.
- Add the agreed workspace layout, object-class scene view, entity portal
  properties and capability configuration, keeping the current engine APIs.
- Persist water settings in scene/project documents alongside sky and location.
