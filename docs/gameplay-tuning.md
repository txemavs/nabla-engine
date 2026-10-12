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

`jumpControlTuning` controls gameplay assistance during road-vehicle jumps. It
adds only angular torque while every tyre is airborne and the vehicle is actively
controlled. Gas raises the nose, brake lowers it; steering provides a small yaw
and roll correction. Bike rider weight adds pitch/roll authority using the existing
body controls. Wheel momentum reaction is retained. This is deliberately a mild
gameplay assist, not a physically exact airborne steering model. There is no
linear thrust, auto-level or removal of existing tumble; the rate limit only
stops assistance from accelerating an already fast rotation in the same direction.
Unoccupied/passive vehicles and grounded tyre dynamics are unaffected.

Road cars: W+S (or Up+Down) requests an aggressive launch without applying brakes,
using the existing launch wheelspin and reduced rear grip for drifting with A/D.
The rear grip reduction and rear-biased drive remain active at speed while W+S
is held, even after the low-speed launch wheelspin fades; no brake is applied.
Add Space to hold a stationary front-brake/rear-drive burnout. Release Space,
keeping W+S held, to launch; release S to return to ordinary W throttle.
Motorcycle W+S and front-lever mappings are unchanged.

`vehicleDamageTuning` controls cumulative physical damage: impacts above 3 m/s
add 0.3 health points per m/s above that threshold, capped at 10 per ordinary
blow. Contacts within 0.35 seconds share the strongest damage rather than adding
every wheel/collider separately. Relative impact speed of 50 m/s is catastrophic.
A 25 m/s impact costs 6.6 points: an intact vehicle survives 15 such blows and
breaks on the sixteenth. Small blows also accumulate; airborne rotation does not.
Vehicles start emitting black underside smoke only beyond 50% damage
(`vehicleDamageTuning.smokeDamageThreshold = 0.5`). Emission increases progressively
from zero at that threshold to `smokeMaxAmount` near destruction, respecting
the smoke switch and density preference; destruction replaces it with wreck smoke.

Rendimiento → Calidad → **Efecto túnel al apuntar** is an independent saved
preference (`nabla.tunnel`). Default: off on low/medium, on on high/ultra. Resetting
preferences restores the profile default. Enabled Normal view keeps its colour
and flare compositing path even at zero aim blend, avoiding colour/transparency
changes when aiming. Its peripheral blur radius is 12 pixels with a wider side
mask; only the blur strength follows aim. This costs an extra full-resolution
render target/pass while enabled, including when the weapon is lowered.

The carrier joins default menu vehicle warmup. Camera far-plane reduction checks
the whole diagonal field of view, including rolled cockpits, so seeing the horizon
in a wide first-person view retains the ordinary far plane.

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

## Restore the shipped appearance

The settings window's **AJUSTES PREDETERMINADOS** button clears the game's saved
browser preferences (including weapon poses, FOV, lighting, audio and per-model
mirror/steering adjustments) and reloads. Terrain cache and unrelated origin data
are preserved. Explicit URL/build configuration still defines the host defaults.
The action rail is hidden until gameplay is revealed and centred beneath the
menu/time button. Motorcycle mirror adjustment changes the reflected view while
keeping the visible glass fitted in its housing. HUD locality/street lookup is
coalesced and yields in small batches; labels update only when a result is ready.

Third-person weapon placement uses weaponViewTuning.thirdPerson: shoulder offset relative to the avatar head (metres), and reachMetres for the extended arm. The hand and barrel follow the camera target independently of first-person pose offsets. No arm mesh is added.

The settings HUD keeps its tabs and folds sections into native keyboard-accessible disclosures.
Development contains Weapon (aim calibration and poses), Vehicle (steering wheel and mirrors),
Lighting, and Planet/diagnostics. Fine calibration lives here rather than in everyday Options.
Closing weapon disclosures stops pose preview. Existing controls and saved settings are retained.

Shots use the authored MuzzleSocket and the weapon's full pose before trigger recoil.
The rigid RedLaserSocket and TorchSocket retain their own origins and share the same pose
conversion, including the viewmodel FOV. They do not track the camera independently.
Laser/barrel separation and ballistic drop remain physical differences.
Neutral first-person alignment is a base rotation at
`weaponViewTuning.alignmentDistanceMetres` (25 m). The reviewed gesture rotation
is applied relative to that base, so X/Z/slide animations retain their offsets.
Normal mode retains bodycam free aim; aiming converges toward its aim direction.

Sustained fire uses `weaponHeatTuning` in the same tuning module: heat per shot,
cooling time, glow/smoke thresholds and maximum dispersion angle. These are arcade
values. Only successful shots add heat; the barrel glows red, emits lingering smoke
while hot (respecting the smoke option), and bullets spread uniformly within a cone.
The rigid laser stays on its optical axis; it does not follow random bullet spread.

Weapon heat is shared by SEMI and M: 9 arcade degrees per successful shot,
180-second cooling constant. Two rapid 30-round magazines (2-second reload)
reach red; continued fire turns orange and ruptures during the third.
`weaponHeatTuning` exposes `glowStarts`, `orangeStarts`, and `ruptureHeat`.
The rupture ejects slide, barrel, frame and seated magazine using world debris
collision. The weapon stays broken until reset; reload does not repair it.
Slide heating is not simulated. This is game tuning, not measured firearm data.

Bare trailers retain the black `ChassisFrame` mesh from the source asset; only
cargo walls and box-mounted marker lights are split into the cargo attachment.
`box: false` preserves the same kingpin and towing joint as the boxed trailer.
In overhead view the equipped weapon aims along the avatar forward axis,
so its mounted laser and bullets travel through the world rather than down
along the overhead camera ray.

Bare trailer: the black LoadingDeck has a matching moving collider. Tractor menu
(J → REMOLQUE) switches RAMPA SALTO / PLATAFORMA while stopped. The deck
returns flat and stationary cars wholly supported by it are locked for transport;
opening releases cargo. With a drawn gun R still operates the magazine. The reset toolbar button
recovers the vehicle directly, even with the gun drawn.
The white-car-transporter preset has a lower tilting deck and a sliding upper section for two cars. CARGAR 2 A3 in the tractor menu
preloads and places two physical A3s in the slots in trailerPlatformTuning, locks
them to the trailer and refuses duplicate loading. Boxed trailers keep their box
and have no platform controls. Gameplay heat and all trailer dimensions are arcade tuning.

Cargo positions are in `src/config/gameplay-tuning.ts` (`trailerPlatformTuning`).
The + toolbar uses `randomVehicleTuning` in the same file: motorcycle 4, car 3,
truck 2, truck with trailer 1, standalone trailer 1. These are relative weights
(total 11). Aircraft and ships never enter this draw. Trailer variants are equally
likely: boxed, bare platform and car transporter.
The Add menu includes passive trailers too: boxed trailer, black transport
platform and car transporter. Only explicitly hidden presets are omitted.
Added platforms/car carriers have Bajar rampa and Horizontal · fijar coches buttons
in their Add list entry, so detached trailers can be operated too. Opening releases
the cars; flattening automatically locks stopped cars fully supported on the deck.
In J → REMOLQUE, ANGULO +3 / -3 adjusts the jump pitch, EXTENDER slides the upper
section rearward and RECOGER retracts it. PLATAFORMA levels and retracts both sections
before locking cargo. Telescope travel (12 m, 0.8 m overlap), speed (2 m/s), angle limits
(-30° to 2.6°) and step (3°) are in the car-transporter preset's `garage.ramp.telescope`.
The visual sections are 8 cm / 4 cm thick, with the sliding section's end tapered over
40 cm. Both have moving physical colliders; the upper collider is a thin box, so the
physical seam is at most 4 cm. These dimensions are in the authoring script and preset.
Platform colliders, hinge and loading angle are in the trailer presets under
`assets/library/cars/white-truck/`. Visible deck dimensions are authored in
`scripts/split-trailer-box.mjs`; regenerate with `npm run trailer:split`, then
`npm run rigs:generate` and `npm run assets:pack` after changing geometry.
