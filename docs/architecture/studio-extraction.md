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
| Editor tools, history, selection, inspector and project storage | `studio/`                                        | Remain in the Studio application                                 |
| Historical tests importing Engine internals                      | `studio/test`, `studio/e2e`                       | Separate Engine implementation tests from portable Studio tests |
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
this is not yet the complete browser composition. Studio application code now
uses package exports without Vite aliases or TypeScript source paths. Both the
independent Studio and game consumers run against an installed package.

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
through the shared render pipeline. Cross-location windows use the shared
world-content contract described below; hosts retain loading and persistence.

Weapon lifetime checks in scripts/weapon-lifetime-smoke.mjs cover cadence, disposal during asset loading and renderer-state restoration after a failed draw.

## Shared render passes

`GameRenderPipeline` owns the ordered mirror, portal, sky, shadow, CSS3D aperture
and depth-of-field passes. Both Studio and the browser game call it; Studio
supplies editor overlay exclusions, layer visibility and external portal views.
The browser runtime accepts optional `depthOfField`. Alpha survives postprocessing
so native instrument screens remain visible. Resources and host renderer state
are restored on disposal/failure. Planet/environment preparation, editor photo
export remain separate consumers or host bindings. External-world resolution now
uses the shared world-content contract.

The optional demo URL `?example=flat&gallery=1` shows a local portal gallery;
append `&dof=1` to check postprocessing. The ordinary driving example is unchanged.
`scripts/render-pipeline-smoke.mjs` verifies actual portal draws and screenshots
with/without DOF. Unit tests cover render ordering and failure-state restoration.

Studio's gallery E2E now uses the visible F8 play shortcut and verifies a target hit through the portal plus score reset against the shared pipeline.

## Shared quality and water settings

Engine now owns performance presets, validation and streaming budgets in
`runtime/performance.ts`. Studio retains only localStorage/device preference
selection. Browser hosts pass `performance` (a named preset plus optional overrides)
to configure resolution, shadows, mirrors, culling, terrain budgets and collisions.
The flat demo accepts `quality=mobile`/`low`/`balanced`/`high`/`ultra` for checks;
without it, its existing high-quality shadows remain enabled.

`worldWater` resolves manual sea level or the existing approximate tide using the
scene clock. Both Studio and the browser game use it for consistent water levels;
the flat fixture explicitly fixes sea level at zero. Editor time-preview controls
and preference persistence remain host UI. Field-light coordination is now shared through `FieldLighting`.

## Shared field lighting

`FieldLighting` coordinates geographic light placement, floating-origin offsets,
navigation activation and pole collisions for both Studio and browser games.
`FieldLights` owns per-instance layer/look settings and an injectable async data
source; changing worlds, unloading tiles or disposal cancels pending work and
ignores stale results. Geometry/materials and instance buffers are released.
Ground placement retries while terrain is unavailable, and lamp posts now join
buoy/post collision shapes instead of being visual-only.

Studio uses the existing cached OSM provider. Browser games opt in through
`fieldLights`; leaving it unset introduces no light-data network requests. The
optional flat demo `?example=flat&lights=1` bundles two lamps and a fixed night
clock. Unit tests cover isolation, late-result rejection, grounding, collision
handoff and tile unloading; `scripts/field-lights-smoke.mjs` verifies that the
packaged night example renders/drives with no external requests.

## Shared cross-location windows

`WorldContent` describes locations, registered objects and portal connections
without editor history or storage. Engine owns stable portal identifiers,
immutable connection edits and visible-window destination resolution. Studio
retains a compatibility export and supplies its project through this contract;
existing saved identifiers and connections are preserved.

Browser hosts pass `world` to the runtime alongside the active `scene`.
`RemotePortalViews` prepares destination scenes in their own geographic frames,
with at most two cached destinations, and releases them when play stops. The
browser composition supplies its configured tile provider instead of implicitly
requesting remote map services. These connections remain visual windows only:
physical travel and remote gameplay simulation are not implemented.

The optional `?example=flat&remote=1` demo places the gallery in another location.
`scripts/world-portals-smoke.mjs` verifies actual destination rendering from the
installed package with no external requests. Runtime tests cover stable IDs,
invalid ancestry, immutable edits and destination filtering; Studio tests retain
coverage of project persistence and renamed locations.

The historical portal-registry UI E2E still clicks the hidden legacy
`#portal-registry-button` and times out in the current desktop shell. That UI
journey is not verified by this increment; the packed-window smoke, registry
unit tests and current-shell Studio play smoke pass independently.
Its separate renderer test also fails before exercising rendering because it
constructs an invalid Windows Vite URL (`/@fsC:/...`). Both legacy E2E failures
remain recorded rather than being reported as passing coverage.

## Studio package boundary

All 55 application source/HTML files now use public Engine entries. The explicit
`/render` entry exposes the viewport services needed by editor hosts; it does not
grant wildcard access to Engine internals. Existing core exports cover scene
editing, planetary poses and catalog operations. The NBZ1 prepared-tile codec is
owned by `/scene`, with the preparation service retaining a compatibility export.

`scripts/check-studio-boundary.mjs` rejects application imports from Engine source
or services and rejects source aliases. Historical Engine implementation tests
inside Studio's test directories are deliberately outside this application check.

Reproduce the independent check by building Engine, packing it to a sibling
`engine-studio-test.tgz`, then running `node scripts/prepare-studio-consumer.mjs`.
An alternative sibling archive path can be passed as its first argument. Install
dependencies in the generated sibling `studio-consumer`, run its `typecheck` and
`build` scripts, and serve its production output. No Engine source is copied;
assets and worker modules come from the installed Engine archive. Run
`scripts/studio-runtime-smoke.mjs` with `NABLA_STUDIO_URL` pointing to that server
and `?scene=circuit` to verify play, boarding, cameras, driving and restart.

This validates the application package boundary. Moving Studio to its final
repository, splitting historical tests/CI and validating Atlas remain separate
steps; it does not establish parity for every old editor E2E journey.
