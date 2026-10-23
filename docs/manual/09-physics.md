# 9. Physics and simulation

[Manual contents](README.md)

Each `Simulation` owns one Rapier world. Vehicle controllers, character movement,
terrain collisions, and interactions operate within that ownership boundary.
Visual meshes are not automatically physical colliders; authored and generated
collision definitions determine contact behavior.

The inspected defaults specify a fixed step of `1 / 60` second, `maxSubsteps: 8`,
`maxFrameSeconds: 0.1`, and gravity `9.81` m/s². The session caps frame duration and
the simulation bounds catch-up work. A fixed timestep improves predictable
integration, but does not establish cross-platform bitwise determinism. Treat these
numbers as a dated snapshot; [configuration](../../src/config/simulation.ts) owns them.

## Input, stepping, and presentation

Logical `PlayerInput` is independent of a keyboard device. `idleInput()` supplies
a neutral command set. Set input before advancing simulation. The browser runtime
combines device input and schedules this work for you; a standalone simulation
caller supplies both.

Physics state and visible interpolated state serve different purposes. Queries
and collision decisions use authoritative simulation state. Presentation may
interpolate snapshots to avoid visible fixed-step jitter. Do not feed an interpolated
display pose back into physics as if it were a new authoritative measurement.
Teleportation and portal transitions need interpolation history reset rather than
blending across the intervening space.

## Extending physical behavior

Use the exported physics and standalone vehicle interfaces when owning a world
directly. The [wheeled example](../../examples/modularity/wheeled-runtime.mjs)
demonstrates that integration level. Its caller owns stepping and teardown; this
responsibility must not be duplicated by a `PlaySession` over the same objects.

For a collision issue, reproduce with a small floor and one obstacle. Check collider
dimensions, transforms, motion type, and actual collision installation before
changing solver parameters. For streamed terrain, a visible tile does not prove
all nearby collision work has completed.

The [headless vehicle example](../../examples/modularity/headless-vehicle.mjs)
checks that a stock vehicle can enter, start, and accelerate. It is a functional
regression, not a measured vehicle-dynamics certification. Several motorcycle
tuning values are explicitly marked `TODO(unverified)` in source.

## Source of truth

- [Simulation](../../src/simulation/simulation.ts) and [physics API](../../src/simulation/physics-api.ts).
- [Physics defaults](../../src/config/simulation.ts).
- [Worker host](../../src/simulation/simulation-worker-host.ts).
- [Simulation tests](../../test/simulation).
