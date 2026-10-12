# Gameplay tuning: camera, weapon and effects

The single editing entry point for this gameplay update is
[`src/config/gameplay-tuning.ts`](../src/config/gameplay-tuning.ts).
Import it as `@nabla/engine/config/gameplay-tuning`. The previous camera and weapon
modules re-export the same defaults; they do not own duplicate copies.
Rebuild after source edits. Browser preferences can override defaults: reset the
corresponding panel to see newly edited values.

## Where to change each parameter

| Export in gameplay-tuning.ts                   | Controls                                                                                                          | Units                                                                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `gameCameraDefaults`                           | All shared view FOVs, clipping, chase/cockpit/map distances, camera transitions and recovery                      | Field comments specify metres, radians, seconds or milliseconds; FOV is vertical degrees                         |
| `cameraFovTuning`                              | Player FOV offset, limits and menu step                                                                           | Degrees; default +15, range -15 to +25                                                                           |
| `normalViewTuning`                             | Normal default, extra FOV, foot camera height offset, free-aim angular limits and camera follow                   | Degrees for extra FOV; metres for height; radians for limits; inverse seconds for follow                         |
| `weaponViewTuning`                             | Weapon hip/aimed base position and private-camera FOV, aim blend, inspection/slide blend, reviewed base rotations | Positions in metres, FOV in degrees, base rotations in radians, durations in ms; aim blend is per rendered frame |
| `sidearmTuningDefaults`, `sidearmTuningRanges` | Sight alignment: aimed height and muzzle pitch                                                                    | Height in metres (-0.022); angle in degrees (-1.2); ranges are min/max/step                                      |
| `weaponPoseDefaults`                           | All twelve normal/aimed, Z, X, F, F+Z and F+X offsets                                                             | Pitch/yaw/roll in degrees; x/y/z in millimetres                                                                  |
| `focusTuning`                                  | Near lateral blur while aiming: pixel radius, side mask, near depth range                                         | Pixels, normalized half-screen distance, metres                                                                  |
| `laserTuning`                                  | Beam width, point radius, halo size/opacity, surface lift, slow size growth                                       | Pixels/metres; growth per metre; opacity 0–1                                                                     |
| `smokeTuning`                                  | Default and maximum smoke quantity                                                                                | Percent: 50 default, 0–300 slider                                                                                |
| `explosionTuning`                              | Blast radius/speed, off-centre application spread, direction jitter, wheel drag/sleep, smoke/flame lifetime       | Metres, m/s, m/s², seconds                                                                                       |
| `balloonTuning`                                | Trunk opening, emission duration/rate, balloon lifetime/pool                                                      | Radians, inverse seconds, seconds, count                                                                         |

Pose offsets are **relative to the reviewed poses**, not absolute Euler rotations.
`weaponViewTuning` holds those base inspection rotations separately. Right mouse
raises/aims the weapon; Z and X choose its inspection rotation. F and magazine
actions work independently. The settings panel previews every combination and
copies version-2 JSON (degrees and millimetres) for `weaponPoseDefaults`.
Aim alignment is the separate `aim` object in the copied JSON.

## Views and controls

Normal is the default first-person behavior (internally `bodycam`). Modo Puntero
restores the earlier aiming behavior. Select only in Options → Primera persona;
B no longer toggles it. C cycles first person, third person and overhead on foot;
while driving it cycles chase, driver and overhead. Driver eye height is unchanged
in both preferences. Normal lowers the camera only on foot and adds 12° FOV,
removed smoothly with the weapon's aim blend. Near peripheral blur shares that
blend; the weapon and central sight picture remain sharp. HDR/linear postprocessing
applies display tone mapping once; the solar flare is composed afterward with
scene-depth occlusion.

| Weapon control | Action                                                                           |
| -------------- | -------------------------------------------------------------------------------- |
| R              | Drop current magazine; press again with an empty well for a full normal magazine |
| M              | Replace with a full extended 30-round magazine; automatic fire                   |
| F              | Work slide, or close it using the catch when already open                        |
| Z + fire       | Toggle safety; Z alone inspects                                                  |
| X              | Inspect chamber                                                                  |
| Right mouse    | Aim, independent of inspection and magazine/slide manipulation                   |
| G / H          | Laser / flashlight                                                               |

Fresh magazines are unlimited supplies, but each dropped magazine retains its
own ID and rounds. Chamber and magazine ammunition are separate. Manual slide
operation ejects a live round if chambered; dropping and racking cannot create
an inserted magazine. Ground pickup is not implemented. Empty automatic fire
makes a single dry click per press. Hammer movement has a matching handling sound.

`GameToolbar` owns action group layout, styling and order. Navigation is first,
weapon actions next, then FOV (live slider/reset) and + (random non-hidden catalog
vehicle through the existing free-ground placement and warmup path). The + button
is disabled during loading. FOV adjusts the existing offset, not the weapon camera.

## Persistence and host overrides

| Browser key                         | Override                         |
| ----------------------------------- | -------------------------------- |
| `nabla.bodycam`                     | Normal=true, Modo Puntero=false  |
| `nabla.cameraFov`                   | User FOV offset                  |
| `nabla.sidearmTuning`               | Aimed height/pitch               |
| `nabla.weaponPoses`                 | Per-pose offsets                 |
| `nabla.smokePercent`, `nabla.smoke` | Smoke quantity and enabled state |

Host `camera` options override `gameCameraDefaults` before the user FOV offset is
applied. Final Normal hip FOV is base first-person FOV + user offset + Normal extra;
aimed FOV smoothly removes the extra. The weapon has its own 55°/42° camera.
Settings labels are Normal and Modo Puntero; internal identifiers remain compatible.

## Effects, audio and assets

Laser brightness increases only along portions crossing live exhaust/wreck smoke.
The hit point stays small; beam ends at the first hit. Other particle systems are
not yet included in the smoke-density sampling. Metal impacts use four timbres,
nonrepeating selection and bounded pitch, envelope and resonance variation;
`src/audio/metal-impact.ts` owns the procedural timbre design and
`src/config/audio.ts` the existing mix. Audio nodes/material warmup avoids allocating
the first effect at the moment of interaction.

See [vehicle destruction](vehicle-damage.md) for wheel detachment, disappearing
panels, asymmetric blast and black smoke. Rear shots on intact cars with a named
`Maletero`/`Trunk` open the trunk and emit balloons for 30 seconds; another rear hit
restarts the timer, then the lid closes. Exploding stops emission. Balloons are
bounded cosmetic objects, not physics bodies. Glass intercepts a shot before the
chassis interaction. Source geometry and moving-part node bindings remain in the
reviewed GLB and `assets/rigs/weapons/hk-compact.rig.json`; do not regenerate the
reviewed model with the legacy authoring script. Mechanical weapon specifications
remain catalog data (`assets/library/weapons`), not duplicated tuning constants.

The local Euskadi host has extra branding/tips in `/home/txema/projects/euskadi/euskadi-hud.ts`.
That deployment-owned file is outside this repository/PR; engine controls, settings
and toolbar are versioned here. The host must update old B/T/Y tips independently.

Effect warmup includes on-foot start views and detached physical wheels. It runs
after gameplay lighting is prepared and draws effect buffers offscreen, including
transparent front/back passes, before the first explosion.
