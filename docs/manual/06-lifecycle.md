# 6. Lifecycle and execution

[Manual contents](README.md)

`PlaySession` exposes `stopped`, `loading`, `playing`, `paused`, and `disposed`
states. `play(document, options)` stops the previous session, clones the authored
document, initializes physics, and constructs a simulation. A generation counter
prevents a late asynchronous initialization from reviving a cancelled session.

When worker physics is requested, initialization attempts `ThreadedSimulation`.
Failure falls back to inline simulation unless initialization has been cancelled.
`vehicleId` requests an initial vehicle; initialization refreshes worker state
before returning the owned simulation. A host should inspect actual mode rather
than equating a requested option with successful worker use.

The generation is checked again after the initial worker snapshot refresh, before
publishing the simulation. If `stop()`, `dispose()` or a newer `play()` intervenes,
a late successful reply rejects the old play with `Play session cancelled` and
releases its unpublished simulation exactly once. A late failure retains its original
error and cannot overwrite the newer session's state or trigger an inline fallback.
This invalidates startup ownership; it does not force an unresolved worker request
to settle immediately. Cleanup happens when that request settles.

Regression coverage: `test/runtime/session-startup-cancellation.test.ts` and
`test/browser/e2e/session-startup-cancellation.spec.ts` (real worker synchronization).

## Stepping and stopping

`step(elapsed, input, waterLevel)` accepts elapsed **seconds**, rejects negative or
non-finite durations, installs input, and advances only while playing. It caps the
submitted duration using `simulationDefaults.maxFrameSeconds`. Worker execution
uses its own advance path; the browser renders pipelined snapshots rather than
waiting synchronously for each physics tick.

`pause()` clears held movement and suspends stepping. Paused time is not accumulated
for a later catch-up burst. `resume()` resumes a paused session. `stop()` cancels
initialization and disposes physics but permits another play. `dispose()` is terminal
and repeatable. Treat `play()` rejection as a real failure, and dispose resources
created by the host when abandoning a mount.

The [session example](../../examples/manual/session.mjs) demonstrates these transitions
without browser scheduling. It deliberately selects inline physics for reproducible
Node execution; that is not a recommendation to disable workers in the game.

## Browser startup

`BrowserGameRuntime` validates the scene, planetary coordinates, canvas parent, backend
canvas identity, tile base, cloneable world content and camera/display/FSR options
before acquiring render resources or installing instance listeners. Invalid options
throw synchronously; the host does not receive an instance to dispose.

Construction then records each acquired resource in an internal rollback scope.
If a later setup step throws, it marks the incomplete runtime disposed, aborts its
listeners and releases completed owners in reverse acquisition order. Cleanup
continues even if a disposer throws, preserving the original construction error.
Canvas attributes changed during setup are restored. An accepted renderer, including
an injected backend, belongs to the runtime and is disposed on subsequent setup
failure; a backend rejected during preflight remains the host's responsibility.

Successful construction transfers ownership to normal `dispose()` cleanup. Shared
styles and asset caches retain their existing shared lifetime; rollback releases
instance owners and registrations without removing another runtime's resources.
Resource constructors must clean up their own partial allocations if they throw
before returning an owner. Keep new acquisitions next to their rollback registration
in `src/runtime/browser.ts`, and add their normal release to runtime teardown too.

Regression coverage: `test/runtime/construction.test.ts` and
`test/browser/e2e/construction.spec.ts`, including early validation, failures before
and after renderer creation, failing disposers, listener/DOM restoration and a
surviving runtime.

The reference host resolves a source, creates the document and browser runtime,
waits for usable ground where applicable, starts physics, prepares presentation,
and reveals gameplay. Preparation can include vehicle assets, audio resources,
terrain presentation, shaders, textures, and starting camera views. Host credits
or an ENTER gate may intentionally delay reveal.

`onProgress(status, loadedTiles)` reports different kinds of work. A status without
a tile list must not be replaced with a stale tile count. The loading milestones
are progress through known phases, not a universal download percentage or ETA.

`clock: 'automatic'` gives the browser runtime scheduling ownership. A host using
manual clock integration must inspect the current stepping contract and keep one
owner for advancement. Never step both `PlaySession` and its simulation separately.

## Source of truth

- [Session implementation](../../src/runtime/session.ts).
- [Threaded simulation](../../src/simulation/threaded-simulation.ts).
- [Browser lifecycle](../../src/runtime/browser.ts).
- [Reference loading UI](../../game/loading.ts) and [startup guide](../game-runtime.md).
