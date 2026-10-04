# Code ownership and documentation

The [folder reference index](reference/README.md) lists every `REFERENCE.md` next
to the code. Those pages index every active module and executable function in
`src/` and `game/`, including private methods and callbacks.
They are generated from syntax rather than maintained as a second copy of the code.
Type-only declarations, tests, service backends and vendor/generated files are
outside that reference's scope. Existing architecture documents describe their
separate contracts.

## Dependency direction

Scene and entity data describe authored content. Simulation consumes those
contracts and owns physical state. Rendering presents that state; runtime
coordinates reusable gameplay. Catalog modules supply stock content. The game
and external applications compose public package exports. Engine must never
import Studio. The architecture tests enforce the important dependency edges.

| Area                             | Responsibility                                                     | Ownership boundary                                                |
| -------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `src/entity`, `src/scene`        | Validated entities, scene graph and edit transactions              | Authored documents are not live physics state                     |
| `src/math`                       | Geometry, spherical coordinates and pose conversion                | Coordinates and frames must be explicit                           |
| `src/simulation`                 | Physics steps, player actions and vehicle behavior                 | One simulation owns its physical world                            |
| `src/render`, `src/presentation` | Scene views, planetary tiles, materials, monitors and effects      | Dispose owned GPU resources; do not dispose borrowed host objects |
| `src/runtime`                    | Play lifecycle, controls, cameras and shared browser orchestration | Hosts retain editor UI, persistence and external permissions      |
| `src/catalog`                    | Vehicle, weapon and instrument recipes                             | Recipes do not become simulation implementations                  |
| `src/planet`                     | Geographic source contracts and world assembly                     | Preserve planetary frames even in offline examples                |
| `src/viewer`                     | Geographic viewing API used by Atlas                               | Viewing does not imply driving/physics acceptance                 |
| `src/examples`, `game`           | Reproducible content and a package consumer                        | Examples use the same Engine contracts as applications            |

## Runtime contracts

`PlaySession` owns physics and copied scene data, including cancellation of late
initialization. `GameRuntime` in `/runtime` coordinates input, local portal events
and cameras. `GameRuntime` in `/runtime/browser` additionally owns the browser
renderer, event listeners, audio, monitors and scheduling. These are different
composition levels, despite sharing a class name.

Simulation intervals are seconds; animation timestamps and streaming cadence are
milliseconds. Distances are metres, local coordinates use Y-up and forward -Z,
and gameplay yaw is radians. Geographic latitude/longitude are degrees. Convert
frames with the geographic pose helpers rather than adding world positions by
hand. Clock APIs accepting wall time document that separately.

`stop` permits replay; `dispose` is terminal for session/browser owners. Release
held inputs on focus loss and pause. Do not schedule an automatic frame loop and
manual ticks simultaneously. Terrain availability is explicit: unavailable
ground is not a licence to substitute a flat plane. Remote portal windows do not
start a second remote physics world or support physical cross-location travel.

## Writing and checking documentation

Write developer documentation and source contract comments in English. Keep
operator-facing UI text in its existing language. Explain purpose, accepted
units/frames, mutation, ownership, cancellation and exceptional cases when those
are relevant; do not add comments that merely repeat a function's name.

Place behavioral contracts in JSDoc next to the implementation. The generated
reference includes those notes, authored signatures, source links, direct call
sites and explicit throws. It does not infer purity or promise that errors from
transitive callees are exhaustively listed. Inferred return types remain labelled
as inferred rather than inventing a contract.

After editing production code, run `npm run docs:generate`. CI uses
`npm run docs:check` to reject stale signatures, source links or removed modules,
and `npm run docs:links` to reject broken relative documentation links.
Generated `REFERENCE.md` pages are excluded from Prettier; their generator owns formatting.
Use ordinary formatting and the existing type/unit/browser checks for code.

Consolidate repeated imports without changing module evaluation order. Preserve
side-effect imports and keep type-only groups separate. Keep future refactors
small enough that documentation and behavior changes can be reviewed separately.

See the [topic-based configuration guide](../src/config/README.md) for defaults, units and application overrides.

See [simulation subsystem ownership](../src/simulation/README.md) for internal boundaries and
the [measured performance review](architecture/performance-review-2026-10-04.md) for current results.
