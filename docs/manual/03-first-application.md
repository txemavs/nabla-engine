# 3. Your first application

[Manual contents](README.md)

Start with a local scene so that network availability is not part of the first
experiment. A scene needs a version, a name, and valid entities, including exactly
one spawn. `createEntity` supplies structural defaults; it does not make every kind
fully configured for every purpose. In particular, a vehicle needs a definition.

The complete shared scene is in [scene.mjs](../../examples/manual/scene.mjs).
It creates a static box floor, a spawn, and a procedural compact car. It calls
`parseScene` before returning the document so that errors fail at the data boundary.
The floor's center is at Y = −0.5 and its height is 1 metre, placing its top at zero.

## Run without a browser

```sh
npm run build
node examples/manual/session.mjs
```

The program creates a `PlaySession`, calls `play` with `physicsWorker: false`, lets
the car settle, enters it, applies forward input, and advances fixed-duration
frames. It checks motion, pause/resume behavior, and that the authored document
was not changed by simulation. A `finally` block disposes the session.

This is useful for learning physics ownership: the program owns the clock, while
the session owns the simulation. You must not dispose the returned simulation
independently of its owner or run a second clock over it.

## Mount a browser runtime

[browser.ts](../../examples/manual/browser.ts) exports `mountManualGame(canvas)`.
Call it from a TypeScript application using a browser bundler. It imports
`GameRuntime` specifically from `@nabla/engine/runtime/browser`, supplies the same
scene, enables the HUD, and starts play. It returns a cleanup function for the
application's unmount or route-change handler.

The shared scene includes an offline geographic anchor because the browser runtime
requires `geography`, even for a local box floor. It supplies no `tiles` option,
so that anchor does not request geographic terrain.

Give the canvas a parent with a real layout size. For example, a full-window host
can set the parent to `position: relative; width: 100vw; height: 100vh` and the
canvas to `display: block; width: 100%; height: 100%`. The host owns that DOM layout.
The browser runtime owns its rendering loop; do not add a parallel `requestAnimationFrame`
loop that also steps physics.

The supplied browser example disables audio and sea rendering and requests no tile
provider. A procedural car avoids a GLB dependency, but the broader browser runtime
may still request shared presentation resources. Serve the engine assets as explained
in [integration](04-integration.md). The example is a module, not an independently
served HTML entry.

## Experiments

Change the car mass and engine force in `scene.mjs`, rerun the simulation, and
compare speed after the same simulated duration. Move the spawn away from the car
and omit `vehicleId` in the browser example to start on foot. Add a second static
box and inspect the distinction between a visible obstacle and its physical bounds.

## Source of truth

- [Scene validation](../../src/scene/document.ts).
- [Entity factory](../../src/entity/schema.ts).
- [Session ownership](../../src/runtime/session.ts).
- [Browser constructor options](../../src/runtime/browser.ts).
