# white-truck-studio

White MAN TGX tractor and trailer visual assets, with a standalone flat-ground
Rapier prototype. This package is **not a stock Studio vehicle preset** and does
not register production trailer capability in the engine.

## Files and coordinate contract

| File                      | Purpose                                                                   |
| ------------------------- | ------------------------------------------------------------------------- |
| `assets/tractor.body.glb` | Tractor body, transparent windows, colored lamps, hub and hitch markers   |
| `assets/trailer.body.glb` | Trailer body and spare wheel, without road wheels                         |
| `assets/wheel.front.glb`  | Reusable front wheel, origin at hub                                       |
| `assets/wheel.rear.glb`   | Reusable wide rear wheel, used twice on tractor and six times on trailer  |
| `assets/steering.glb`     | Original steering rim and spokes, removed from tractor body               |
| `white-truck-studio.json` | Prototype parts, mounts, hubs, colliders, mass and coupling configuration |
| `runtime/rig.mjs`         | Borrowed-world Rapier controller, attach/detach and payload update        |
| `runtime/view.mjs`        | Three.js pose, wheel, steering and material animation                     |

Metres, +Y up, -Z forward. No import rotation or scale is needed. Body origins
are 1.2 m above the nominal flat ground; spawn both bodies at Y=1.2 before the
suspension settles. Wheel origins are their axle centres. Wheel geometry is
authored for the left side; the manifest supplies a Y rotation for the right.

The selected body meshes are 2.55 m wide, excluding mirrors and protrusions.
The trailer body was vertically adjusted to 4 m overall and reuses the tractor's
rear-wheel size. These are design assumptions, not surveyed MAN dimensions.
The source JoinPoints did not agree in height or setback. The manifest replaces
them with explicit design anchors at a common nominal 1.2 m world height and a
1.3 m trailer-front setback; do not restore the original JoinPoints.

## Run the included prototype

From this directory, with an installed `nabla-engine` checkout:

```powershell
node serve.mjs C:/Data/codex/nabla-engine
```

Open http://127.0.0.1:8796. The server reads Three.js and Rapier from that
checkout; it does not download dependencies. W/S drive forward/reverse, A/D
steer, and Space brakes. Select tractor, parked trailer, separate vehicles or
coupled vehicles. In separate mode, reverse the tractor toward the trailer,
stop and press **Enganchar**. **Desenganchar** also requires a stopped rig.
The demo includes lights, hazards, anchor markers and a cargo-mass control.
The UI's 24,000 kg upper bound is only a demo control bound, not a rated payload.

## Animation

1. Apply the physics body's position/quaternion to its body visual root.
2. Place each wheel from its own hub and simulated suspension length. Compose
   body rotation, steering about +Y, spin about +X, then the wheel's side
   orientation. The two wheel types and individual radii remain explicit.
3. Mount `steering.glb` at `tractor.steeringWheel.position`. Its original tilt is
   baked into the mesh: rotate around the supplied axis, not a guessed global
   Z axis. `maxAngle` is prototype steering travel, not measured MAN travel.
4. Animate `Headlamp`, `Indicator` and `Tail_stop` emissive intensity. These are
   texture-free colored materials; they do not emit scene illumination by
   themselves. The demo implements hazards, not individual left/right signals.
5. Keep glass alpha blending and disable depth writes for transparent materials.
6. Keep tractor and trailer as separate physics bodies. Never parent the trailer
   to the tractor and treat it as a rigid extension of the chassis.

## Host integration

Initialize the **same Rapier instance** as the host, then pass the host's raw
Rapier world into `createRig(RAPIER, world, manifest, { mode })`. Call
`rig.beforeStep(fixedDt, input)` before the host's one world step and update the
view afterwards. Do not step the world twice. Call view/rig disposal when leaving
the scene; the adapter never frees the borrowed world. The demo owns its own
world only because it is a standalone test host.

This package uses raw Rapier controllers and does not register bodies with
Nabla's entity registry, selection, origin shifting, snapshots or networking.
Production integration must make those systems own the lifecycle and preserve
body/anchor coordinates when the geographic origin changes. GLB node names and
`extras` do not automatically create simulation capabilities.

## Tara and carga

The trailer has independent `tareMassKg` and `cargoMassKg` values. Total mass is
their sum; the prototype defaults are 6,500 kg tare and zero cargo. Cargo also has
an explicit centre and box size for an approximate inertia calculation.
`setCargoMass(kg)` updates mass, centre of mass and principal inertia using the
parallel-axis rule while stopped. It rejects negative/non-finite loads and
changes while moving. No GLB rescaling is involved.

Production must additionally enforce the selected trailer's rated capacity,
axle/coupling limits, cargo placement and retention, and recalibrate suspension,
braking and stability against actual reference data. The prototype's assumed
empty inertia and centred box load are not a measured load model.

## Limits and validation

`drivable: false` records that road/scene acceptance remains outstanding; it does
not prevent running the explicitly labeled prototype. The hinge allows yaw only
(approximately +/-77 degrees). It does not model fifth-wheel pitch compliance,
roll limits or uneven terrain. Connected-body collisions are disabled in the
prototype; production needs selective coupling collision exclusions while
retaining cab/trailer contact. Steering uses a common front angle, not Ackermann.
Wheel contacts are rays and do not provide physical sidewall collision.

Node tests exercise independent tractor driving, separate trailer parking,
coupled acceleration/steering/braking, capture rejection, detach/reattach, invalid
inputs and a 12,000 kg payload. Browser tests load the GLBs, switch modes and
exercise throttle. See the JSON result files for executed evidence.
No measured throughput benchmark, surveyed road acceptance or production Studio
integration is claimed. Atlas/PostGIS checks are unrelated and were not run.

## Attribution and changes

Original author: zairiq zairiq 8 (https://sketchfab.com/zairiqzairiq8).
License: CC-BY-4.0, https://creativecommons.org/licenses/by/4.0/.

- Truck source: https://sketchfab.com/3d-models/truck-man-tgx-d5863f393e374c179ac8bba1160ca46f
- Trailer source: https://sketchfab.com/3d-models/trailer-9e81902a7d544a4db928fbb70b33473b

The user supplied the source GLBs. Their SHA-256 hashes are in the manifest and
their author/license metadata is preserved in every derived GLB. Modifications:
texture/UV removal, white PBR paint, transparent glass, colored light materials,
separate wheels and original steering, removal of overlapping trailer variants,
removal of the front auxiliary mirror and mount (truck spec-mesh connected
components 7 and 10), coordinate normalization and design-scale changes.
Steering components 68 and 84 are the original spokes and rim; component 86
(column) stays in the body. Material separation on wheel rims uses a radial
approximation. These third-party assets retain CC-BY-4.0 rather than the code's
MIT license. Preserve attribution when redistributing them.
