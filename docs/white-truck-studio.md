# White truck assets and trailer capability

The `white-truck-studio` package provides a texture-free white tractor, trailer,
two reusable wheel meshes and the **original** steering wheel. Windows are
transparent, lamps have white/amber/red materials, and the front auxiliary
mirror and its mount are removed. Side mirrors and the steering column remain.

See [the package and animation guide](../assets/studio/trucks/white-truck-studio/README.md)
and [the prototype manifest](../assets/studio/trucks/white-truck-studio/white-truck-studio.json).

## Delivered scope

This change adds assets, an isolated demonstration adapter and tests. It does
not change `vehicleField`, register a production vehicle preset, or add trailer
buttons to the existing Studio toolbar. Its independent demo already has
**Enganchar**, **Desenganchar**, tractor/trailer/separate/coupled modes and a
payload control. This is executable reference behavior for the integration.

Current production constraints in `src/entity/vehicle/field.ts` and
`src/simulation/vehicles/wheeled/runtime.ts` are four hubs, one wheel radius and
one visual wheel asset. Studio's existing vehicle path does not infer physics
from GLB node names. Merely loading these GLBs cannot create a working trailer.

## Required production capability

### Separate bodies, shared driving controls

- A tractor remains independently drivable with no trailer attached.
- A trailer is a separate entity with its own rigid body, colliders, axles,
  suspension, brakes, landing gear, mass and load state. It has no drive torque.
- Support arbitrary axle/wheel counts, per-wheel radius and visual asset, and
  explicit steering/driven roles. Preserve existing four-wheel presets.
- Resolve attachment through compatible coupler capabilities and stable entity
  IDs, not model names, hierarchy parenting or proximity alone.
- Keep both rigs in the host's one physics world and fixed tick. Host-owned
  lifecycle must cover deletion, reset, scene restore, snapshots, network state,
  undoable authored configuration and geographic origin shifts.

### Coupling frames and physical articulation

The GLBs and manifest agree on `fifth_wheel` and `kingpin` local coordinates.
These replace mismatching source JoinPoints with documented design references.
For an initially aligned assembly:

```text
trailerWorld = tractorWorld * fifthWheelLocal * inverse(kingpinLocal)
```

Use this transform for authored placement/reset only. Runtime coupling must not
teleport a moving trailer: capture frames must already be within tolerance.
Once attached, a joint solver controls two independent bodies; do not repeatedly
set the trailer transform from the tractor transform.

The production joint must lock relative translation, allow yaw and fifth-wheel
pitch, and define calibrated roll compliance/limits. Configure yaw/pitch/roll
limits rather than using an unrestricted spherical joint. Retain separate wheel
contacts and load transfer on both bodies. Exclude only expected coupling-region
contacts while retaining cab/trailer collision and jackknife behavior.

The included reference controller deliberately uses a **yaw-only revolute
joint**, +/-1.35 radians, on flat ground. It disables all connected-body contact.
That is sufficient for its synthetic demonstration, not for hills, banking,
cab impacts or physically calibrated articulated-truck acceptance.

### Attach/detach operator flow

Expose **Enganchar** when an uncoupled compatible trailer is nearby and
**Desenganchar** when attached. Spanish labels and actionable disabled-state
reasons belong in Studio's operator UI.

Before attaching, validate occupied/free couplers, capture distance, orientation,
relative linear and angular speed, height, clearance and compatible coupling
types. Transition atomically: create joint, retract landing gear, release trailer
parking support/brake as appropriate, connect service brake/light control, then
publish coupled state. Failed capture must leave both bodies unchanged.

Before detaching, require a stopped, supported trailer and safe landing-gear
placement. Apply its parking brake, deploy supports, remove joint and publish
the uncoupled state. Reject detachment at speed. Recover a stable parked trailer
if the tractor is removed or the scene is reset. Do not detach in mid-air.

### Tara and carga

Required independently editable values:

| Parameter     | Meaning                                    | Constraint                |
| ------------- | ------------------------------------------ | ------------------------- |
| `tareMassKg`  | Empty trailer mass including its equipment | Finite, greater than zero |
| `cargoMassKg` | Payload currently carried                  | Finite, zero or greater   |

```text
totalTrailerMassKg = tareMassKg + cargoMassKg
```

Display **Tara (kg)**, **Carga (kg)** and derived **Masa total (kg)**. The prototype
defaults are 6,500 kg tare and zero payload; neither is a surveyed specification.
Production capacity and axle/coupling limits require authoritative configuration.

Load is physical state: update rigid-body mass, centre of mass and inertia using
its distribution, and derive axle/hitch load. Re-evaluate suspension, tire normal
loads, traction, acceleration, braking distance and stability. Preserve the empty
trailer definition; never bake cargo into tara or scale the GLB to represent it.
The initial model may use a uniform cargo box with an explicit centre, but must
leave room for asymmetric cargo and separately secured load bodies.

Permit changes only while stopped and safely supported (or through a modeled
loading operation). Persist tare/cargo separately through save/load. Reject
negative/non-finite input without mutating state; handle rated overload as an
explicit operator constraint. Tractor engine force drives only its driven axle;
trailer brakes and lights follow the connected service controls.

The demo's `setCargoMass()` already recalculates aggregate mass, centre of mass
and inertia with a parallel-axis approximation, and rejects changes in motion.
Its inertia, suspension and payload geometry remain assumed prototype values.

## Animation integration

- Body roots follow their respective physical bodies with interpolation.
- Road wheels follow their individual hub/suspension pose; steering is about
  local +Y and rolling about local +X. Apply the side-specific mesh orientation
  after those rotations. Do not double-render wheels inside the body GLBs.
- The original steering wheel is a separate GLB. Use the supplied mount and
  oblique axis; the original tilt is already baked into its geometry. Animate
  from actual steering state. The column stays stationary.
- Preserve material names `Headlamp`, `Indicator`, `Tail_stop` and `Dark glass`.
  Animate brake/indicator intensity; add properly aimed scene lights separately
  if illumination is required. Production needs side-specific turn-signal roles
  beyond the demo's hazards.
- Retract/deploy landing supports according to the physical coupling state.
  A detached trailer uses its parking brake and supports, not invisible hovering.

## Acceptance work before enabling production driving

1. Schema round trips preserve arbitrary axles, per-wheel assets, tare, cargo and
   coupler frames; existing cars behave unchanged.
2. Tractor-alone controls work. The trailer parks stably without tractor support.
3. Capture validates alignment, distance and relative motion. Failed capture,
   high-speed release, duplicate attachment and incompatible couplers are rejected.
4. The assembled rig accelerates, brakes, turns and reverses without transform
   snapping. Trailer off-tracking and swept path follow the actual axle geometry.
5. Verify joint load, yaw/pitch/roll travel, reversing/jackknife cases, cab contact,
   slopes, crests, banking and uneven wheel contact.
6. Empty and loaded comparisons show expected changes in acceleration, braking,
   suspension and stability; all loads remain within configured limits.
7. Reset, deletion, detach/reattach, serialization and origin shifts preserve or
   safely release the two bodies. Remove all controllers/joints without leaks.
8. Surveyed dimensions, tire data, mass distribution and hitch references are
   validated in a reference scene before changing `drivable: false`.

## Executed prototype evidence

On the local Rapier 0.17.3 installation, the fixed-step tests passed tractor-only
driving, parked trailer stability, coupled driving/turning/braking, stationary
detach/reattach, capture rejection and invalid input checks. A separate case
loaded 12,000 kg onto 6,500 kg tare, verified 18,500 kg rigid-body mass and shifted
centre of mass, drove/turned/braked, rejected a moving load change, then unloaded.
Five GLBs passed structural/material/anchor checks. The browser demo loaded them,
switched all four modes, drove the tractor and changed cargo through the UI.

These are synthetic flat-ground checks, not surveyed acceptance or a throughput
benchmark. Production Studio trailer integration and hilly-road behavior remain
unimplemented. Re-run from an installed repository root:

```sh
node assets/studio/trucks/white-truck-studio/tests/assets.mjs
node assets/studio/trucks/white-truck-studio/tests/simulation.mjs
node assets/studio/trucks/white-truck-studio/serve.mjs .
# In another terminal, with Playwright's Chromium installed on Linux:
node assets/studio/trucks/white-truck-studio/tests/browser.mjs "$PWD"
```
