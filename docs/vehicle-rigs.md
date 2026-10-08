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
`wheel.r2r`, in axle order. Single-track vehicles (motorcycles, `vehicle.twoWheeled`) author
`wheel.front` and `wheel.rear` instead and become two hubs, front first; mixing them with the
four-wheel roles is an error (see [motorcycles](motorcycles.md)). Steering is optional for assets without a separate
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
The S3 rim was later moved 3 cm forward along its column (model +Z, toward the
instrument cluster) by `scripts/move-s3-steering-wheel.mjs`, which slides the alignment root
of `s3.steering.glb` only (recorded as `extras.nabla.columnForward`); in chassis metres that is
2.8 cm forward and 1.1 cm down. The shared `steering` anchor and the A3 wheel are unchanged.
Txema's runtime «Volante» choice for the S3 (distance +1.0 cm, height +2.5 cm on top of that) is
now baked too: the same script records `extras.nabla.columnForward: 0.04` (total along the
column) and `extras.nabla.height: 0.025` (chassis up), so the S3 sliders read 0 with the wheel
there. Because the column is tilted, the height step also moves the rim across its spin axis by
about 2.3 cm; the script records the moved axis as `extras.nabla.spinPivot` (see below) so the
wheel still turns about its own centre line.

### Steering spin pivot (`extras.nabla.spinPivot`)

A steering GLB spins about `visual.steering.axis` (default model +Z) through its scene origin.
When geometry is moved across that axis inside the file, any node may declare
`extras.nabla.spinPivot: [x, y, z]` — a point on the new spin axis in the GLB scene's space, in
metres. `SceneView` reads it from the loaded model (`steeringPivot`, GLTFLoader keeps extras in
`userData`) and passes it to `poseSteeringWheel`, which translates the spin group so that point
stays fixed while the wheel turns. Without it, nothing changes.

The modern tractor keeps the supplied hub and fifth-wheel positions. Semantic
metadata was added to those nodes; wheel orientations and the missing steering
mount were migrated from the previous preset. The optional `tow.hitch` role
generates `vehicle.hitch`, used by the demo instead of a numeric constant.
The original tractor and trailer files remain untouched; `trailer.anchored.glb`
is the annotated source. `npm run trailer:split` writes `trailer.chassis.glb`
(frame, Stützbein, `tow.anchor`, wheel hubs) and `trailer.box.glb` (white cargo).
`white-trailer` composes both; `white-trailer-chassis` uses only the chassis.
The truck eye anchor was lowered to see the road and dashboard; other driver
poses preserve the previous camera placement. Passive trailers keep inert driver
metadata for preset compatibility and cannot be boarded.

## Driver steering-wheel adjustment (runtime)

Players can move the wheel live without editing any GLB: **Ajustes → Vehículos → Volante** has
two sliders, «Volante: distancia» and «Volante: altura» (±8 cm, 0.5 cm steps, shown in cm),
and «Restablecer volante». The offset is applied on top of the baked GLB pose and the
`steering` anchor, so it works for the S3, the A3, the tractor and any preset with
`visual.steering`:

- `SceneView` puts a translation-only `steering-adjust` group between the authored mount and
  the spin group (mount → adjust → spin → GLB). The spin group moves as a whole, so steering
  still turns the rim about its own column; the pivot moves with the rim.
- `distance` runs along the steering axis (`visual.steering.axis`, default model +Z, the same
  axis the wheel spins about): positive moves the wheel away from the driver toward the
  instrument cluster, like `columnForward`. On the S3 and A3 that axis points 22° below level,
  so +1 cm is about 0.93 cm forward and 0.38 cm down in the chassis. `height` is the chassis
  vertical (+Y): positive raises the wheel.
- Adjustments are per steering model, keyed by the steering GLB URL
  (`/library/cars/a3/s3.steering.glb`, `/library/cars/a3/a3.steering.glb`, …). Every car of a
  model shares one adjustment.
- Precedence: the player's saved choice, then the host default, then the GLB pose.
  «Restablecer volante» forgets the saved choice and goes back to the host default.

Engine API: `SceneView.setSteeringWheelOffset(model, {distance, height})`,
`steeringWheelOffset(model)`, `steeringWheelModel(vehicleId)` and the
`SceneViewOptions.steeringWheelOffset` resolver; `GameRuntime.steeringWheel`,
`setSteeringWheelOffset`, `resetSteeringWheelOffset` and the
`GameRuntimeOptions.steeringWheel` settings (`defaults` by model in metres, `storage` such as
`localStorage`). Saved choices live under `nabla.steeringWheel:<model>`. The game passes
`localStorage` and reads host defaults from `?wheel=` (see
[Game library mode](game-library.md#host-steering-wheel-defaults)).

Every change is logged with `console.info`, in cm and in metres:

```text
[nabla] Steering wheel /library/cars/a3/s3.steering.glb: distance +1.5 cm, height -0.5 cm {"distance":0.015,"height":-0.005}
```

The menu also shows «Valores para fijarlo» in metres. To make a choice the default for
everyone, either set it as a host default (`?wheel={"car":{"distance":0.015,"height":-0.005}}`)
or bake it into the steering GLB. For the S3, `scripts/move-s3-steering-wheel.mjs` uses the
slider's own axes: add the `distance` to its `columnForward` constant and the `height` to its
`height` constant, then run `node scripts/move-s3-steering-wheel.mjs`. It converts chassis up
into model space exactly like the slider (chassis +Y rotated by the inverse `steering` mount
rotation), applies only the difference from the values recorded in the GLB (idempotent) and
updates `spinPivot`, so the baked wheel matches the slider vertex for vertex at every steering
angle. After a bake, press «Restablecer volante» (or clear `nabla.steeringWheel:<model>`) so a
saved runtime value doesn't add on top of the new default.

## Driver mirror adjustment (runtime)

**Ajustes → Vehículos → Espejos** (below «Volante») turns each mirror glass of the vehicle the
player drives, live: «Espejo izquierdo / derecho: giro» (yaw, ±15°) and «… : inclinación»
(tilt, ±10°), 0.5° steps, shown in degrees, plus «Restablecer espejos». It works for every
vehicle with cockpit mirrors: the S3 and the A3 (the `Llanta 2` door lenses), the tractor (its
tagged GLB lenses) and any preset with `vehicle.mirrors` lenses.

- `yaw` turns the glass about the vehicle vertical: **+ outward** (away from the body; the view
  swings outward), **− inward** (more of your own flank). `tilt` turns it about the horizontal:
  **+ up**. The reflected view moves by about twice the glass angle.
- `CarMirrors` turns the live `Reflector` glass (the outside lens mesh stays put). The
  reflection is computed from that glass at every capture, and a change forces a capture, so
  the mirror view follows at once. Order: authored lens → vehicle `mirrorTilt` + tilt → yaw.
- Sides come from the lens tag (`extras.nabla.mirror`) or, for untagged lenses (S3 / A3),
  from which side of the chassis the lens sits on (`mirrorSideOf`). The outward direction is
  the chassis ±X.
- The capture camera is kept upright with the **vehicle** up (`fitMirrorCamera(..., up)`), not
  the lens node's own +Y. The S3 / A3 right-door lens is authored under a node rotated 180°
  about X, so its own +Y points down and the right capture used to run rolled upside down;
  every lens now captures upright whatever roll it was authored with. The yaw / tilt sign
  convention is unchanged on both sides.
- Adjustments are per **mirror model** (`mirrorModelKey`): the body GLB URL plus the steering
  GLB when there is one. The S3 and the A3 share a body but keep separate mirror settings.
- Precedence: the player's saved choice, then the host default, then the baked aim. Saved
  choices live under `nabla.mirrors:<model>`.

Engine API: `SceneView.setMirrorAdjustment(model, {left: {yaw, tilt}, …})`,
`mirrorAdjustment(model)`, `mirrorModel(vehicleId)`, `mirrorSides(vehicleId)` and the
`SceneViewOptions.mirrorAdjustment` resolver; `CarMirrors.setAdjustment` / `sides`;
`GameRuntime.mirrors`, `setMirrorAngle(side, {yaw, tilt})`, `resetMirrorAdjustment` and
`GameRuntimeOptions.mirrors` (`defaults` by model in degrees per side, `storage`). The game
passes `localStorage` and reads host defaults from `?mirrors=` (see
[Game library mode](game-library.md#host-mirror-defaults)).

Every change is logged with `console.info`, per side and as JSON:

```text
[nabla] Mirrors /library/cars/a3/a3.cabrio.glb#/library/cars/a3/s3.steering.glb: left yaw -2.0° tilt 0.0°, right yaw -1.5° tilt +0.5° {"left":{"yaw":-2,"tilt":0},"right":{"yaw":-1.5,"tilt":0.5}}
```

The menu shows the same JSON as «Valores para fijarlo». To make it the default for everyone,
either set it as a host default (`?mirrors={"car":{"left":{"yaw":-2},…}}`) or bake it into the
preset with `node scripts/bake-mirror-aim.mjs car '<values>'` (`a3`, `white-truck`, … or a
preset JSON path). That adds the values to the preset's `vehicle.mirrorAim` (degrees per side,
yaw ±30°, tilt ±20°), which `CarMirrors` applies under the sliders, identical to the slider
turn. Then press «Restablecer espejos» (or clear `nabla.mirrors:<model>`) so a saved value
doesn't add on top. The GLBs are not touched; the earlier tractor right-lens fix
(`scripts/aim-truck-mirrors.mjs`) stays as the authored aim.

## Instruments and lights

- A3: `instrument.cluster` and four corner nodes for each GPS/menu surface live
  under the interior. Their `extras.nabla.mount` roles are read independently of
  GLTFLoader name sanitization. Parent transforms are composed. The authored
  interior metadata also contains the casing selection bounds and retract travel.
- Tractor: its `dynamic-dashboard-display` mesh defines position, rotation,
  width and height. Cluster, GPS (G) and menu share the surface exclusively.
- Container: six `monitor.*` anchors carry `extras.nabla.screen` dimensions and
  ids (helm0–2, door0–1, touch). Generated poses place the rendered and interactive
  displays. Older saved container entities need their preset refreshed to acquire
  monitor mounts; missing metadata reports a clear error.

Truck punctual lights and tagged emissive surfaces start off. In the browser
runtime, H toggles the occupied vehicle's authored light group. Intensities come
from GLB `onIntensity` metadata. Cloning rebinds spot/directional targets into
that vehicle's hierarchy so beams turn with it and separate instances stay
independent. H switches driving lights, G toggles GPS, and K selects low/high beams.
Low beams are selected initially; fog lights remain off. The tractor's GLB declares
`beamPattern: "low-beam"`, 1800 cd and a 55 m range. A projected texture removes the
upper half of the low-beam cone with a soft cutoff; it needs no shadow map or extra
scene render. Texture parameters live in `src/config/lighting.ts`. This is a visual
approximation, not a certified photometric headlight profile. All driving beams
(authored or built) are scaled by `headlightIntensityScale` and get a slightly wider
penumbra (`headlightPenumbraBoost`) for a softer edge. The S3 has no GLB lamps, so
`createA3Lights` builds the same setup in code at its two front lamp units (low beams
with the cut-off projection, high beams 18000 cd / 130 m, both aimed slightly down)
as ordinary `vehicle-light` nodes. Rear red lenses are
emissive only, with no rear punctual floodlights; attached trailers inherit the
tractor's switch. Materials declare `extras.vehicleLightChannel` (`Tail_Stop`,
`Reverse`, `Indicator`, or `Marker`). Red and amber marker lenses glow steadily with the light
switch, including the trailer; the amber punctual light sources remain off.
Reverse lenses follow the engaged R gear independently
of the switch, so reverse input during the direction-change delay does not light
them. Z toggles the left indicator and X the right; selecting the same side again
cancels it. Indicator lenses stay dark unless signalling, even with headlights on.
The selected amber side blinks, while separate marker lenses retain
their position-light behavior. Stop lamps brighten when braking, independently
of the driving-light switch. Attached trailers sample the tractor's switches,
brake/R telemetry and frame timestamp; detached trailers have no electrical feed.
The stock rear-light authoring is recorded in `scripts/author-truck-rear-lights.mjs`.

`VehicleLightController` is the common renderer-independent state machine exported
from `@nabla/engine/vehicle-presentation`. Both `CarLights` (legacy Audi lens bindings)
and `AuthoredVehicleLights` (GLB bindings) evaluate its channels; neither implements
separate blinking or brake/reverse rules. The GLB material metadata
`vehicleLightChannel` selects a channel and `vehicleLightSide: "L" | "R"` selects
the indicator side. Left and right trailer clusters have independent materials.
Timing and stop-lamp boost are documented in `src/config/lighting.ts`.

The tractor enables `vehicle.reverseAlarm`. Its synthesized warning beeps only
while the occupied, powered vehicle has R engaged, including when stationary.
Leaving R, exiting the vehicle, muting or hiding the page stops the warning.
Audio defaults (frequency, gain and cadence) live in `src/config/audio.ts` and
are exported through `@nabla/engine/config`; cars omit the opt-in flag.

The tractor's `mirror.left` and `mirror.right` anchors are children of their
door meshes. Each owns a planar lens tagged `extras.nabla.mirror` with its side.
The lens contour is extracted from the original glass faces, retaining the
housing and door hierarchy. Engine discovers these surfaces by metadata and
uses the shared cockpit-only reflection renderer (384×256, at most 8 Hz).
No truck mirror placement is supplied by the runtime. `mirrorTilt` is an
optional user adjustment relative to the authored orientation (zero for the truck).
`scripts/author-truck-mirrors.mjs` records the idempotent stock asset migration.
The stock right lens was a copy of the left one mirrored about the centre line, but the
driver sits on the left, so it looked ~28° out to the roadside. `scripts/aim-truck-mirrors.mjs`
(idempotent, JSON chunk only) turns the `mirror.right` anchor ~14.4° toward the driver so that,
from `driver.eyes`, its reflected view is the left mirror's view mirrored: back along its flank.

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
