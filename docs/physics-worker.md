# Physics worker (`?physicsWorker=1`)

The Rapier simulation can run in a Web Worker. It is **off by default**: without the URL switch
the game runs exactly the inline code path it always has.

## How it is wired

| Piece                                                                         | Thread | File                                                                                   |
| ----------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| Full `Simulation` (Rapier world, fixed 1/60 s tick, gameplay inside the tick) | worker | `src/simulation/simulation-worker-host.ts` (`serveSimulation`), `simulation.worker.ts` |
| `ThreadedSimulation`: stands in for `Simulation` on the main thread           | main   | `src/simulation/threaded-simulation.ts`                                                |
| `QueryWorld`: query-only Rapier world mirrored from the worker                | main   | `src/simulation/query-world.ts`                                                        |
| Shared query code (`nearestShotHit`, `cameraClearance`) used by both          | both   | `src/simulation/scene-queries.ts`                                                      |

- `PlaySession.play()` starts a `ThreadedSimulation` when `?physicsWorker=1` (or
  `play({ physicsWorker: true })`); otherwise a plain `Simulation`.
- **Render waits for the step.** `PlaySession.step()` returns a promise for the worker; the browser
  frame (`frameSteps` / `frameXRSteps`, driven by `driveFrame`) pauses at the step and resumes, and
  renders, once the state of that step has arrived. Frames requested meanwhile are skipped. Inline
  physics never yields a promise, so the frame runs synchronously as before.
- The render reads `entityTransform(id, true)` and `wheelTransforms(id, true)` from the snapshot
  the worker returns with each step.
- After every step the worker also sends:
  - **reads**: every synchronous read the game makes (`player`, `stats`, `vehicleInfo` both
    ways, `wheelContactInfo`, `vehicleFeedback`, `vehicleDamage`, `vehicleSpec`, `cargoCount`,
    `cargoTrailer`, `nearestVehicle`, `vehicleList`, `portalEvent`, `portalState`,
    `playerEjection`, `playerBikeRecovery`, `stance`, `eyeOffset`, `entityVelocity`,
    `catchDisk`, drained `consumeExplosions`, scenery pole poses);
  - **a query-world delta**: colliders of bodies that appeared or changed shape (box, sphere,
    trimesh, heightfield, sensors), removed bodies, and every collider's world pose.
- **Instant queries stay synchronous.** `shoot()` (all ~20 per-frame hitscans: aim, camera,
  probes, ground and wall checks) and `cameraPosition()` run against the `QueryWorld` with the
  same code and exclusions (player capsule, occupied vehicle, its trailers, `excludeEntityId`) as
  inline. A shot with `impulse > 0` is also forwarded so the worker applies the impulse.
- Commands (`interact`, `setInput`, `addVehicles`, `setExternalCollisionMesh`, ...) are
  forwarded in call order and run in the worker before the next step, where inline code would have
  run them. `setSurfaceRoads` / `setSurfaceAreas` are skipped when the same roads/areas are passed
  again (the inline method ignores them in that case too).

## What is not identical

- **Command return values.** Commands whose return value the game shows (HUD messages from
  `interact`, `toggleFlight`, `toggleHitch`/`toggleDock`, `cycleHelmMode`, `recoverVehicle`,
  `transferControls`, `automaticTransmission`, `setEngineMode`, `configurePortal`,
  `adjustTrailerRamp`, `setGarageDoor`) return `undefined` with the worker, so those HUD notices are
  not shown; `liftNearbyBike()` returns `undefined` too ("Levantando la moto" is not shown).
  The effect of the command itself is the same.
- **`preparePlanetCollisions()`** answers with the worker's previous reply (one frame late).
- **Reads right after a command** and before the next step (e.g. the camera yaw alignment in
  `GameRuntime.dispatch('interact')` reading `player.vehicleId`) see the state of the previous
  step. The step that follows applies the command exactly as inline.
- **Command errors** (e.g. `startInVehicle('missing')`) surface on the next `step()` (the frame
  pauses and reports `onError`) instead of throwing at the call site.
- **Query coordinates** can differ by float32 rounding: Rapier renormalises a quaternion when the
  mirror sets a collider rotation, while the stepped world keeps the integrator's slightly
  non-unit one. Hit/miss and the hit entity match; the worst deviation measured in the parity
  test is 4.7e-10 m.
- Not covered by the switch: the XR scaled-vehicle and AR simulations (`xr-scaled-vehicles.ts`,
  `runtime/ar`) keep their own inline `Simulation`; `entityCollisionParts()` (AR only) is not
  mirrored.

## Tests

- `test/simulation/physics-worker-query-parity.test.ts` (vitest, MessageChannel boundary):
  inline vs worker + query world over deterministic scenes (tumbling crates, walking/jumping,
  driving with the occupied body excluded, trimesh add/remove, shot impulses, error reporting).
  Every frame compares all reads exactly and a fan of 96 hitscans, 12 excluded hitscans and 24
  camera clearances.
- `test/browser/e2e/physics-worker-wiring.spec.ts` (Playwright, real Worker, real
  `GameRuntime` frame loop): 180 frames with `physicsWorker` off and on, same input; player state
  and crate poses must match every frame and the camera must not move.

## Measuring main-thread CPU on Nemo

Measure the same scene, spawn and route twice, flag off then on, in the same build:

- off: `http://<host>:10001/?<usual params>`
- on: `http://<host>:10001/?<usual params>&physicsWorker=1`

Close other tabs, plug in the machine and keep the window the same size for both runs.

### 1. Chrome Performance panel

1. Open DevTools → **Performance**. Set CPU throttling to "No throttling".
2. Start in the game, wait for loading to finish (stream idle), then press **Record**.
3. Drive the same 20–30 s route (or stand still for a static baseline), then **Stop**.
4. In **Summary** for the whole range, note **Scripting** and **Rendering** time on the
   **Main** track. With the switch on, a **Worker** track appears with the physics time
   (`serveSimulation` → `step`).
5. In **Bottom-up**, filter for `step` / `World.step` / `raw.step`: inline it sits on Main,
   with the switch on it moves to the Worker; on Main only `QueryWorld.apply`,
   `structuredClone`/message handling and the queries remain.
6. Look at the frames strip: count red (dropped) frames and long tasks (red-cornered tasks
   > 50 ms) in both recordings.

### 2. Long tasks and ms per frame from the console

Paste this in the DevTools console after the game has loaded. It records for 30 s and prints
main-thread numbers. Run it once with the flag off and once with it on.

```js
;(async (seconds = 30) => {
  const frames = [],
    longTasks = [],
    loaf = []
  const observers = []
  const observe = (type, list) => {
    try {
      const o = new PerformanceObserver((l) => list.push(...l.getEntries()))
      o.observe({ type, buffered: false })
      observers.push(o)
    } catch {}
  }
  observe('longtask', longTasks)
  observe('long-animation-frame', loaf) // Chrome 123+
  let last = performance.now()
  const end = last + seconds * 1000
  await new Promise((done) => {
    const tick = (t) => {
      frames.push(t - last)
      last = t
      t < end ? requestAnimationFrame(tick) : done()
    }
    requestAnimationFrame(tick)
  })
  observers.forEach((o) => o.disconnect())
  const q = (a, p) => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * p)]
  const sum = (a) => a.reduce((s, v) => s + v, 0)
  const scriptMs = sum(loaf.flatMap((f) => f.scripts ?? []).map((s) => s.duration))
  console.table({
    frames: frames.length,
    'frame ms p50': q(frames, 0.5).toFixed(2),
    'frame ms p95': q(frames, 0.95).toFixed(2),
    'frame ms p99': q(frames, 0.99).toFixed(2),
    'long tasks': longTasks.length,
    'long task ms total': sum(longTasks.map((t) => t.duration)).toFixed(0),
    'long frames (LoAF)': loaf.length,
    'LoAF blocking ms total': sum(loaf.map((f) => f.blockingDuration ?? 0)).toFixed(0),
    'LoAF script ms per long frame': loaf.length ? (scriptMs / loaf.length).toFixed(2) : '0',
  })
})()
```

- **frame ms p50/p95/p99**: time between rendered frames (lower and steadier is better).
- **long tasks / long task ms**: main-thread tasks over 50 ms (jank).
- **LoAF**: Long Animation Frames, frames over 50 ms; `blockingDuration` is main-thread time
  that blocked input, `scripts` attributes it to functions.

### 3. The in-game physics timing

The game's diagnostics (`onDiagnostics`, the fps readout) report `physicsMs` per frame. Inline it
is the CPU cost of the step on the main thread. With the worker it is the **wait** for the step
(worker time plus messaging), not main-thread CPU, so compare it with the Performance panel
rather than reading it as the same number.

### What to write down

For each run (off / on): Nemo's browser and version, scene and route, frame ms p50/p95/p99,
long tasks count and total ms, LoAF blocking ms, Main-track Scripting ms in the Performance panel
over the recorded range, and the Worker-track time with the switch on.
