# Changelog

## Unreleased

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
