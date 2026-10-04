# Runtime

Play lifecycle, controls, cameras and shared browser orchestration.

**Owns:** `PlaySession`, shared `GameRuntime`, browser composition, input mixing,
vehicle monitors, field lights, water clock, streaming cadence.
**Does not own:** editor UI, persistence, or external permissions.

`/runtime/session` is headless. `/runtime` coordinates cameras and gameplay.
`/runtime/browser` adds the renderer, listeners, audio and scheduling. Those are
different composition levels; they share a class name.

`stop` permits replay; `dispose` is terminal. Do not schedule an automatic frame
loop and manual ticks simultaneously.

- Game host: [`game/`](../../game/README.md)
- Config: [`src/config`](../config/README.md)
- Tests: `test/runtime`
