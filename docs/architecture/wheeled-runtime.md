# Wheeled vehicle runtime — phase 4

The terrestrial driving implementation now lives in
`src/simulation/vehicles/wheeled/`, exposed as `@nabla/engine/vehicles/wheeled`.
It accepts a supplied chassis body, a four-wheel definition and device-independent
commands. It imports no `Simulation`, entity schema, stock catalog, renderer,
Studio, boat or flight implementation, even through type dependencies.

`Simulation` remains the existing public facade and orchestrator: one physics
world, one fixed clock, occupancy, docking, gravity frames, roads, portals, input
validation and flight/boat mode selection. Its road-driving branch delegates to
this runtime. Existing callers still use `vehicleInfo`, `wheelContactInfo`,
`shiftVehicle` and `automaticTransmission` unchanged.

## Public modules

```ts
import {
  createWheeledVehicle,
  stepWheeledVehicle,
  idleWheeledInput,
  wheeledTelemetry,
  wheelContacts,
  shiftWheeledVehicle,
  automaticWheeledTransmission,
  KeyboardSteering,
  type WheeledDefinition,
  type WheeledInput,
} from '@nabla/engine/vehicles/wheeled'
import { initPhysics, World, Body, Box, Vec3 } from '@nabla/engine/physics'
```

`/physics` is a small entry to the existing Rapier facade for independent hosts;
it does not initialize WASM or create a world implicitly. Call `initPhysics()` once
before creating a world. This is the same facade used by `Simulation`, not a
second physics backend. The old root `initPhysics` export remains available.

The wheel/drivetrain configuration is plain data: hubs in local metres, wheel
radius, suspension, stiffness, engine/brake force, driven axle and optional
powertrain. It contains no asset URLs, car names, scene entities or renderer nodes.
`createWheeledVehicle` checks essential finite/positive values before changing the
body. The runtime intentionally remains four-wheel-specific in this phase.

## Ownership and tick order

1. Host creates the **single shared world**, floor/body colliders and chassis.
2. `createWheeledVehicle(body, definition)` creates wheel/state data around that
   supplied body; it does not add a world or attach anything to it.
3. Host attaches `car.raycast.addToWorld(world)`.
4. For each fixed tick (normally 1/60 second), host calls
   `stepWheeledVehicle(car, input, dt, active, powered)` for eligible ground
   vehicles, then steps the shared world **once**.
5. Refresh wheel pose/contact caches with `car.raycast.updateWheelTransform(i)`
   after the physics tick, then read telemetry/contacts. `Simulation` already owns
   its existing wheel-transform synchronization.
6. Detach the rig with `car.raycast.removeFromWorld(world)` before removing its
   body. When destroying the whole host, remove remaining bodies and free
   `world.raw`. Never free a world to remove only one car.

There is no timer, RAF, renderer, asset fetch, per-vehicle physics world or hidden
simulation stepping in this module. The host supplies time; readers return copies
and do not advance the world. Rendering can read less frequently than physics.

A docked vehicle skips terrestrial stepping. `syncWheeledDamping` copies the
carrier's damping for tuned cargo while docked and restores zero body damping
when released; the powertrain models its own rolling/aerodynamic resistance.
Boat and flight branches delegate to their independent runtimes. The active
Simulation container still shares wheel state for ground/flight coordination.

## Commands and telemetry

- `WheeledInput`: normalized `throttle` and `steering` in −1…1, `handbrake`, `launch`.
  Invalid numeric commands are rejected before state changes. Zero elapsed time
  is a no-op. Hosts split frame time into fixed ticks instead of using frame delta.
- `active` selects the occupant's controls; unoccupied cars retain parking braking.
  `powered` gates propulsion/steering. Brake and opposite-direction protections
  preserve the previous behaviour.
- `createWheeledVehicle` spawns the rig in P (gear 0, parked); pass `{ parked: false }` for a
  rig without a gear selector. In P the full service brake and a parking-pawl hold keep the
  vehicle where it stopped, even on a slope. Call `enterWheeledVehicle(car)` when a driver gets
  in: it selects P and starts the start-up sequence (needle sweep, cranking, idle; see
  `docs/configuration.md` → Park on entering). While it runs, `stepWheeledVehicle` keeps P and
  ignores the pedals; telemetry reports `ignition`, `ignitionCount` and `gaugeSweep`.
  `enterWheeledVehicle(car, false)` selects P only.
- Keyboard progressive steering remains `KeyboardSteering`, supplied by the host;
  analog input bypasses it. No specific key names live in vehicle physics.
- Shift commands return `shifted`, `protected` or `unavailable`. The facade keeps
  existing Spanish UI messages. Automatic/manual gears, overrev protection, DSG
  interruption, retention, AWD launch and handbrake burnout use the same formulas.
- `WheeledTelemetry` reports `speedMps` and signed forward speed in m/s. The facade
  facade still reports km/h. It also exposes gear, RPM, engine load, brake/reverse
  state and tyre slip. Presentation bindings decide units and labels.
- `WheelContactSnapshot` contains detached position arrays in absolute physics
  world metres and a normalized world-space contact normal. Missing, invalid or
  airborne contacts have null point/normal and zero slip. Snapshot normalization
  never changes Rapier's cached normal. The effect host subtracts its render origin
  once. It does not query an S3 model, drivetrain preset or scene name.

The existing tyre marks, smoke and sound consume the same per-wheel snapshots
through `Simulation.wheelContactInfo`. The low-level `tireEffects` argument permits
the boat facade to suppress tyre feedback. It does not enable boat physics.

## Runnable independent host

```sh
npm run build
node examples/modularity/wheeled-runtime.mjs
```

This [complete example](../../examples/modularity/wheeled-runtime.mjs) constructs a
custom 150 CV front-wheel-drive car with primitive colliders and one shared Rapier
world. It imports only public physics/wheeled subpaths: no stock vehicle preset,
`Simulation`, DOM, WebGL or Studio. It accelerates, requests a manual reduction,
measures closed-throttle retention and releases resources explicitly.

It also enters the car with `enterWheeledVehicle` (P, start-up sequence) before pulling
away from P. Measured on this run: 20.203 m/s after acceleration (three seconds of throttle
including the P to D dwell), 17.864 m/s after two seconds of retention. These numbers demonstrate the example, not a new tuning target or
performance/FPS claim.

## Equivalence and validation

Before extraction, recorded nine states each for S3, Wrangler and police:
acceleration, steering, handbrake, coast, reverse, launch, burnout, manual and
automatic. After extraction, **all 27 snapshots match exactly**, including poses,
facade telemetry and per-wheel contacts. This is evidence for these runs, not a
claim that a finite test suite covers every terrain or maneuver.

New tests cover two custom vehicles sharing a real Rapier world, removing one
without stopping the other, absolute contacts after an origin rebase, independent
snapshot ownership, invalid normals, power/occupancy gates and module boundaries.
Existing suites cover launch, marks, front/AWD selection, DSG, keyboard steering,
retention, boats, garage behaviour and portal transitions. Browser journeys verify
actual host input and visible/audio tyre feedback.

```sh
npm run typecheck
npm test
npm run build
npm run build:demo
npx playwright test studio/e2e/manual-transmission.spec.ts studio/e2e/s3-launch.spec.ts studio/e2e/tire-driving.spec.ts studio/e2e/cameras.spec.ts
```

The next phase separates boats and flight from the road vehicle container and
injects their environment services. The broader lifecycle/component design remains
incremental; this module is not yet a universal vehicle factory or plugin registry.
