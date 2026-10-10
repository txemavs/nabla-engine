# Honda VFR800FI 99

User-approved VFR800FI (RC46) asset: 140,345 triangles, 3.42 MB, metres, Y-up, −Z forward.
Cleaned up by hand by Txema Vicente over several hours, then substantially reworked by Codex under his direction using data from the Honda manual, starting from a low-quality base mesh; almost none of the original geometry remains. The base mesh was the user-supplied `interceptor.glb`. The model was simplified and articulated; the base mesh SHA-256, final integrity and provenance are in [asset.json](asset.json). The spoke designs were kept. Tyres and chain are smooth, brake tracks are planar, and lenses carry the shared vehicle light channels.

The 2026-10-10 owner export `VFR800FI99.glb` replaces the earlier mesh. It includes the six-spoke front wheel, both front brakes, closed supports, folded passenger pegs, bare rider pegs, original mirrors, revised lenses and cap, and simplified exhaust. No decals are included. The radiator is the only embedded image texture. The rear chain and sprocket sit 26 mm farther inward; closed black chain spans meet the rear semicircle, behind the existing grey hub. The sprocket rotates with the wheel; the chain wrap stays with the swingarm.

Body paint is split into tank, front and tail; both rims have independent paint tags. The motorcycle palette includes black with red rim stripes, red, white with white rims, yellow with black rims and no red stripe, grey and blue with grey rims, and the owner's anniversary combination (`#c51b28`): red front/tank and grey rear. Other colour combinations omit the red rim stripe. Fixed metal, tyres and lenses keep their materials.

After a new Blender export, `scripts/import-vfr800-final.mjs <source.glb>` restores the engine metadata from the current shipped GLB without changing the source geometry bytes. `scripts/adjust-vfr800-chain.mjs` applies the owner's chain correction once after import. Regenerate catalog anchors with `npm run rigs:generate`.

## Files

- [vfr800fi-1999.glb](vfr800fi-1999.glb): complete articulated presentation model.
- [vfr800fi-1999.rig.json](vfr800fi-1999.rig.json): steering, fork, swingarm, wheels, shock, driver and light anchors.
- [vfr800.json](vfr800.json): the `vfr800` vehicle preset (spawn it like the car preset).
- [vfr800fi-1999.specs.json](vfr800fi-1999.specs.json): sourced technical reference and explicitly estimated crankshaft torque/power samples.
- [vfr800fi-1999-power.csv](vfr800fi-1999-power.csv): the same estimated full-throttle curve in CSV form.

## Runtime status

**Phase 1: drivable.** The `vfr800` preset runs on the engine's two-wheeled controller (`src/simulation/vehicles/two-wheeled/`): two ray-cast wheels with their own radii, steering about the raked head axis, a lean controller with low-speed balance assist, separate front (S / brake input) and rear (handbrake input) brakes, and the shared automatic gearbox. The rig extractor reads `wheel.front` and `wheel.rear`. It has no turbo sound and plays a quiet click on every gear change (`vehicle.audio`).

**Phase 2.** Real wheelies and stoppies with a configurable assist, rider counterweight on U / O (hang off) and I / L (weight forward / back), a clutch kick on Shift in low gears, placeholder Dual CBS (S and Space each brake both wheels; shares TODO(unverified)) and a procedural 90° V4 engine voice with a 180° crank. Top speed ~250 km/h (owner's bike, limiter): a soft speed limiter at 250 km/h. Details in [docs/motorcycles.md](../../../../docs/motorcycles.md).

Visual kinematics live in the engine: `bindMotorcycleRig(root)` in `src/render/vehicle-presentation/motorcycle-rig.ts` (exported from `@nabla/engine/vehicle-presentation`), ported from the former `vfr800fi-1999-controls.mjs` helper. It reads the steering axis, lock and fork travel from the GLB extras, clones the chain geometry per instance (`dispose()` frees it) and takes the pose from `Simulation.twoWheeledPose(id)`. Visual travel is 100 mm, separate from factory travel.

Which preset values are Honda data and which are placeholders is listed in [docs/motorcycles.md](../../../../docs/motorcycles.md). Every placeholder is marked TODO(unverified) in the engine config; none of them is Honda data.

Reference dimensions do not guarantee every reconstructed body contour: rear bodywork was widened for clearance, mirrors exceed the brochure width, and shock attachment points are estimated. These artistic changes do not change the factory specification sheet.
