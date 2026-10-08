# Motorcycles: VFR800FI 1999 and two-wheeled support

The [Honda VFR800FI 99 asset](../assets/library/motorcycles/vfr800fi-1999/README.md) is **drivable (phase 1)** as the `vfr800` preset: `presetVehicle('vfr800', id, position)`, like the car preset. Its asset manifest, rig file and technical data stay outside the preset loader (`asset.json`, `*.rig.json` and `*.specs.json` are skipped).

## Phase 1 (implemented)

- **Schema and validation** (`src/entity/vehicle/field.ts`, `vehicle.ts`): `vehicle.twoWheeled` declares a single-track vehicle with exactly two hubs (front, then rear), its own `rearWheelRadius`, the chassis-local `steeringAxis` (up the head stock) and `steerLimit`. Two-wheelers get a narrow minimum size (0.3 × 0.3 × 1 m instead of 1 × 0.3 × 2 m); two hubs without `twoWheeled` are rejected, and `twoWheeled` cannot be combined with trailers, aircraft, boats or carriers. `powertrain.maxRpm` and `shift.upshiftRpm` accept up to 20,000 rpm. Cars, trucks and trailers validate exactly as before.
- **Rig extraction** (`scripts/lib/vehicle-rig.mjs`): `wheel.front` / `wheel.rear` anchors become the two hubs.
- **Controller** (`src/simulation/vehicles/two-wheeled/`, package export `@nabla/engine/vehicles/two-wheeled`): one Rapier rigid body with two ray-cast wheels (front and rear radii). The handlebar turns about the steering axis (rate-limited, clamped to the lock); the front wheel's ground steer follows through the rake, tan(ground) = tan(bar)·cos(rake). A lean controller tracks the steady-turn lean tan(φ) = v²·tan(steer)/(g·L), capped at `maxLean`, with a roll-disturbance observer for tyre and gravity moments; at speed the reachable bar angle shrinks so full input asks for exactly `maxLean`. Below `balanceSpeed` a stiffer balance assist keeps a stopped, parked or crawling machine upright (`balanceAssist`, on by default; it applies a roll torque and never adds fake wheel contacts). Past `fallLean` the machine has fallen and the controller lets go until R (`recoverVehicle`) uprights it. The pure math lives in `balance.ts`.
- **Inputs:** W throttle; S is the **front brake** (there is no reverse gear); Space (handbrake) is the **rear brake**; A/D steer. The shared automatic gearbox and engine model (`drivetrain.ts`) drive the rear wheel; P/N/D, the start-up sequence and manual paddles work as on cars. A phase-1 wheelie guard cuts drive while the front tyre is off the ground.
- **Presentation** (`src/render/vehicle-presentation/motorcycle-rig.ts`): `bindMotorcycleRig` turns the handlebar/fork about the head axis, slides the fork, swings the swingarm and shock, bends the chain and spins both wheels from `Simulation.twoWheeledPose(id)`. It replaces the asset-folder `vfr800fi-1999-controls.mjs` helper (same math).
- **Cameras:** `vehicleInfo(id)` reports `twoWheeled`, `lean` and `leanAllowance` (the fall threshold). The chase camera follows yaw and stays level; `GroundHeading` removes lean up to the allowance before its rollover tests and the flip cinematic ignores roll inside it, so cornering is never a rollover. The cockpit view still rolls with the chassis.
- **Sound** (`vehicle.audio`): no turbo; a short quiet click on every gear change (see [configuration](configuration.md)).

### Preset values: sourced versus placeholder

Honda-sourced (see the specs JSON below): power 110 PS (81 kW) and 82 Nm peaks, the six gear ratios from tooth counts, overall final drive 64/33 × 43/17 ≈ 4.9055, wheelbase (1.44 m, also the GLB hub distance), overall size, tyre radii from nominal tyre sizes, the 234 kg US curb mass.

Placeholders, **not Honda data** (marked TODO(unverified) in `twoWheeledDefaults` in `src/config/simulation.ts` or listed here): total mass 310 kg (234 kg curb plus an assumed ~76 kg rider), centre of mass 0.55 m above the ground at mid-wheelbase, colliders and the inertia they imply, `idleRpm` 1,200, `maxRpm` 11,500 (the end of the estimated torque table, not a rev limiter), `maxWheelForceN` 2,600, `grip`, suspension stiffness and damping, `maxLean` 0.7 rad, `fallLean` 1.15 rad, `balanceSpeed` 3 m/s, lean and assist response, steering rate, front/rear brake forces, tyre friction slip and the drag factor. The authored GLB steering axis gives a 24.4° rake (factory 25.5°); the controller uses the GLB axis so visuals and physics agree.

### Not in phase 1

Wheelie and stoppie dynamics (only the guard), rider counterweight input, Dual CBS, clutch, LODs, GLB edits, rounded-tyre camber forces, countersteering dynamics, rider-dependent CoM, a motorcycle engine voice (the shared engine note is used, without turbo).

## Technical reference

[Honda's 1999 ED brochure](https://www.vfritaliaclubforum.it/wp/files/tecnica/Storia%20VFR/VFR800FI-1998_1999.pdf) (PDF page 31) specifies the 781.7 cc, gear-driven DOHC V4: 81 kW at 10,500 rpm and 82 Nm at 8,500 rpm (DIN). The [1998–2001 Honda factory service manual](https://www.scribd.com/document/444334608/Honda-VFR800FI-Interceptor-98-01-Service-Manual-Www-manuale-reparatie-eu), General Information 1-4–1-6, supplies transmission tooth counts and steering geometry. These are scans of Honda publications, not specifications for the 2002-on VTEC model.

Machine-readable values live in [vfr800fi-1999.specs.json](../assets/library/motorcycles/vfr800fi-1999/vfr800fi-1999.specs.json). Ratios use tooth counts rather than corrupted OCR decimals: primary 64/33; gears 37/13, 33/16, 31/19, 28/21, 30/26, 29/28; final 43/17. There are six forward gears, neutral, no reverse, a hydraulic wet clutch and rear-wheel chain drive.

The JSON includes dry mass (208 kg), tank (21 L), dimensions, 1.440 m wheelbase, tyre/rim sizes, rake/trail, suspension and Dual CBS brakes. The US/Canada service-manual curb mass (234 kg) is a separate regional reference, not an ED-certified mass or a mass including the rider. Add rider, luggage and operating fluids explicitly; do not use dry mass as total simulated mass.

Factory 1999 ED front axle travel is 109 mm and rear travel 120 mm; the 1998 manual lists 120 mm front. The authored visual rig currently allows 100 mm compression. These values have different provenance and must be reconciled during integration. Nominal tyre radii are unloaded geometry, not measured loaded rolling radii.

## Power curve

The JSON and [CSV](../assets/library/motorcycles/vfr800fi-1999/vfr800fi-1999-power.csv) provide a provisional full-throttle crankshaft curve for simulation. **Intermediate points are authored estimates**, constrained to the published DIN peaks; they are not a measured dynamometer trace or a digitization of Honda's comparative graph. The alternative 1998 EC figures are recorded separately and are not mixed into this curve.

Interpolate torque linearly and calculate power as torque × rpm × 2π/60. The table covers 1,000–11,500 rpm; it does not specify idle, stall behavior, overrun or a rev limiter. Those unknowns, losses, engine inertia, tyre coefficients, suspension rates and aerodynamics are null rather than fabricated factory data. Rear wheel torque needs primary × selected gear × final reduction × measured/calibrated efficiency; the published curve is at the crankshaft. Road speed estimates also need loaded rolling radius and clutch/tyre slip.

## Remaining engine work (beyond phase 1)

Phase 1 covers the minimal parts of items 1, 4 and 5; everything beyond it below is still open.

1. Add a discriminated motorcycle definition and dedicated two-wheel controller using the existing physics world and fixed-step clock. Extend anchor extraction for wheel.front/rear, steering, fork and swingarm without weakening four-wheel validation.
2. Implement rounded-tyre contacts, normal loads and combined longitudinal/lateral grip, rear drive, clutch, sequential gears and engine braking. Model front/rear braking and the original Dual CBS coupling. The 1999 bike has no factory ABS; optional assistance must be explicit.
3. Simulate springs, damping and travel stops; front compression follows the inclined fork axis and rear motion follows the swingarm arc and shock motion ratio. Derive presentation from interpolated simulation snapshots.
4. Implement lean, countersteering, rider balance, low-speed assistance, falls, recovery and rider-dependent centre of mass/inertia. Balance assistance must be configurable and must not create fake wheel contacts.
5. Connect motorcycle inputs, start/stop, clutch/gears, rider cameras, engine audio and the shared AuthoredVehicleLights channels. Provide one lifecycle owner and release the cloned visual chain geometry on disposal.
6. Calibrate unknown mass distribution, suspension, tyre and powertrain parameters. Test straight-line stability, different-speed turns, braking, loss of grip, slopes, curbs, jumps, one-wheel contact, multiple bikes, resets and planetary gravity/rebase at a fixed step.

The GLB already separates steering, fork slider, front/rear wheels, swingarm, shock body/rod and chain. Steering is limited visually to ±35°. The visual helper does not generate forces or collision shapes. The planar discs and simplified drivetrain are visual choices, not physical geometry.
