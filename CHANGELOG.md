# Changelog

## Unreleased

### Added

- Audio mixer: master → engine bus (every engine, starter, turbo, turbine and propeller voice) and music bus; tyres, gears, gunshot and brakes stay on master. `GameRuntime.audioMix` / `setAudioMix` (0..1, squared slider curve, music mute), saved as `nabla.audioMix`. Ajustes → Opciones → Sonido has General, Motor and Música sliders and «Silenciar música».
- Background music: `GameRuntimeOptions.music` (and `NABLA_BOOT.music` in the game host) takes encodings in preference order. The track streams through an `<audio>` element into the music bus, loops, starts after the first gesture and pauses while the page is hidden. Default music level 50% (TODO(unverified): a taste choice).

### Added

- J menu «VISTA FOV» (last page): widen or narrow the cockpit/on-foot and chase cameras in 5° steps (−15° to +25°, or NORMAL). Saved as `nabla.cameraFov`. The overhead view shares the chase FOV; the cinematic camera keeps its own.

### Changed

- Engine over gear shifts on every vehicle: the engine bus has a fixed +4 dB trim (`engineBusTrim` 1.6) and car/truck clacks and the bike click play at half gain (`gearShiftLevel`, about −6 dB), so a shift is subtle under the engine. A limiter on master keeps the louder mix from clipping. Pistol reload clicks are unchanged.
- Alto and Ultra now start with artistic clouds, 40% cloud cover, custom cloud pressure at 80% and sun flare at 80% (Destello del sol). Sky, sun, sea and clouds stay on. A saved Planeta choice (`nabla.planetVisual`) still wins. Sun light intensity is unchanged (3.2).

### Fixed

- Side mirrors now paint the same sky as the main view. The reflection used to clear to the scene fog (dark navy) because the sky lives in its own pass and never reached the mirror target; the horizon line in the glass was that clear colour. The mirror fallback clear matches the sky backdrop (`#a6bbd5`).

- Zenithal camera: zooming out no longer turns trucks black. A downward view used to leave the vehicle in the last shadow cascade (the 140 m cut is still in the air), and that map is sized to the far plane. Cascade 0 now ends just past the ground under the camera.

- Overhead camera: switching into the zenithal view no longer climbs out through the cabin for 700 ms (that blend lerped the field of view and rebuilt the shadow cascades every frame). The view cuts to the overhead pose, which is already being tracked. A start sequence can still blend by setting its own transition. While the camera looks steeply down, the far plane is capped to the ground under it so the shadow maps are not sized to a 12 km shaft.

- Pistol: left click fires while aiming (right button held). Pointer lock does not report that second button as a pointer event, so the mouse button is read as well.
- Overhead camera: turning at speed no longer rotates the view in small steps. The heading follows the nose continuously (shortest angle, render frame) instead of copying each physics tick.

- S3 instrument cluster: the gauge display sits 1.5 cm higher in the car (chassis up), so the dash lip no longer covers the bottom of the dials. The offset is the preset's `clusterOffset`.

- Trucks and trailers: the cargo-box skin (`Chassis B`, albedo ~0.02, metal 0.45, no environment) rendered as a flat black silhouette. It now takes the same body colour as `White paint`. S3 / A3 cabin cloth and plastic authored under 0.08 linear are floored so the interior is not pure black. TODO(unverified): the cabin floor is not a measured swatch.

### Changed

- The Audi S3 instrument cluster sits 5 mm lower than the previous 15 mm raise (`clusterOffset` y 0.015 → 0.010).
- On a coarse pointer the enter/camera buttons stack on the left above the clock, and the accelerator sits beside the wheel, so the wheel can be grabbed. Fine pointers keep the horizontal bar.
- The truck diesel is much louder (idle gain 0.04 → 0.12, load 0.075 → 0.225, about +9.5 dB) and its turbo whistle sits a bit lower (700–2200 Hz → 580–1780 Hz). TODO(unverified): not a measured recording. Starter click, jake and blow-off stay as they are.

- Pistol reload: the magazine release and the magazine insert are louder (+8 to +10 dB) and not the same tick. The release is a dull knock, the insert a short sharp click. Gearbox clicks are unchanged.

- Bike: mounting a fallen bike (E, next to it) does the R reset. The rider is seated, the bike stands up and, with road snap on, moves to the nearest road. An upright bike is unchanged.
- Starter (every vehicle): one mechanical click and a very brief crank (about 0.2 s), then the engine catches on the first try and idles. No starter whine. The running voices are unchanged.

- Pistol reload: the pistol rises, the spent magazine drops out of the grip and stays on the ground (same bounce and lifetime as a shell casing, eight at most), then a fresh magazine is inserted and the pistol comes back down. Timed to the existing reload (magazine out 0.35 s, seated 1.25 s). The magazine is the model's `Magazine` node.

- Starter (every vehicle): the crank is half as long, about 0.5 s (was 0.95 s). The running voices are unchanged.
- Truck: the diesel pulse train stays, pitched down so its strong partial matches yesterday's note (`rpm/24` instead of `rpm/20`). No jake bark and no turbo blow-off chirp on lift-off; the engine itself stays audible. Air-brake hiss remains.

- Truck pulling power follows the Mercedes-Benz OM 471 390 kW rating: 530 PS and 2,600 Nm (was 504 PS / 2,400 Nm). The diesel timbre is TODO(unverified).
- **Chrome follows the light on the surface.** The S3 trim, the VFR silencer end cap and the disc
  buttons use a neutral studio reflection (whiter base 0.93, roughness 0.15, metalness 1, no
  emissive). That reflection is multiplied by the light that actually arrives: shadowed direct
  light plus ambient. Sunlit chrome stays bright; shade and night do not glow. The wheel rim lips
  stay unwrapped, so they still darken on their own.

- **VFR800 metal map (Txema's review):** chrome only on the brake discs (their tracks and floating
  buttons) and the stainless end cap of the silencer (`Stainless chrome silencer end cap`, roughness
  0.12, reflections 0.75). The silencer can joins the headers and the engine on the top triple
  clamp's satin aluminium; the fork stanchions are a polished aluminium grey (base 0.5, roughness
  0.3), no longer chrome. Headlamp reflector and mirror glass unchanged. Regenerated with
  `scripts/prepare-vfr800-cockpit.mjs` from the phase-1 GLB.

### Added

- Wheels know asphalt from grass when road data is loaded. A contact inside a mapped carriageway (scene roads plus the OSM navigation roads used by the R reset, compared with that road's width) is asphalt. Off that carriageway, grip drops to 0.42 of the vehicle's own tyre grip (car, bike and truck share the factor; TODO(unverified), not a measured friction) and the skid marks are brown-green. Marks still fade with the existing tyre-mark lifetime. No road data leaves grip and mark colour unchanged. A paved lot that is not a carriageway reads as grass.

- **HK USP Compact as a firearm:** the assembled model (slide, trigger, magazine, muzzle) replaces the
  split viewmodel, and the preset carries the real pistol's data with sources (HK manual: 9 mm x 19,
  13-round magazine plus chamber, slide lock on empty, magazine drops free; Federal AE9AP: 124 gr at
  1150 fps from a 4 in barrel, velocity table, G1 0.15). Semi-automatic with a trigger reset; **R**
  reloads (a tactical reload keeps the chambered round); muzzle rise goes onto the aim; the bullet
  flies the published trajectory and transfers its momentum; spent brass ejects to the right, bounces
  and tinkles. Unsourced values are marked `TODO(unverified)` in the preset.

- **Ride smoothing for the view:** at speed, road bumps no longer shake the cockpit, chase and
  cinematic views. The cameras and the seated avatar (helmet / monitor) follow a smoothed copy of
  the vehicle's height and pitch / roll: a critically damped filter with velocity feed-forward
  (0.15–0.25 s) that absorbs small, fast bounce, follows slopes and steady lean without lag,
  stays within a few centimetres / degrees of the body, and lets crashes, rollovers and flight
  through exactly. Per class (`rideSmoothingDefaults`: car, motorcycle, truck, off) and per preset
  (`vehicle.rideSmoothing`). The body, physics and suspension are unchanged.
- **Motorcycle foot paddling:** stopped (under 2 km/h), holding S (the cars' reverse key) for
  0.4 s walks the VFR backwards with the rider's feet, easing up to 2.5 km/h; released, the feet
  stop it. No reverse gear: the engine, gearbox, selector and dash are untouched
  (`twoWheeledDefaults.paddle`).
- **Smooth rider head:** the two-wheeler cockpit eye eases towards the rider's body shift and
  tuck through a critically damped spring (`easeRiderHead`, `riderHeadResponse` 4/s): about
  1.5 s to settle, no overshoot, no jitter on key presses, steering or the automatic position.
  The physics shift and the handling are unchanged.
- **Motorcycle crashes:** a hard impact (over 5 g at 30 km/h or more: walls, barriers, cars) or a
  lowside at speed now crashes the bike as well as the Shift loop, and every crash kicks it into a
  violent tumble that grows with speed. At 120 km/h or more the rider is thrown off with the speed
  from before the hit, flies, takes the hit, slides with friction, lies still for a moment and
  gets up; the floating monitor rises back to its cushion and control returns
  (`Simulation.playerEjection`, `twoWheeledDefaults.crash`, `ejectionDefaults`). The V4 sound and
  the handling are unchanged.
- **Smoothed on-foot avatar:** the floating monitor (or walker) follows the player body through
  the same critically damped follower with feed-forward as the cameras (`AvatarFollow`,
  `avatarFollowResponse` / `avatarYawResponse`): no lag at a steady pace, jitter and snappy turns
  filtered. A thrown rider's helmet tumbles, squashes on the hit and turns upright as it gets up
  (`EjectionTumble`).
- **S3 engine modes (Normal / Bestia):** one S3 (`car`) with NORMAL (D, ~200 CV, refined TDI-like
  inline-four voice, default) and BESTIA (S, ~400 CV, inline-five warble with an occasional overrun
  burble). Switch from J › MOTOR or B (D ↔ S); HUD and cluster show D / S; power, torque, redline,
  shift points and sound follow the mode (`powertrain.modes`, `defaultMode`, `audio.engineModes`,
  `&engineMode=`). The A3 is hidden from the add-vehicle menu and the demo fleet (`hidden`), and
  stays available to Studio, the palette, tests and docking.
- **VFR800 metal and windscreen:** neutral chrome (base 0.95 grey, metallic 1, roughness 0.12,
  reflections at 0.75; first 0.03 / 1.25, toned down as too mirror-like) only on the fork stanchions, the silencer can and its end
  cap; the exhaust headers and the engine use the satin grey metal of the top triple clamp, as do
  the frame and fork lowers; discs, brake tracks, chain, sprockets, radiator and swingarm keep
  their authored materials. The reflection environment is a colourless studio gradient, so chrome
  no longer reads blue, and it is no longer upside down (the equirectangular rows were written
  zenith-first, so chrome reflected the sky from below). The windscreen is a see-through neutral smoke grey with a slight reflection
  (`extras.nabla.envIntensity`, honoured by `applyReflectionEnvironment`). Both via
  `scripts/prepare-vfr800-cockpit.mjs`.
- **VFR800 rear-view mirrors:** the `mirror_L` / `mirror_R` glass is now a live mirror in the
  cockpit, like the cars', and the existing Vehículos › Espejos sliders adjust it (yaw/tilt per side,
  in degrees; default 0° / 0°, the glass as modelled; bake in `vehicle.mirrorAim`).
- **VFR800 full lean ("total estribo"):** holding full steer at the normal 40° limit raises it over
  2 s to the peg lean measured from the GLB (`twoWheeled.pegLean`: left 52.1° footpeg rubber, right
  54.2° passenger footrest; `scripts/vfr800-lean-clearance.mjs`); releasing relaxes it in 1 s. The
  automatic rider hangs off further (`rider.auto.pegHangOff`), and at the peg the bullet-impact
  sparks stream from the touching point with a light metallic grind (`MetalScrape`).
- **VFR800 tuck:** the head goes down gradually from 180 km/h to the full tuck at 200 km/h (eased
  ramp, `twoWheeled.rider.tuck.fullKmh`), comes back up along the same ramp 10 km/h lower
  (hysteresis, fully up at `releaseKmh` 170), and the forward key follows the same ramp
  (`manualFromKmh` removed). The full-tuck eye is less deep (−0.22 m down, 0.34 m forward, was
  −0.32 / 0.44) so the horizon clears the fairing; the tacho stays at the bottom of the view.
- **Motorcycles, phase 3 (`vfr800`):** automatic rider (`twoWheeled.rider.auto`: hangs off into
  turns, forward under hard acceleration, back under hard front braking, keys override and hand
  back after ~1 s) and a tuck behind the windscreen from 180 km/h with hysteresis
  (`twoWheeled.rider.tuck`; I reaches the full tuck above the blend); the cockpit eye drops
  behind the screen. Shift is now a hooligan modifier (`twoWheeled.hooligan`, assists and CBS off
  while held): launch burnout with rear wheelspin, smoke and marks; assist-free wheelie and
  stoppie that crash when held too long (`twoWheeled.crashPitch`); stationary burnout on
  Shift + S + Space + W (`PlayerInput.frontBrake`). Live instrument cluster
  (`MotorcycleInstruments`, `vehicle.cluster`): speedometer, white tachometer, LCD with game
  clock, gear and distances, green turn-signal tell-tales and four warning lamps. Reflection
  environment for two-wheelers' chrome and glass (`applyReflectionEnvironment`). GLB cockpit
  pass (`scripts/prepare-vfr800-cockpit.mjs`): `mirror_L` / `mirror_R` nodes, gauge and lamp
  anchors, static needles removed, alpha-blended lighter windscreen. `twoWheeledPose` adds
  `tuck`, `rearWheelSpeed`, `roadSpeed`, `hooligan` and `crashed`.
- **Motorcycles, phase 2 (`vfr800` preset):** wheelies and stoppies come from real pitch
  dynamics: the rider is part of the vehicle mass (`twoWheeled.rider`), drive and brake forces
  transfer load at the tyre contacts, and a configurable pitch assist (`twoWheeled.pitchAssist`)
  fades the drive / eases the front brake past a soft angle, pulls the wheel down past a maximum
  angle and cushions landings; it replaces the phase-1 wheelie guard. Rider counterweight on
  **U / O** (hang off left / right) and **I / L** (weight forward / back) moves the body centre
  of mass (`Body.setCenterOfMass`), changes the lean needed in a turn and opens the wheelie or
  stoppie; the head and cockpit camera follow. **Shift** in first or second gear with the
  throttle open is a clutch kick (`twoWheeled.clutchKick`). Optional Dual CBS
  (`twoWheeled.cbs`): lever and pedal each brake both wheels by configurable shares with a lag on
  the linked circuits; the vfr800's shares are TODO(unverified) piston-count placeholders, not
  Honda data. New `vehicle.audio.engine` voice `v4`: a procedural 90° V4 with a 180° crank
  (uneven 90-180-270-180 firing from `vAngle`/`crankpin`), one periodic wave per cycle, no sample
  files; cars keep the engine note. `vehicleInfo` adds `pitch`; `twoWheeledPose` adds `pitch` and
  `riderShift`; `PlayerInput` adds `riderRight`/`riderForward`. New per-preset `powertrain.speedLimiter` (soft ignition-style cut with hysteresis); the vfr800 reaches and holds ~250 km/h (owner's bike, limiter; not Honda data) with the two-wheeler drag placeholder lowered from 0.3 to 0.18.
- **Motorcycles, phase 1 (`vfr800` preset):** the Honda VFR800FI 1999 from the asset library is
  drivable. New `vehicle.twoWheeled` schema (two hubs, rear wheel radius, steering head axis,
  lock, optional lean/balance/brake tuning) with a narrow-size exemption and redlines up to
  20,000 rpm; the rig extractor reads `wheel.front`/`wheel.rear`. New two-wheeled controller
  (`src/simulation/vehicles/two-wheeled/`, export `@nabla/engine/vehicles/two-wheeled`): two
  Rapier ray-cast wheels, steering through the raked head axis, speed- and steer-driven lean with
  a low-speed balance assist, front brake on S and rear brake on Space, the shared gearbox. Visual
  rig `bindMotorcycleRig` (`@nabla/engine/vehicle-presentation`) turns the fork and handlebar,
  works the suspension and chain and spins the wheels from `Simulation.twoWheeledPose(id)`.
  `vehicleInfo` adds `twoWheeled`, `lean` and `leanAllowance`; camera rollover detection and the
  flip cinematic treat lean up to the fall threshold as riding, not a rollover. Unknown physical
  values are TODO(unverified) placeholders in `twoWheeledDefaults`, not Honda data
  ([docs/motorcycles.md](docs/motorcycles.md)).
- **Per-vehicle sound (`vehicle.audio`):** `turbo: false` silences the turbo; `gearShift.sound`
  `clack` (default) / `click` / `none` with a `volume`. `click` is a new synthesized ~30 ms quiet
  click on every gear change (`VehicleAudio.gearClick`); the `vfr800` uses it with no turbo.
  Cars keep their turbo and clack unchanged.
- **Position lights after the engine start-up:** entering a car, the S3, the A3, the truck or
  any vehicle with lights, the lights stay off through P, the starter and the needle sweep, then
  switch to _posición_ as the engine runs: front white glow (S3/A3 `FocoC` lenses; truck
  low-beam lenses at `lightingDefaults.positionLensGlow` 0.15) and rear red tail lamps, no beam.
  With `ignition: false` they come on at entry; switching the engine off turns them off. **H**
  now steps a three-position switch, _posición_ → _cruce_ (dipped) → _apagadas_, with the
  notices «Luces de posición» / «Luces de cruce» / «Luces apagadas»; **K** (high/low) only acts
  on _cruce_. Before, H was a plain on/off where «on» lit position lamps and dipped beams
  together, and nothing switched them on at start. Hosts pick the state after the start-up with
  `GameRuntimeOptions.startLights` / `SceneViewOptions.startLights` (`'position'` default,
  `'low'`, `'off'`). Engine API: `VehicleLightMode`, `VehicleLightController.mode` /
  `cycleLights` / `glow`, `vehicleLightCycle`, `StartLights`, `engineRunning`,
  `SceneView.cycleVehicleLights` / `vehicleLightMode` / `startLights`, `CarLights.cycleLights`,
  `AuthoredVehicleLights.cycle`.
- **Mirror angles from the game menu («Espejos»):** **Ajustes → Vehículos**, below «Volante»,
  turns each mirror glass of the vehicle you drive, live: «Espejo izquierdo / derecho: giro»
  (yaw ±15°, + outward / − inward) and «… : inclinación» (tilt ±10°, + up), 0.5° steps, plus
  «Restablecer espejos» and a «Valores para fijarlo» readout (also logged with `console.info`).
  The live `Reflector` glass turns, so the mirror view follows (about twice the glass angle).
  Works for every vehicle with cockpit mirrors: S3 and A3 (door lenses, side from their place
  on the chassis) and the tractor (tagged GLB lenses). Saved per mirror model in `localStorage`
  (`nabla.mirrors:<body GLB>#<steering GLB>`, so the S3 and the A3 keep their own); host
  defaults from `?mirrors=` / `VITE_NABLA_MIRRORS` keyed by preset id. Bake path:
  `scripts/bake-mirror-aim.mjs <preset> '<values>'` adds the values to the new preset field
  `vehicle.mirrorAim` (degrees per side), applied under the sliders. Engine API:
  `GameRuntime.mirrors` / `setMirrorAngle` / `resetMirrorAdjustment`,
  `GameRuntimeOptions.mirrors`, `SceneView.setMirrorAdjustment`, `CarMirrors.setAdjustment`,
  `mirrorAngleRange`, `mirrorModelKey`, `mirrorSideOf`.

- **Start camera sequence (`startCameras`):** a start in a vehicle can run through camera views
  before the player takes over, e.g. `['overhead', { view: 'driver', after: 800, transitionMs:
1800 }, { view: 'chase', after: 'engine', transitionMs: 1400 }]`: overhead, down into the
  driver's seat, the engine start-up there (P, starter, needle sweep), then out to the chase
  camera. `after` is a hold in milliseconds or `'engine'` (the engine stays off until the camera
  reaches the step before it, then starts). Driving input or C ends it early. Host config
  `NABLA_BOOT.startCameras`; engine API `GameRuntimeOptions.startCameras`,
  `runtime.startCamerasActive` / `skipStartCameras()`, `resolveStartCameras`,
  `StartCameraSequencer`, `setGameCameraView`; `Simulation.holdEngine()` / `startEngine()` hold
  a seated road vehicle switched off and run the normal start-up later. Default none: unchanged.

- **Asphalt contrast:** a draw-time tone curve on the roads photo drape (fragment shader; tile
  textures untouched, no painter): around a fixed display-space pivot, dark asphalt gets darker
  and painted markings brighter, on top of the existing carriageway darkening and
  `ROADS_DRAPE_TINT`. Range 0.5–2.5, engine default 1 (unchanged; the shader skips the curve).
  One shared uniform, so changes are live without recompiles. Where the asphalt is only part of
  the terrain orthophoto (`relief=lidar`, no road meshes), the curve follows each cell's OSM
  carriageways through a small single-channel mask painted on demand (only when the contrast is
  not 1). Slider **Ajustes → Calidad →
  Asfalto → Contraste del asfalto** (stored, **Por defecto** resets), host default
  `NABLA_BOOT.asphaltContrast`, one visit `?asphaltContrast=1.6`. Engine API:
  `GameRuntimeOptions.asphaltContrast`, `runtime.asphaltContrast` / `setAsphaltContrast`,
  `setAsphaltContrast` / `asphaltContrast` and `ASPHALT_CONTRAST_*` from `@nabla/engine/render`.
- **S3 steering wheel default moved to Txema's «Volante» choice:** the S3 wheel now sits where
  the sliders put it at «Volante: distancia» +1,0 cm and «Volante: altura» +2,5 cm, baked into
  `s3.steering.glb` (the sliders read 0 there for every host). `scripts/move-s3-steering-wheel.mjs`
  now bakes both slider axes idempotently — `extras.nabla.columnForward` (0.03 → 0.04 m along the
  column) and the new `extras.nabla.height` (0.025 m, chassis up) — and records the moved spin
  axis as `extras.nabla.spinPivot`. Steering GLBs may declare that pivot on any node; `SceneView`
  spins the wheel about it (`steeringPivot`, optional `pivot` argument of `poseSteeringWheel`).
  The A3 wheel and the shared `steering` anchor are unchanged. Players who saved +1,0 / +2,5 in
  the menu should press «Restablecer volante» once so the value isn't applied twice.
- **Vehicles start in P, with an instrument sweep and an engine start:** every road vehicle (car,
  S3, A3, truck, procedural cars, host-spawned vehicles) now spawns in P and every way into the
  driver's seat (E, `startInVehicle`/`?vehicle=`, `transferControls`) selects P again, held by the
  brakes; the HUD and cluster show `P`. Then a synthesized starter cranks (`VehicleAudio.engineStart`,
  no sample file), the engine catches and the instrument needles sweep to full scale and back
  (~1 s, eased) while it settles to idle, still in P (order and timing: see Changed below). Pedals are deferred during the start-up (the
  vehicle stays in P; a pedal still held when the engine runs engages D/R through the normal
  dwell). W/S leave P as before. Boats, planes and flight-capable vehicles are unchanged. Engine
  API: `enterWheeledVehicle`, `engagePark`, `startIgnition`, `stepIgnition`, `gaugeSweep`,
  `sweepCluster`, `createWheeledVehicle(body, def, { parked })`, `vehicleInfo().ignition` /
  `ignitionCount` / `gaugeSweep`, `Simulation` option `ignition` (default true) and
  `roadVehicleDefaults.ignition*` / `crankingRpm` / `parkHold*`. See docs/configuration.md →
  Park on entering.
- **Shadow stripe correction setting:** Ajustes → Calidad → «Sombras: corrección de rayas»
  (0–300 %, live, with «Restablecer») scales the shadow bias. Host default via
  `NABLA_BOOT.shadowBias`, `VITE_NABLA_BOOT`, `VITE_NABLA_SHADOW_BIAS` or `?shadowBias=`; the
  player's saved choice (`localStorage` `nabla.shadowBias`) wins. Engine API:
  `GameRuntimeOptions.shadowBias`, `GameRuntime.shadowBias` / `setShadowBias`,
  `ShadowManager.setBiasScale`, `shadowBiasRange`, `normalizeShadowBias`, `cascadeShadowBias`.
- **Icon-only touch HUD with a place block:** the touch driving and flight action buttons
  (Entrar/salir, Cámara, Jugar) are now 52 px icons (`touchActionIcon`); the label stays as
  `aria-label` and tooltip. The driving rig shows the nearest city (large) and street next to the
  accelerator (`TouchDriving.setPlace`, fed every frame from the navigation places). The wheel,
  accelerator and handbrake keep their slots on foot so the button bar never jumps, and the rig no
  longer moves `.nabla-game-hud` to the top (hosts own the top-left).
- **Post-flip cinematic camera:** two barrel rolls / flips in under a second from the driver
  (cockpit) view cut to a held side shot looking ahead of the car, then a short orbit, then back to
  the driver view. It complements the C-cycle cinematic drone: it never fires from the exterior,
  overhead or cinematic views, and pressing C mid-shot hands the camera straight back. Default on;
  toggle with Ajustes → Opciones «Cámara cinematográfica al volcar», `GameRuntimeOptions.flipCinematic`,
  `NABLA_BOOT.flipCinematic`, `?flipcam=0` / `?flipCinematic=0` or
  `runtime.setFlipCinematicEnabled`.
- **R recovers onto the nearest road:** R now moves the car to the closest point of the nearest
  drivable road (scene roads plus streamed OSM carriageways) within `ROAD_SNAP_MAX_DISTANCE`
  (400 m), facing along the road in the direction closest to the old heading, then uprights it as
  before; with no road nearby it uprights in place («Sin vía cerca · coche enderezado»). Flying
  craft and boats never snap. Toggle in Ajustes → **Opciones**,
  `GameRuntimeOptions.recoverToRoad`, `NABLA_BOOT.recoverToRoad`, `?recoverToRoad=0` (alias
  `?roadReset=`) or `runtime.setRecoverToRoadEnabled`. Engine API:
  `Simulation.recoverVehicle({ snapToRoad, roads, maxRoadDistance })`, `nearestRoadPoint`,
  `RoadCenterline`.
- **Steering wheel position from the game menu («Volante»):** **Ajustes → Vehículos** has
  «Volante: distancia» (along the steering column) and «Volante: altura» (vertical) sliders,
  ±8 cm in 0.5 cm steps with the value in cm, and «Restablecer volante». The wheel moves live
  on top of its baked GLB pose and keeps turning about its own column. Adjustments are per
  steering model (S3, A3, tractor, …), saved in `localStorage` and logged in cm and metres so
  they can become defaults. Hosts set defaults with `?wheel=` / `VITE_NABLA_STEERING_WHEEL`.
  Engine API: `SceneView.setSteeringWheelOffset` / `steeringWheelOffset` /
  `steeringWheelModel`, `GameRuntime.steeringWheel` / `setSteeringWheelOffset` /
  `resetSteeringWheelOffset`, `GameRuntimeOptions.steeringWheel`. See docs/vehicle-rigs.md →
  Driver steering-wheel adjustment.
- **Add menu objects — Portal, Galería 2.5D, Sprite, Farola de autopista, Farola de barrio:**
  the game add menu now has a **Objetos** group after the vehicles. The button reads «Añadir
  portal», «Añadir galería 2.5D», …; the entry stands in front of the player or driven vehicle
  and appears in the placed list with a remove button. A placed portal is the Stargate frame
  (`portal.frame.glb`), starts closed and can be linked/opened from its panel to any other
  portal, including the carrier stern. Engine API: `placeables`, `createPlaceable`,
  `GameRuntime.spawnEntities` / `placeEntities` / `placedObjects` / `removePlaced` /
  `configurePortal`, `Simulation.addPlaced` / `removePlaced`, `SceneView.addPlaced` /
  `removePlaced`. See docs/portals.md → Placing portals while playing.
- **Host portals (`?portals=`):** hosts list standalone portals like host vehicles — WGS84
  `{name, lat, lon, heading, alt?, to?, mode?}`, linked in pairs with `to`; also
  `VITE_NABLA_PORTALS` and `installHostPortals`. See docs/game-library.md → Host portals.
- **Carrier portal «Ir»:** the Lat/Lon form on the PORTAL panel now relocates the ship (and
  anyone in its cabin) instead of doing nothing.
- **Overhead (cenital) and cinematic cameras for every player state:** **C** (gamepad **B**)
  now cycles exterior → driver → overhead → cinematic in vehicles and first person → third
  person → overhead → cinematic on foot. The overhead view looks straight down, follows
  without lag and is heading-up; on foot it centres the player at `footMapHeight` (18 m) with
  wheel zoom 0.75–3×, and the mouse turns the walking heading. The new cinematic view is a slow
  drone orbit (48 s per turn, ~2.4× chase distance, 38° lens, wheel distance 0.5–2.5×) that
  keeps the vehicle or player centred. Both keep the pointer-lock rule (game owns the mouse,
  Esc frees it). Engine API: `cycleGameCamera`, `gameCameraView`, `isFirstPersonView`,
  `GameCameraMode`, `cinematicOrbitPose` and `overheadFootHeight`; `data-camera-mode` reports
  `map` / `cinematic` on foot too. See docs/controls.md → Camera modes.
- **City labels toggle:** the floating OSM city / town / village names (~1 km above the ground)
  are now the tile layer `places` ("Nombres de poblaciones" in Ajustes → Opciones → Mapa). Hide them with
  `layers=-places`, `runtime.setHiddenLayers(['places'])` or the standalone game's host flag
  `NABLA_BOOT.cityLabels: false` (default stays on; the player's stored choice is kept relative to
  the host default).
- **Mark-only pre-attract splash:** `layout: 'mark'` (or `NABLA_BOOT.preAttract: true`) shows a
  black screen with only the small Nabla ▽ mark bottom-right (`NABLA_MARK_SVG` / `nablaMarkUrl`),
  no title, no load texts, then the planet attract view behind the mark. New skin slot
  `status: false` hides every load text in any layout.

### Fixed

- **S3 / A3 chrome trim reads as chrome:** the window surrounds, beltline, boot trim, grille and
  badge (`Cromo …`, `Nabla silver chrome`) had no environment to reflect (cars never had one; only
  the VFR800 got the neutral reflection environment in #156), so they showed little more than the
  sun's highlight and went dull grey or black with the sun angle and at dusk. They now take the
  same neutral, right-way-up environment as the VFR800 chrome (`carReflectionOptions`, intensity
  0.8, roughness at least 0.3: natural chrome, not a mirror). Paint, mirror housings, mirror glass
  and wheels are unchanged.
- **Chrome dims with the daylight:** vehicle chrome reflections (car and motorcycle) fade with the
  atmosphere's daylight (`reflectionLevel`, `lightingDefaults.reflectionNightLevel` 0.08 /
  `reflectionFullDay` 0.85) instead of switching from full to 0.15 at the night threshold, so the
  fixed studio gradient no longer glows at dusk or at night.
- **Right mirror capture upright:** mirror capture cameras now keep the vehicle's up instead of
  the lens node's own +Y. The S3 / A3 right-door lens is authored under a node rotated 180° about
  X, so its capture camera ran rolled upside down; both sides now capture upright on every
  vehicle (`fitMirrorCamera` takes an optional world `up`). Yaw / tilt conventions are unchanged.
- **Bridges no longer vanish with a road pointer mismatch:** when `manifest.json` and the Atlas
  package (or `roads.files` and `roadCandidates.layers`) name different files for a road layer,
  the cell used to fail validation and load nothing, bridges included. Each road layer now
  resolves on its own: the manifest file wins, the other is kept as `fallback` and reported in
  `roads.warnings`; an invalid road entry is ignored with a warning instead of rejecting the
  cell. The worker tries the fallback when a road file fails to download, verify or parse, then
  skips only that layer (`PlanetPayload.roadErrors`); terrain and buildings failures still fail
  the cell. Bridge supports and asphalt are exempt from the sea-coverage triangle filter, so decks
  and piers over the water are never stripped. Engine API: `PlanetCandidateRoadFile.fallback`,
  `PlanetCandidateRoads.warnings`, `PlanetGlbLayer.fallback`, `PlanetPayload.roadErrors`.
- **«Carretera» hidden hint:** with **Capas → Carretera** off, a small chip at the top of the
  screen reads «Carretera oculta: no se ven asfalto ni puentes» with a «Mostrar» button, so a
  stored hidden layer (`localStorage` / `?layers=`) can no longer silently hide every bridge.
- **Sidearm hit marks are just a dark hole, no white ring:** the marks left on terrain, buildings
  and vehicles drew an opaque light ring (`#d8d2c4` at 0.9 opacity) around the black core, added
  in #117 so they read on dark walls; on light ground it looked like a white washer. A mark is now
  one alpha-blended quad with a generated texture (`impactMarkTexture` / `impactMarkPixels`): an
  opaque near-black hole and a soft dark scorch that fades to alpha 0 at the rim, no light texels
  anywhere (also under alpha 0, so filtering and mipmaps leave no halo). No depth write, polygon
  offset and the 12 mm standoff are kept against z-fighting. Same 8.5 cm footprint.
- **Cars no longer start dark:** until 2026-10-05 the S3/A3 position lamps (front `FocoC`, rear
  `PilotoP`) lit whenever the car was occupied. Commit `fa48503` («Author truck mirrors and tune
  vehicle lighting and beam controls», shipped before #85) put them behind the new H headlight
  switch, which starts off, so every car started with its lights off. #135/#137 (start-up
  sequence) did not touch the lights. The position lights now come back on after the start-up.
- **Ajustes → Capas showed no map layers in the terrain game:** the layer list (Carretera,
  Edificios y techos, Foto del suelo, Nombres de poblaciones) is bound after the settings window
  mounts, so it stayed in the hidden legacy menu and could not be switched back on; the «Terreno»
  source / cache section was unreachable the same way. The window now places sections whenever
  they appear. Also, rows the window hides (the duplicate «Mostrar el mar») no longer show.
- **Overhead (cenital) and chase cameras no longer shake in a rollover.** Root cause:
  - The overhead view took its heading straight from the chassis quaternion every frame: the
    nose projected onto the ground, with no smoothing. In a tumble the nose swings above and
    below the horizon, so that heading flipped by up to 180° at once (measured up to 226 rad/s
    in a scripted multiple rollover). The view also sits half a frustum ahead of the car along
    that heading, so every flip threw the camera 10–20 m to the other side.
  - The chase view had the same raw heading as its target, plus turn anticipation from the
    tumbling body's spin, so it swung side to side (up to 32 rad/s, 11 reversals).
  - Exterior cameras now use `GroundHeading`, a roll-independent heading. While upright it is
    the nose projected onto the ground, followed critically damped with yaw-rate feed-forward,
    so driving feel is unchanged. While tumbling (detected with hysteresis) it holds, or aims
    along the line of travel, turning at most 1.2 rad/s; it then eases round to the new nose.
  - The overhead view centre follows through `CriticalFollow`, a critically damped spring with
    velocity feed-forward.
  - Chase turn anticipation is muted while tumbling. The chase path is otherwise unchanged
    while driving upright.
  - New `GameCameraSettings`: `mapHeadingResponse`, `mapFollowResponse`, `mapMaxYawRate` and
    `tumble*`.
- **Vehicles no longer roll back when entered:** the drivetrain was created in D1 and kept
  whatever gear it was left in, so entering a vehicle released the unoccupied parking brake with
  the selector in D (or R) and no pedal, and it rolled down any slope. A braked vehicle also
  crept downhill at g x sin(slope) x dt per step because the Rapier wheel brake resolves velocity
  before gravity is integrated. P now applies the full service brake (occupied or not) plus a
  parking-pawl hold, so a parked vehicle stays put even on steep slopes.
- **Shadow acne on terrain (stripes over every gentle slope):** under a low sun the ground,
  its draped roads and photos showed dense contour stripes, worst with `relief=lidar` (the
  Euskadi host default). The Atlas LiDAR terrain is exported double-sided, so its sunlit faces
  wrote into the shadow map and shadowed themselves; the fixed 2 cm depth / 4–8 cm normal bias was
  a fraction of a texel (0.2–0.7 m per texel at cascade 0). Terrain now casts shadows from back
  faces only (`castShadowFromBackFaces`) and is drawn single-sided: `tileMeshSide` overrides the
  GLB `doubleSided` flag to `FrontSide` for up-facing ground (terrain, land use, ground-photo
  drapes) at load time; road meshes (bridge decks), skirts, buildings and water keep their side.
  Each cascade's bias scales with its texel size
  (`ShadowTier.normalBiasTexels` / `depthBiasTexels`, replacing `normalBias`): Baja/Equilibrada
  ≈ 21 cm normal / 21 cm depth, Alta ≈ 17 / 13 cm, Ultra ≈ 10 / 6 cm, clamped to 50 cm on far
  cascades. The car's contact shadow stays attached. See docs/performance.md → Shadow bias and acne.

- **S3 steering wheel too far from the dashboard:** the rim sat ~2–3 cm back toward the
  driver. It now sits 3 cm further along the steering column toward the gauges (chassis: 2.8 cm
  forward, 1.1 cm down; column pivot and spin axis unchanged). Only `s3.steering.glb` changes
  (`scripts/move-s3-steering-wheel.mjs`); the A3 wheel and the shared anchor are untouched.
- **Carrier portal monitor dark on host-placed ships:** a carrier added after start
  (`?vehicles=` / `installHostVehicles`, or "Añadir vehículo") was installed without its stern
  portal, so the left door monitor (the PORTAL console) stayed black and had no destination,
  Open/Close or Lat/Lon controls. `GameRuntime.placeVehicle` / `spawnVehicle` now also accept
  `presetEntities` output (the vehicle followed by its hosted entities); `SceneView`, `Simulation`
  and `Game` `addVehicles` accept unlinked, closed portal mouths hosted on a vehicle of the same
  batch, and `removeVehicle` removes them (unlinking a partner first). The host fleet and the
  add-vehicle menu pass the preset's stern portal.
- **Truck right mirror aim:** the white truck's right wing mirror pointed ~28° out to the
  roadside (its glass was a centre-line copy of the left one, ignoring the left-hand-drive seat).
  The `mirror.right` glass is now turned ~14° toward the driver, so it shows the road behind the
  truck along the right flank, mirroring the left view (`scripts/aim-truck-mirrors.mjs`).
- Splash `messages: []` no longer falls back to the default Nabla loading lines, and `title: ''`
  clears the title. The early boot lines in `game/main.ts` use the host's messages.
- `terrain-main.ts` only installs host vehicles when the scene has geography and vehicles (the
  guard had lost its braces; fixes the typecheck error on main).

### Changed

- **Settings window (Ajustes) reorganized into seven tabs:** Planeta | Posición | Calidad | Capas |
  Vehículos | Opciones | Configuración. New **Opciones** holds player preferences: «Cámara
  cinematográfica al volcar» (from Capas), «R: reaparecer en la vía más cercana» (from Posición)
  and «Nombres de poblaciones» (the `places` layer, from Capas). New **Configuración** holds the
  planet config text and «Copiar config» (from Planeta) and the «Terreno» source / cache section.
  «Asfalto» moved from Capas to **Calidad**. Planeta is compact: Hora with its status and «Ahora»
  on one line, the sky / sun / sea / cloud switches in a grid, one line per slider (1182 → 480 px
  tall); selects and sliders share the line with their label in every tab. Tabs with nothing to
  show are hidden (Posición and Capas on the flat demo). Storage keys, URL parameters and `NABLA_BOOT` defaults
  are unchanged. Placement is one table, `SECTION_TABS` in `game/settings-hud.ts`, which already
  lists #138's `quality-shadows` («Sombras», Calidad). `PlanetSettingsPanel` gains `config` (the
  config block, mountable apart from `root`). See docs/controls.md → Settings menu.

- **Camera changes move instead of cutting:** C / gamepad B and every other view change while
  the player stays in the same vehicle (or on foot) blend position, orientation and field of view
  with an ease-in-out (`smootherstep`) over the new camera setting `modeTransitionMs` (default
  700 ms; `0` cuts as before). The blend starts from the pose actually shown, relative to the
  player, so it follows a moving car and a second C mid-blend continues smoothly. Boarding keeps
  its overhead-to-seat entrance.

- **Idle at ~1,000 RPM with a less rumbly engine note.** Car idle (`roadVehicleDefaults.idleRpm`,
  S3, A3 and procedural cars) 900 → 1,000 RPM, so the rev counter rests on 1,000 at a
  standstill; the white truck's diesel idle 650 → 750 RPM. The engine note is pitched a little
  higher, like an engine at low revs rather than a sub-bass rumble: `engineNoteHz` rpm / 30
  (30 Hz floor) → rpm / 24 (25 Hz floor), lowpass cutoff 180 + 0.1 x rpm → 260 + 0.14 x rpm Hz.
  Car idle: 30 Hz / 270 Hz → 41.7 Hz / 400 Hz; truck idle: 30 Hz / 245 Hz → 31.3 Hz / 365 Hz.
  The engine-start sound now ends its catch on the vehicle's idle note
  (`EngineStartSound.idleRpm`; pitch reference 900 → 1,000 RPM) so it hands over to the idle
  engine sound seamlessly.
- **Start-up order on entering a vehicle: engine first, then the needle sweep.** The sequence is
  now P and held → starter sound, shorter (`ignitionCrankSeconds` 1 → 0.6 s) → needle sweep up
  and back (`ignitionSweepSeconds`, 1 s) → running. The engine catches at the end of the crank,
  so its normal sound fades in and settles from the catch flare to idle during the sweep instead
  of after it, and the whole sequence takes 1.6 s instead of 2 s. `vehicleInfo().ignition` now
  goes `cranking` → `sweep` → `running`. The needles leave from and return to their live reading
  (the idling rev counter, a speedometer at 0) instead of dropping to zero first
  (`sweepCluster`). Input rules are unchanged: P and no drive torque until the sequence ends.

- **Settings layout:** new **Posición** tab (where you are / go to lat,lon and the R option).
  Planeta keeps Hora first and now ends with sea level / tide; the legacy sky / sun / clouds /
  sea toggles that duplicate the planet panel are hidden, so «Cielo y mar» leaves Capas, which now
  holds the map layers and the camera extras.
- **Darker carriageways:** the baked carriageway tint is `#525c60` × 0.48 (was × 0.62) and the
  roads photo drape gets a `#c2c2c2` multiply (`ROADS_DRAPE_TINT`).
- **Resolution scale defaults to a fixed step per quality preset instead of Auto:** Ultra
  100%, Alta 90%, Equilibrada 80%, Baja 50%, Móvil 45%, Mínima 40% (`custom` / Predeterminada
  80%). **Escala automática** stays selectable (`scale=auto`, `resolutionScaleMode: 'auto'`) and
  a saved player choice (`scale=` in the URL) still wins. The boot probe now runs only in auto.
  Engine API: `presetResolutionScales`, `presetResolutionScale`, and
  `resolveDisplaySettings(value, preset)`; `displayDefaults` is now manual 0.8.
- **One shared water colour for the sea and inland water:** the open sea (horizon sheet) now uses the
  same Lambert body as rivers, lakes and coastal water, and all share `SURFACE_COLORS.water`
  `#294050` (was `#102f43`). At noon, before tone mapping, the sea body goes from `#3f525d` to
  `#263b49` (darker) and rivers from `#0e2b3d` to `#263b49`: about 67.5% river, 32.5% sea. The sea's sun
  specular and glint (`sunColor`, `#fff0d8`) are unchanged.
- **S3 headlights like the truck:** the S3 now has real low and high beams at its two front lamp
  units, built with the white truck's lamp setup (1800 / 18000 cd, 55 / 130 m, same cones, aimed
  slightly down; low beams use the shared cut-off projection). They light the road ahead only, are
  switched by the car's light controller and only drawn while the car is occupied.
- **Softer, slightly dimmer beams (truck + S3):** driving beams are scaled by
  `lightingDefaults.headlightIntensityScale` (0.85) with a slightly wider penumbra
  (`headlightPenumbraBoost` 0.1); the low-beam cut-off edge is softer (`lowBeamCutoffSoftness`
  0.025 → 0.04, `lowBeamSpreadPower` 4 → 3.5).
- **Settings UI:** the Planeta tab puts **Hora** (time of day) first, before clouds, pressure and
  lens flare; the leftover legacy groups move to Capas → "Cielo y mar". The quality section no
  longer mentions DLSS; only the real resolution scaling is shown.

- **Cloud style by quality:** artistic 3-layer clouds are the default only on the **Ultra**
  performance preset. Mobile, minimal, low, balanced, high and custom start on cheap (`low`)
  clouds. Players can still toggle artistic sheets from the Planeta controls. Artistic layer
  scale is unchanged.

### Fixed

- **Cloud amount slider pressure:** `GameRuntime.setCloudWeather(amount)` no longer defaults
  pressure to `0`. Omitting the second argument keeps the current cloud pressure, so the
  Planeta / scene-controls quantity slider does not wipe storm settings.

### Added

- Compact game settings HUD (icon + GTA-style tabs) for Planeta visuals: artistic cloud amount, cloud pressure, sun lens flare, and related sky/sea toggles. Shares the ship-monitor stylesheet; panel root is remountable on a monitor later. Config keys documented in `docs/planet-visual-settings.md`.
- `GameRuntime` cloud pressure persistence, `lensFlareAmount` / `planetVisualConfig()`, and reattached sun lens flare in Play after the Studio extraction.

## Unreleased

### Changed

- **Single mouse-capture rule:** while playing, the game always owns the pointer (pointer lock) in every mode — on foot, sidearm, chase, cockpit and flight. **Esc** (or a menu/settings panel taking focus) frees the mouse until the next click on the viewport, which only recaptures it and does not fire. Clicking an in-world monitor keeps the mouse free for that monitor until a click outside it. This replaces the sidearm-only lock, the lock release on boarding a vehicle, the hover-look without capture, the monitors' own lock request and the settings panels' explicit `exitPointerLock` calls. The portal panel hint now reads "Esc releases the mouse".
- Disable the cockpit circular touch ring around the steering wheel by default (`controlDefaults.showPilotTouchRing: false`). The ring drew a circle while its hit target stayed square, so touches outside the circle still steered; DOM/CSS and `TouchDriving.setPilot` stay so it can be re-enabled later.
- **White-truck power/brakes:** tractor preset `engineForce`/`powerCv`/`torqueNm`/`maxWheelForceN` +20% and `brakeForce` +40% (engineForce 12000→14400, brakeForce 120→168, powerCv 420→504, torqueNm 2000→2400, maxWheelForceN 60000→72000). Cars and ships unchanged.
- **Sidearm hit marks on buildings:** physics hits without a scene `entityId` (planet building colliders, static world) now spawn a world-anchored mark under `SceneView.root`, not only entity-parented marks on cars/props. Marks use a dark core plus light ring so they read on both light and dark surfaces.
- **Sidearm FPS feel:** no UI reticle; **RMB** holds aim-down-sights (centred iron-sight pose) vs hip fire; viewmodel **recoil** on each shot; **H** toggles a muzzle laser while on foot (vehicle **H** still lights); hits spawn brief spark bursts and keep surface impact marks; the bullet tracer trail is no longer drawn.

### Fixed

- **Planet boot placeholder / default clock:** `GeographicView` keeps a plain black Earth sphere
  (and suppresses the sun disc, lens flare and daylight) until `earth.jpg` is applied, so attract
  and early frames never show a pale/white or half-textured globe or a melted-sun flash. The
  terrain drive default sky is now `{ mode: 'live' }` (browser local wall clock); pass `sky: 'day'`
  or `&sky=day` for the previous fixed midday sun. Hosts can still override with `&time=` /
  Planeta → Hora.

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
