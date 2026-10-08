# Honda VFR800FI 99

User-approved black VFR800FI (RC46) asset: 273,994 triangles, 7.83 MB, metres, Y-up, −Z forward.
Original user-supplied Interceptor geometry was simplified and articulated; source SHA-256 and final integrity are in [asset.json](asset.json). Original spoke designs remain. Tyres and chain are smooth, brake tracks are planar, and lenses carry the shared vehicle light channels.

## Files

- [vfr800fi-1999.glb](vfr800fi-1999.glb): complete articulated presentation model.
- [vfr800fi-1999.rig.json](vfr800fi-1999.rig.json): steering, fork, swingarm, wheels, shock, driver and light anchors.
- [vfr800fi-1999-controls.mjs](vfr800fi-1999-controls.mjs): Three.js visual kinematics helper, imported directly from this asset folder.
- [vfr800fi-1999.specs.json](vfr800fi-1999.specs.json): sourced technical reference and explicitly estimated crankshaft torque/power samples.
- [vfr800fi-1999-power.csv](vfr800fi-1999-power.csv): the same estimated full-throttle curve in CSV form.

## Runtime status

**Motorcycle support still needs to be implemented in Engine.** This is an asset, not a selectable/drivable vehicle preset. The existing four-wheel rig extractor does not support wheel.front/rear, and no dummy wheels or car preset are provided. See [motorcycle support and technical data](../../../../docs/motorcycles.md).

The helper exports bindInterceptor(gltf.scene, rigJson), returning an update function accepting steeringAngle, frontCompression, rearCompression, frontRoll and rearRoll. Angles are radians and compression is metres. It clones the chain geometry for each instance; dispose that cloned geometry when destroying the instance. Visual travel is 100 mm, separate from factory travel.

Reference dimensions do not guarantee every reconstructed body contour: rear bodywork was widened for clearance, mirrors exceed the brochure width, and shock attachment points are estimated. These artistic changes do not change the factory specification sheet.
