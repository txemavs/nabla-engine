# Vehicle anchors authored in GLB

All five stock presets (A3, S3, tractor, trailer and container) use the body GLB as the source of mechanical mounts and driver poses.
Their preset JSON files retain behavior (mass, suspension, engine and brakes),
asset URLs and the model-to-chassis transform. They declare `"rig": "glb"` and
do not author `vehicle.hubs`, `vehicle.driver`, `vehicle.headOffset`, wheel orientations or steering transforms.

## Anchor contract

Create meshless nodes in the active GLB scene with
`extras: { "nabla": { "anchor": "wheel.fl" } }`. The roles currently supported
are `wheel.fl`, `wheel.fr`, `wheel.rl`, `wheel.rr` and `steering`. Left and right
are from the driver's perspective. Names are for humans; metadata identifies
the role. Four wheel anchors are required; six-wheel trailers add `wheel.r2l` and
`wheel.r2r`, in axle order. Steering is optional for assets without a separate
steering mesh. `driver.seat` and `driver.eyes` are a pair: eye translation and
orientation define the neutral cockpit view relative to the chassis. Manual
look is composed after the authored eye orientation.

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
The original tractor and trailer files remain untouched; the trailer preset uses
an annotated copy, `trailer.anchored.glb`. Its `tow.anchor` node uses the supplied
kingpin position, removing the remaining coupling coordinate from the demo.
The truck eye anchor was lowered to see the road and dashboard; other driver
poses preserve the previous camera placement. Passive trailers keep inert driver
metadata for preset compatibility and cannot be boarded.

## Instruments and lights

- A3: `instrument.cluster` and four corner nodes for each GPS/menu surface live
  under the interior. Their `extras.nabla.mount` roles are read independently of
  GLTFLoader name sanitization. Parent transforms are composed. The authored
  interior metadata also contains the casing selection bounds and retract travel.
- Tractor: its `dynamic-dashboard-display` mesh defines position, rotation,
  width and height. Cluster, GPS (K) and menu share the surface exclusively.
- Container: six `monitor.*` anchors carry `extras.nabla.screen` dimensions and
  ids (helm0–2, door0–1, touch). Generated poses place the rendered and interactive
  displays. Older saved container entities need their preset refreshed to acquire
  monitor mounts; missing metadata reports a clear error.

Truck punctual lights and tagged emissive surfaces start off. In the browser
runtime, H toggles the occupied vehicle's authored light group. Intensities come
from GLB `onIntensity` metadata. Cloning rebinds spot/directional targets into
that vehicle's hierarchy so beams turn with it and separate instances stay
independent. H switches driving lights, G selects low/high beams, and K toggles GPS.
Low beams are selected initially; fog lights remain off. The tractor's GLB declares
`beamPattern: "low-beam"`, 1800 cd and a 55 m range. A projected texture removes the
upper half of the low-beam cone with a soft cutoff; it needs no shadow map or extra
scene render. Texture parameters live in `src/config/lighting.ts`. This is a visual
approximation, not a certified photometric headlight profile. Rear red lenses are
emissive only, with no rear punctual floodlights; attached trailers inherit the
tractor's switch. Materials declare `extras.vehicleLightChannel` (`Tail_Stop`,
`Reverse`, or `Marker`). Red and amber marker lenses glow steadily with the light
switch, including the trailer; the amber punctual light sources remain off.
Reverse lenses follow the engaged R gear independently
of the switch, so reverse input during the direction-change delay does not light
them. Flashing turn signals require a dedicated signal controller.
The stock rear-light authoring is recorded in `scripts/author-truck-rear-lights.mjs`.

The tractor's `mirror.left` and `mirror.right` anchors are children of their
door meshes. Each owns a planar lens tagged `extras.nabla.mirror` with its side.
The lens contour is extracted from the original glass faces, retaining the
housing and door hierarchy. Engine discovers these surfaces by metadata and
uses the shared cockpit-only reflection renderer (384×256, at most 8 Hz).
No truck mirror placement is supplied by the runtime. `mirrorTilt` is an
optional user adjustment relative to the authored orientation (zero for the truck).
`scripts/author-truck-mirrors.mjs` records the idempotent stock asset migration.

Collision boxes, mirror tuning, A3 lamp fitting and ramp definitions still use
existing configuration or adapters. This migration does not claim those remaining
geometric definitions have all moved into GLB metadata.

## Stock asset URLs

Published content lives under `assets/library`, with public URLs `/library/...`.
The former `assets/studio` name did not represent an editor dependency. Scene
parsing migrates only known local stock URL prefixes and the old truck folder
name, on the validated copy. Custom URLs, remote URLs, tuning and caller data are
unchanged. This narrow path migration does not upgrade vehicle recipes or anchors.

## Steering wheel axis and authored mirrors

The steering wheel turns about the model's +Z (S3 convention, column pointing away from
the driver). A steering GLB whose rim is tilted inside the file declares the real column axis
with `visual.steering.axis` (unit vector in the steering model's space, pointing away from
the driver); otherwise the wheel wobbles instead of spinning. The white truck uses
`[0, -0.81915, -0.57358]`, the 35° rim normal of `steering.glb`. Full lock is ±90°.

A body GLB without a mirror lens material (the S3 uses material `Llanta 2`) lists flat lenses
in `vehicle.mirrors` (`position`, `normal`, `width`, `height`, body-model metres). The
`nabla.truck` presentation uses this as a compatibility fallback only when no tagged
GLB lenses exist. The stock truck uses its GLB anchors and contains no duplicated
mirror placement in its preset. Authored GLB lenses take precedence in older saved scenes.
