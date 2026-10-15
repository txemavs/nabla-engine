# White truck tractor

Stock four-wheel Engine preset adapted from the tractor in commit `1cca41f`
(`codex/white-truck-studio`). Its original GLBs are under
`assets/library/trucks/white-truck/assets/`.

Uses the existing Engine wheeled simulation, with separate front and rear wheel
models. The shared tyre radius approximates the source's 5 mm front/rear
difference. Driver position and road handling are provisional demo settings.
The demo adds the original trailer as a chassis GLB (`trailer.chassis.glb`:
frame, Stützbein, hitch) plus an optional cargo box (`trailer.box.glb`).
`white-trailer` composes both; `white-trailer-chassis` is the lower trailer
alone. Six passive wheels stay on the chassis. `vehicle.tow` or
`Simulation.hitchTrailer` joins the kingpin to the tractor fifth wheel.

The chase camera stays at the far trailer framing (`cameraDistance` 24, the same
as `white-trailer`) whether or not a trailer is hitched, so unhitching never pulls
the camera in.

## Quest / low variant

`white-truck` selects lowUrl variants for its body, front/rear wheels and steering
in Quest and the minimal/mobile/low/road profiles. Originals remain available.
The four unique GLBs total **722020 bytes**, versus 1106688 originally; the complete
tractor has **17867 triangles**, versus 30441 originally (four wheels included).

Small vent slats, hinge barrels, decorative inlays and inner handles are omitted;
anchor nodes remain. Normal-aware simplification preserves cabin panel shading,
and lamps, mirrors, display geometry and small control surfaces are retained.
Physics, audio, cockpit presentation and hitch anchors are unchanged.

Generate with `node scripts/prepare-truck-quest.mjs`. The script enforces a total
under 1 MB. Preview `/xr.html?example=flat&solo=1&vehicle=white-truck&quality=minimal`.

Reverse lenses in the low tractor are closed white rectangular surfaces; their
authored light-channel materials remain independently controlled by reverse gear.

Painted panels retain more geometry with a tighter error tolerance around the
front wheel arches; the low tractor set remains below 1 MB.
