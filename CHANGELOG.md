# Changelog

## Unreleased

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
