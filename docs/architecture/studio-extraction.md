# Studio extraction — issue #78

Nabla remains a planetary engine. A viewport without cartographic data still has a
planetary origin, geographic coordinates and altitude. Offline examples provide
local planetary data; they do not introduce a separate coordinate system.

The current implementation is the first extraction increment, not the completion
of #78. Studio is still in this repository. Preserve its gameplay while moving
ownership into Engine; moving the application directory alone is insufficient.

## Implemented boundary

| Capability                                                             | Engine owner                                 | Consumers               |
| ---------------------------------------------------------------------- | -------------------------------------------- | ----------------------- |
| Simulation lifetime, scene snapshot, play/pause/resume/stop            | `runtime/session.ts`                         | Studio and game         |
| Gameplay coordination, boarding, camera actions and portal transitions | `runtime/game.ts`                            | Studio and browser game |
| Lost-key release and focus reset policy                                | `runtime/held-keys.ts` and `runtime/game.ts` | Studio and browser game |
| Single animation scheduler                                             | `runtime/frame-loop.ts`                      | Studio and game         |
| Cockpit, chase, first-person and overhead camera calculation           | `runtime/game-camera.ts`                     | Studio and game         |
| Keyboard steering, gamepad axes, touch input mixing                    | `runtime/input.ts`                           | Studio and game         |
| Turbine, propeller, powertrain and tire audio orchestration            | `runtime/vehicle-effects.ts`                 | Studio and game         |
| Tire smoke and marks orchestration                                     | `runtime/vehicle-effects.ts`                 | Studio and game         |
| Standalone browser composition and scoped browser input                | `runtime/browser.ts`                         | Game                    |
| Planetary sky, lighting and sea                                        | `render/planet/world-environment.ts`         | Studio, viewer and game |
| Small reproducible planetary test dataset                              | `examples/flat-tile.ts` and published GLBs   | Package consumers       |

`game/` now imports only public package entries. It owns URL configuration, its
loading display and HUD. It no longer owns physics, cameras or a render loop.
The browser package supplies stock preset data as ordinary ESM and resolves emitted
worker JavaScript. A consumer must serve the package's `assets/` directory; the
current `/studio/` asset URL prefix is historical and does not require Studio code.

The standalone browser runtime is an incremental composition, not a claim of full
Studio parity. Studio already uses the shared components but retains the following
coordination, which must be extracted before the editor can move.

Touch driving controls (including styles, cancellation and disposal) now live in
`runtime/touch-driving.ts`. Studio and the browser game use the same component.
The browser host defaults to coarse-pointer detection and accepts `touchControls`
('auto', 'always', 'hidden', or false). It owns focus/audio; the component owns
multi-pointer state. Stopping or pausing the game disables its commands.

`GameRuntime.streaming` owns the 500 ms terrain update cadence, velocity sampling
and support positions beneath live vehicles and portal endpoints. Both game hosts
use it. Studio's orbit-camera streaming stays with the editor. New play sessions
reset prediction instead of inheriting an editor or previous-game position.

## Remaining parity inventory

| Capability                                                      | Current owner                                    | Next extraction / acceptance                                     |
| --------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| Time/tides, field lights and performance options                | `studio/main.ts`, `studio/performance.ts`        | Reusable settings and runtime systems; host persists preferences |
| Cross-location portal registry                                  | `studio/project.ts`, `studio/portal-registry.ts` | Runtime world-content contract distinct from editor document     |
| Editor tools, history, selection, inspector and project storage | `studio/`                                        | Remain in the Studio application                                 |
| Remaining direct source imports                                 | `studio/`                                        | Deliberate public API, then test Studio against a packed package |
| Atlas host integration                                          | separate application                             | Validate current viewer against the same package version         |
| Final project extraction                                        | pending                                          | Move Studio only after the parity matrix is complete             |

The existing local geographic viewer changes were preserved in the isolated
checkout and are a dependency of this increment. No truck branch was merged.
`codex/white-truck-studio` at `1cca41f` is the asset/prototype reference: its descriptor
explicitly says it is not a stock drivable preset and needs an adapter. The broader
`cursor/truck-vehicle-system-e56f` branch also changes physics, transmission and map
loading; do not merge those changes as part of Studio extraction. Integrate truck
content separately against the established engine contracts.

## Shared Play coordinator

Studio's Play action now starts `GameRuntime` from the public `/runtime` entry.
The `/runtime/browser` composition uses the same coordinator internally. Both
hosts delegate input mixing, simulation steps, vehicle actions, boarding camera
transitions, camera cycling and portal yaw to it. Jump requests survive render
frames that do not advance a physics tick. Focus release clears commands and
pending jumps through the same method.

Studio still owns its existing renderer, editor camera bindings and surrounding
UI. Its camera push/pull bridge preserves those bindings during migration;
this is not yet the complete browser composition. The development alias and
TypeScript path for `/runtime` keep source types in one module graph while other
Studio imports still reference source. The independent game consumer continues
to run against the packed package without that alias.

The truck and six-wheel trailer models from `1cca41f` now run in Engine's shared
world; the broad truck branch remains unmerged. Car GPS and ship HUD updates are
available in the browser runtime. `VehicleMonitors` now owns CSS3D portal and
container panels, styles, native buttons and held touch commands. Its lifetime
restores canvas state and removes listeners/DOM on disposal. Equipment menu
actions are shared through `vehicleMenuKey`, with persistence delegated to hosts.
Studio retains a compatibility re-export, not a second implementation.

## Verification

- TypeScript checks include `game/`; incompatible API calls cannot hide behind a
  transpilation-only Vite build.
- Session tests cover authored-scene isolation, cancellation, separate worlds,
  restart and pause; camera tests require no editor DOM.
- Shared GameRuntime tests cover boarding, camera transitions, input cancellation,
  queued jumps and restoring authored vehicle positions on replay.
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

`scripts/vehicle-monitors-smoke.mjs` verifies native container buttons, flight,
keyboard focus, camera visibility and the car equipment menu in the packed demo.

`scripts/vehicle-monitors-lifetime-smoke.mjs` uses the Studio Vite server to check
rebuild/disposal without duplicates and restoration of host canvas styles.

`scripts/touch-driving-smoke.mjs` checks simultaneous real touch pointers,
independent release, cancellation, blur, disable/dispose, and acceleration/braking
in the packed game. Streaming unit tests verify live support positions, cadence,
copy isolation and resets between worlds/clocks.

## Shared shooting and gallery

`runtime/sidearm.ts` owns the viewmodel, reticle, cadence and asset lifetime.
`runtime/shooting.ts` owns third-person aim correction; `runtime/gallery.ts`
handles portal ray transport, impacts, targets, score and respawn. The sample
scene factory lives separately in `examples/gallery.ts`. Studio keeps only
compatibility exports and its UI event bindings. The browser game uses the same
system: Tab draws/holsters on foot, click fires, N resets gallery scoring.
Boarding hides the weapon and suppresses firing.

Portal obstruction, range and oblique-ray tests now live in `test/runtime/`.
`scripts/shooting-smoke.mjs` checks the packed weapon asset and the draw/fire/
holster/board flow. The standalone game now also renders local portal-window views
through the shared render pipeline. Cross-location content resolution remains
a host concern pending the world-content contract.

Weapon lifetime checks in scripts/weapon-lifetime-smoke.mjs cover cadence, disposal during asset loading and renderer-state restoration after a failed draw.

## Shared render passes

`GameRenderPipeline` owns the ordered mirror, portal, sky, shadow, CSS3D aperture
and depth-of-field passes. Both Studio and the browser game call it; Studio
supplies editor overlay exclusions, layer visibility and external portal views.
The browser runtime accepts optional `depthOfField`. Alpha survives postprocessing
so native instrument screens remain visible. Resources and host renderer state
are restored on disposal/failure. Planet/environment preparation, editor photo
export and external-world resolution remain separate consumers or host bindings.

The optional demo URL `?example=flat&gallery=1` shows a local portal gallery;
append `&dof=1` to check postprocessing. The ordinary driving example is unchanged.
`scripts/render-pipeline-smoke.mjs` verifies actual portal draws and screenshots
with/without DOF. Unit tests cover render ordering and failure-state restoration.

Studio's gallery E2E now uses the visible F8 play shortcut and verifies a target hit through the portal plus score reset against the shared pipeline.
