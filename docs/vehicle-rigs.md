# Vehicle anchors authored in GLB

A3, S3 and the modern white tractor use the body GLB as the source of wheel and steering mounting poses.
Their preset JSON files retain behavior (mass, suspension, engine and brakes),
asset URLs and the model-to-chassis transform. They declare `"rig": "glb"` and
do not author `vehicle.hubs`, `visual.wheelRotations` or the steering transform.

## Anchor contract

Create meshless nodes in the active GLB scene with
`extras: { "nabla": { "anchor": "wheel.fl" } }`. The roles currently supported
are `wheel.fl`, `wheel.fr`, `wheel.rl`, `wheel.rr` and `steering`. Left and right
are from the driver's perspective. Names are for humans; metadata identifies
the role. All five anchors are required for this four-wheel rig contract.

Author wheel centers at suspension rest, with orientation matching the separate
wheel mesh. Engine adds suspension rest length to the physical connection point.
The steering node is the pivot of the separate steering mesh. Nodes may have
parents: extraction composes the full hierarchy and the preset body transform
into chassis coordinates (metres, Y-up, forward -Z). Scaled, mirrored, sheared,
missing or duplicate anchors are rejected; nothing is inferred from mesh bounds.

Run `npm run rigs:generate` after editing a body or its placement. Commit the
generated `src/catalog/vehicles/generated-rigs.ts` alongside the GLB. It records
the source URL and SHA-256 and supplies identical poses to browser presentation
and headless physics without a renderer or asynchronous model loading.
`npm run rigs:check` in CI fails if the generated data is stale.

## Migration provenance and limits

The corrected A3 body supplied on 2026-10-04 contained no wheel or steering
anchors. Its geometry was preserved and five metadata nodes were added using
the previous preset poses, transformed into model space. These are migrated
placements, not new measurements of the corrected mesh. Edit the GLB nodes to
adjust their placement from now on.

The S3's former presentation-code steering alignment is baked into the dedicated
`s3.steering.glb` mesh, keeping its animation pivot unchanged. The A3 retains its
original steering mesh. Both share the body anchors.

The modern tractor keeps the supplied hub and fifth-wheel positions. Semantic
metadata was added to those nodes; wheel orientations and the missing steering
mount were migrated from the previous preset. The optional `tow.hitch` role
generates `vehicle.hitch`, used by the demo instead of a numeric constant.
The original tractor body and trailer assets remain untouched. Other vehicles
retain their existing preset format. Driver
eyes, collision boxes, mirrors, instruments, lamps, ramps and trailer-side tow anchors have
not yet migrated to this contract. The current extractor supports four wheels;
six-wheel trailers will need an explicit role/order extension.
