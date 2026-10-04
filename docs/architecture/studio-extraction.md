# Studio extraction — issue #78

Nabla remains a planetary engine. A viewport without cartographic data still has a
planetary origin, geographic coordinates and altitude. Offline examples provide
local planetary data; they do not introduce a separate coordinate system.

The current implementation is the first extraction increment, not the completion
of #78. Studio is still in this repository. Preserve its gameplay while moving
ownership into Engine; moving the application directory alone is insufficient.

## Implemented boundary

| Capability                                                   | Engine owner                               | Consumers               |
| ------------------------------------------------------------ | ------------------------------------------ | ----------------------- |
| Simulation lifetime, scene snapshot, play/pause/resume/stop  | `runtime/session.ts`                       | Studio and game         |
| Single animation scheduler                                   | `runtime/frame-loop.ts`                    | Studio and game         |
| Cockpit, chase, first-person and overhead camera calculation | `runtime/game-camera.ts`                   | Studio and game         |
| Keyboard steering, gamepad axes, touch input mixing          | `runtime/input.ts`                         | Studio and game         |
| Turbine, propeller, powertrain and tire audio orchestration  | `runtime/vehicle-effects.ts`               | Studio and game         |
| Tire smoke and marks orchestration                           | `runtime/vehicle-effects.ts`               | Studio and game         |
| Standalone browser composition and scoped browser input      | `runtime/browser.ts`                       | Game                    |
| Planetary sky, lighting and sea                              | `render/planet/world-environment.ts`       | Studio, viewer and game |
| Small reproducible planetary test dataset                    | `examples/flat-tile.ts` and published GLBs | Package consumers       |

`game/` now imports only public package entries. It owns URL configuration, its
loading display and HUD. It no longer owns physics, cameras or a render loop.
The browser package supplies stock preset data as ordinary ESM and resolves emitted
worker JavaScript. A consumer must serve the package's `assets/` directory; the
current `/studio/` asset URL prefix is historical and does not require Studio code.

The standalone browser runtime is an incremental composition, not a claim of full
Studio parity. Studio already uses the shared components but retains the following
coordination, which must be extracted before the editor can move.

## Remaining parity inventory

| Capability                                                      | Current owner                                    | Next extraction / acceptance                                                 |
| --------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------- |
| Boarding camera transition, portal yaw, vehicle input actions   | `studio/main.ts`                                 | One shared player controller; preserve entrance and local-frame transitions  |
| Complete render pipeline, mirrors, portal windows and DOF       | `studio/main.ts`                                 | Shared renderer with explicit editor overlay hooks                           |
| Ship/portal tablets, GPS and equipment menus                    | `studio/portal-controls.ts` and `studio/main.ts` | Engine browser UI components with host callbacks and disposal                |
| Touch controls and their styling/lifetime                       | `studio/touch-driving.ts`                        | Public optional controls with cancellation and teardown                      |
| Weapon viewmodel, shot routing and gallery                      | `studio/sidearm.ts`, `studio/gallery.ts`         | Engine systems plus explicit example rules/content                           |
| Streaming prediction and protected vehicle positions            | `studio/main.ts`                                 | Shared streaming coordinator; maintain current budgets and collision support |
| Time/tides, field lights and performance options                | `studio/main.ts`, `studio/performance.ts`        | Reusable settings and runtime systems; host persists preferences             |
| Cross-location portal registry                                  | `studio/project.ts`, `studio/portal-registry.ts` | Runtime world-content contract distinct from editor document                 |
| Editor tools, history, selection, inspector and project storage | `studio/`                                        | Remain in the Studio application                                             |
| Remaining direct source imports                                 | `studio/`                                        | Deliberate public API, then test Studio against a packed package             |
| Atlas host integration                                          | separate application                             | Validate current viewer against the same package version                     |
| Final project extraction                                        | pending                                          | Move Studio only after the parity matrix is complete                         |

The existing local geographic viewer changes were preserved in the isolated
checkout and are a dependency of this increment. No truck branch was merged.
`codex/white-truck-studio` at `1cca41f` is the asset/prototype reference: its descriptor
explicitly says it is not a stock drivable preset and needs an adapter. The broader
`cursor/truck-vehicle-system-e56f` branch also changes physics, transmission and map
loading; do not merge those changes as part of Studio extraction. Integrate truck
content separately against the established engine contracts.

## Verification

- TypeScript checks include `game/`; incompatible API calls cannot hide behind a
  transpilation-only Vite build.
- Session tests cover authored-scene isolation, cancellation, separate worlds,
  restart and pause; camera tests require no editor DOM.
- Fixture tests validate hashes, spherical altitude, collision geometry and the
  four coincident corners at `(0,0)`.
- `scripts/runtime-smoke.mjs` runs the flat example, checks all four tiles, drives,
  cycles cameras and rejects external requests, HTTP failures and browser errors.
- `scripts/studio-runtime-smoke.mjs` exercises Studio through its current F8
  shortcut: play, board, cycle cameras, drive, stop and restart.
- Verify `npm run build`, type checks, unit tests and both application builds, then
  install `npm pack` output in a sibling consumer with only Engine and Vite.
  Build and run that consumer with the same browser smoke test. A nested directory
  inside Engine is insufficient because ancestor dependencies can mask omissions.

The older `studio/e2e/cameras.spec.ts` still clicks the hidden legacy `#play`
button. Its current-shell replacement above tests the runtime through the exposed
shortcut. This is not evidence that the complete historical E2E suite passes.
