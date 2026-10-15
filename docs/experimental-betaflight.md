# Experimental Agency drone

`@nabla/engine/experimental/betaflight` ports the quadcopter controller from
`txemavs/agency-ui`, snapshot `89b0907`. The original source is in
`src/stage/drone/{droneDef,droneSpec,droneControl,droneMesh}.ts` there. Imported with
the author's authorization; Agency's copyright remains with Nabla Soluciones
Lógicas, S.L. This is Agency's simulator named **Betaflight**, not the official
Betaflight firmware, SITL, a configurator connection or a WASM firmware build.

## Shared Engine physics

`BetaflightDrone` accepts an initialized Engine `World`, a position in metres and
an optional `DroneSpec`. It owns one Rapier dynamic rigid body and collider.
Call `beforeStep(input, dt)` immediately before each `world.step(dt)`. It applies
motor thrust and torque; the shared world owns gravity, time, contacts and
integration. Do not advance a second drone world. `reset()` clears velocity,
forces and PID history; `dispose()` removes the body and is idempotent.

The Agency controller, Mode 2 channels, mixer, rates and PID configuration are
preserved as reusable modules. The old Agency custom quaternion integrator and
hard-coded floor are deliberately not imported. Pitch feedback is converted to
the controller's convention; motor forces use physical motor positions with
+X right, +Y up, +Z nose. Derivative gains were retuned from Agency's custom
integrator for the real collider inertia at the room's 90 Hz fixed step.
Both Acro and Angle are exposed by the AR demo. Legacy loiter/autonomous controller
branches remain experimental and have not been validated with the new plant.

## AR composition

`ARDrone` adds the small original procedural quad adapted to Three.js, reads Mode 2
Quest sticks and renders body snapshots. It does not create a room, renderer,
session, menu or independent physics loop. `game/ar.ts` composes it with the same
`ARRoom` and `ARRoomPhysics` used by the other objects:

```ts
const drone = new ARDrone(scene, () => roomPhysics.physicsWorld)
roomPhysics.beforePhysicsStep = (dt) => drone.beforeStep(dt)
await roomPhysics.ready
drone.spawn(camera) // starts disarmed; at most one drone
// Each visible frame, before roomPhysics.update:
drone.readInput(controllerSources, dt, menuIsOpen)
roomPhysics.update(dt, scannedSurfaces)
drone.sync(dt)
```

The monitor has **Betaflight · experimental** → Add drone / Arm / Angle or Acro /
Recover here / Remove. X opens the existing monitor. Mode changes and recovery
disarm. In Angle, neutral left stick requests hover; push left up/down to climb
or descend, left/right to yaw; right stick banks and pitches. Acro integrates
spring-centred left vertical stick into a 0–100% throttle setting, starting at
zero when armed. The menu neutralizes sticks while used. Losing either controller,
hiding the session, or removing the drone disarms it. A drone and an R/C car do
not compete for sticks: adding either replaces the other. Hand tracking flight
controls are not implemented.

The room's fixed physics hook runs once per actual substep, not per render frame.
Scanned room colliders, fallback floor, weapons and balls share that world.
The disposal portal and Environment → Free memory remove the drone as well.
No environment scan or user preferences are cleared. Desktop Euskadi has no
import of this experimental module; the AR entry loads it with the AR demo.

## Validation

Tests cover hover, Angle recovery, climbing, shared floor/ceiling collision,
tracking-loss disarm, replacement and disposal, plus the original Agency channel,
mixer and rate tests. Browser smoke checks cover the monitor button and navigation.
Real Quest room flight, motor feel and Acro still require headset testing.

## Helicopter presentation

The general AR demo now replaces the procedural quad with the user-supplied
helicopter through `ARDrone.spawnModel(camera, url, scale)`. This is presentation
only: `BetaflightDrone`, rigid body, collider, mass, PID, mixer and stick inputs
are unchanged. Other hosts can still call `spawn(camera)` for the procedural
quad. Model loading is cancellable when the aircraft is removed or replaced.

Main and tail pivots follow actual motor output around Y and X respectively.
The corrected tail rotor sits on negative model X, with blades in the YZ plane.
One optional spotlight has no shadow map. X toggles it once per press; in this
AR demo only, Y opens/closes the monitor while that helicopter is present.
Removing it restores X for the monitor. The monitor also has an explicit focus
button. Existing arm/disarm, Angle/Acro, reset and disposal mechanisms remain.
