# Motorcycles: VFR800FI 1999 asset and pending support

The [Honda VFR800FI 99 asset](../assets/library/motorcycles/vfr800fi-1999/README.md) is ready for presentation and future two-wheel integration. It is **not drivable** with the current Engine. Its manifest and technical data intentionally stay outside the car preset loader and generated four-wheel catalog.

## Technical reference

[Honda's 1999 ED brochure](https://www.vfritaliaclubforum.it/wp/files/tecnica/Storia%20VFR/VFR800FI-1998_1999.pdf) (PDF page 31) specifies the 781.7 cc, gear-driven DOHC V4: 81 kW at 10,500 rpm and 82 Nm at 8,500 rpm (DIN). The [1998–2001 Honda factory service manual](https://www.scribd.com/document/444334608/Honda-VFR800FI-Interceptor-98-01-Service-Manual-Www-manuale-reparatie-eu), General Information 1-4–1-6, supplies transmission tooth counts and steering geometry. These are scans of Honda publications, not specifications for the 2002-on VTEC model.

Machine-readable values live in [vfr800fi-1999.specs.json](../assets/library/motorcycles/vfr800fi-1999/vfr800fi-1999.specs.json). Ratios use tooth counts rather than corrupted OCR decimals: primary 64/33; gears 37/13, 33/16, 31/19, 28/21, 30/26, 29/28; final 43/17. There are six forward gears, neutral, no reverse, a hydraulic wet clutch and rear-wheel chain drive.

The JSON includes dry mass (208 kg), tank (21 L), dimensions, 1.440 m wheelbase, tyre/rim sizes, rake/trail, suspension and Dual CBS brakes. The US/Canada service-manual curb mass (234 kg) is a separate regional reference, not an ED-certified mass or a mass including the rider. Add rider, luggage and operating fluids explicitly; do not use dry mass as total simulated mass.

Factory 1999 ED front axle travel is 109 mm and rear travel 120 mm; the 1998 manual lists 120 mm front. The authored visual rig currently allows 100 mm compression. These values have different provenance and must be reconciled during integration. Nominal tyre radii are unloaded geometry, not measured loaded rolling radii.

## Power curve

The JSON and [CSV](../assets/library/motorcycles/vfr800fi-1999/vfr800fi-1999-power.csv) provide a provisional full-throttle crankshaft curve for simulation. **Intermediate points are authored estimates**, constrained to the published DIN peaks; they are not a measured dynamometer trace or a digitization of Honda's comparative graph. The alternative 1998 EC figures are recorded separately and are not mixed into this curve.

Interpolate torque linearly and calculate power as torque × rpm × 2π/60. The table covers 1,000–11,500 rpm; it does not specify idle, stall behavior, overrun or a rev limiter. Those unknowns, losses, engine inertia, tyre coefficients, suspension rates and aerodynamics are null rather than fabricated factory data. Rear wheel torque needs primary × selected gear × final reduction × measured/calibrated efficiency; the published curve is at the crankshaft. Road speed estimates also need loaded rolling radius and clutch/tyre slip.

## Engine work required

1. Add a discriminated motorcycle definition and dedicated two-wheel controller using the existing physics world and fixed-step clock. Extend anchor extraction for wheel.front/rear, steering, fork and swingarm without weakening four-wheel validation.
2. Implement rounded-tyre contacts, normal loads and combined longitudinal/lateral grip, rear drive, clutch, sequential gears and engine braking. Model front/rear braking and the original Dual CBS coupling. The 1999 bike has no factory ABS; optional assistance must be explicit.
3. Simulate springs, damping and travel stops; front compression follows the inclined fork axis and rear motion follows the swingarm arc and shock motion ratio. Derive presentation from interpolated simulation snapshots.
4. Implement lean, countersteering, rider balance, low-speed assistance, falls, recovery and rider-dependent centre of mass/inertia. Balance assistance must be configurable and must not create fake wheel contacts.
5. Connect motorcycle inputs, start/stop, clutch/gears, rider cameras, engine audio and the shared AuthoredVehicleLights channels. Provide one lifecycle owner and release the cloned visual chain geometry on disposal.
6. Calibrate unknown mass distribution, suspension, tyre and powertrain parameters. Test straight-line stability, different-speed turns, braking, loss of grip, slopes, curbs, jumps, one-wheel contact, multiple bikes, resets and planetary gravity/rebase at a fixed step.

The GLB already separates steering, fork slider, front/rear wheels, swingarm, shock body/rod and chain. Steering is limited visually to ±35°. The visual helper does not generate forces or collision shapes. The planar discs and simplified drivetrain are visual choices, not physical geometry.
