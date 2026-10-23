# Reference game startup and host integration

This guide describes the active 0.3.x browser host. The reference game and Euskadi use the same
runtime; their boot presentation and authored content differ.

## Ownership

Engine src/ owns reusable scene data, simulation, rendering and lifecycle. game/ owns the browser
entry, source selection, loading screen, menus and UI binding. Euskadi owns its demo coordinates,
parked fleet, pickup coordinates, signs, scenarios, multiplayer rooms, music and branding.

Do not copy Euskadi's defaults into Engine to reproduce its look. Register game hooks before the
page entry: setTerrainHost in game/terrain-host.ts and setDriveHost in game/drive-host.ts. Configure
shared boot behavior with window.NABLA_BOOT (game/boot.ts), and reusable engine settings through
src/config/. TerrainHost.weaponPickupLocation is optional; an unconfigured host has no fixed
Euskadi pickup coordinates.

Euskadi currently consumes an entire Engine checkout plus its overlays, rather than only a
published npm dependency. Its Vite config imports the base game config. Build and Compose overlay
lists must include every imported host module; copying only the four original host files is
insufficient for newer hooks, translations, inventory and scenarios.

## Entries

| Entry                                          | Content                                               | Network                           |
| ---------------------------------------------- | ----------------------------------------------------- | --------------------------------- |
| /?example=flat                                 | Local plane and reference fleet; no cell loading      | Bundled assets                    |
| /test.html                                     | Local test floor and fleet                            | Bundled assets; no terrain stream |
| /?terrain=/tiles&tile=16223/11997&relief=lidar | Published Atlas terrain                               | Same-origin /tiles proxy          |
| /headset.html                                  | Selector for the shared VR/AR applications            | Depends on selected world         |
| Euskadi /                                      | Host-configured real terrain, fleet, splash and menus | Atlas plus optional room relay    |

## Startup sequence

1. game/main.ts resolves the terrain source through entry.ts; explicit sources win over a remembered choice.
2. drive.ts or terrain-main.ts creates the document and GameRuntime, mounts optional host hooks and starts the boot phase.
3. play() streams usable ground before starting the simulation. The terrain page requests the four nearby startup cells; the wider radius opens after reveal.
4. PlaySession starts physics, normally in a worker, and waits for its initial state.
5. prepareReveal loads audio, vehicles and weapons, runs beforeReveal tasks, prepares terrain presentation, compiles GPU programs, uploads textures and warms camera views.
6. Reveal gates finish, gameplay frames start, the loading screen hides and the rest of the world streams.

A host may defer GPU preparation until ENTER, hold reveal for credits, or author an opening camera
sequence. These gates intentionally add time. Zero cells before any ground request, and unchanged
cell counters during GPU preparation, are not sufficient evidence of a streaming failure.

## Threads and GPU work

Physics uses ThreadedSimulation by default; unavailable worker initialization falls back inline.
Use ?physicsWorker=0 for a diagnostic comparison. GameRuntime.physicsThread reports the actual
mode after play. Render frames use pipelined worker snapshots; hosts must not add another physics
loop or await every worker step in the animation loop.

Atlas package loading, photo work and cluster preparation also use module workers by default.
?loadingWorkers=0 is a diagnostic comparison. WebGL remains the renderer default;
?renderer=webgpu or auto opts into the alternate backend with fallback. Workers do not eliminate
main-thread scene installation, shader compilation, GPU texture uploads or host-authored delays.

## Loading screen contract

onProgress(status, loadedTiles) reports terrain work when loadedTiles is present. Physics and
preparation messages have no tile list and must retain their own status, rather than being
replaced by cell counters. Streaming failures remain visible with their diagnostics.

prepareReveal publishes nabla-load-step events with the current data-loading-detail and
completed data-reveal-progress milestones on the game canvas. LoadingScreen.bindRuntime consumes
these events in both reference entries, just as Euskadi's intro observes them. The bar follows
known terrain progress first and reveal milestones afterwards; it is not a download percentage
or an ETA. Listeners are detached when the splash hides or the page exits.

The drive entry binds sound, lighting and exhaust settings, and forwards host music configuration,
as the terrain entry does. Flat-floor and model hosts do not claim pending geographic cells.

## Reproduce a slow start

Run a fresh page and record whether it is a development or production build, cold/warm HTTP and
IndexedDB cache, renderer, quality preset and scene. Use ?diagnostics=1 and ?perfLog=1 for the
existing game diagnostics; the runtime is exposed as window.nablaRuntime only when diagnostics
is requested. Inspect the canvas loadingStage, loadingDetail and revealStage, and console boot
milestones. For per-second runtime measurements use ?performanceLog=1.

Distinguish terrain network/download/decode, physics initialization, host fleet placement and
GPU warmup. Compare the same scene and quality when toggling workers. A test floor, local model
example and Euskadi's real-terrain fleet are different workloads. Do not infer a startup speedup
from a corrected status label or functional tests. Compare a static production build as well:
Vite's first dependency optimization and module transforms add development-only work.

## Local Euskadi

Read the current Euskadi README, GAME.md and ENGINE_REF. Keep its Engine checkout separate from
the clean Engine development checkout, overlay all host modules/resources, install dependencies,
generate rigs, build Engine, pack assets and serve vite.euskadi.config.ts on port 8707.

On Windows, Vite filesystem URLs must be /@fs/C:/... rather than /@fsC:/.... Normalize slashes
when emitting inline imports and host script URLs. Keep /tiles on the same origin, and use a
valid secure origin for a remote headset. The room relay is a separate optional service; the
Euskadi development default is ws://localhost:8787.

## Explicit local worlds

Use /?example=flat for a box floor, /?model=/examples/flat-world.glb for an authored GLB, or /?terrain=/tiles&tile=16223/11997 for streaming. Local sources do not create PlanetWorld, query cell manifests, bind the terrain cache or mount the cell map. Scene geography still controls the sky independently of the collision floor.

A GLB uses metres and Y-up, with its walkable start around local (0,0). Its world-space triangles are installed in the existing simulation before reveal. A registered DriveHost remains responsible for its own model lifecycle (Euskadi scenarios keep their existing loader).

Startup telemetry is available as data-boot-timings on the canvas. Camera shader/effect warmup is reused only when the visible light/shadow topology, renderer shadow mode and environment are unchanged; each camera pose still renders before reveal. No worker or vehicle feature is disabled.

## Console startup timeline

Startup always logs `[nabla-boot #N] INICIO/FIN` with phase duration and elapsed navigation time in milliseconds. Filter the browser console by `nabla-boot`. A final console.table lists phases in start order, including nested worker initialization, host gates/content, each GPU preparation step, collision settling and UI mounting. Overlapping phases are wall time and must not be added together. An INICIO without FIN identifies work still pending (or interrupted). The initial modules span covers navigation up to main.ts execution, including module fetch/evaluation; it is not pure CPU time.

The final console summary groups startup responsibilities and exposes each group as a collapsed table. Parent spans (host import/play scope) live in Contenedores, excluded from the group summary. The measured group duration is the union of completed intervals, so nested work is not counted twice. Different groups can overlap; the collapsed Cronología completa table preserves exact start order independently of logical grouping.

## GPU warmup output variants

Offscreen warmup must select its render target **before** compileAsync. The target's color space changes the shader program (output encoding and tone mapping). Compiling for the canvas and then drawing into an untagged linear target can synchronously compile another set of world programs.

warmEffectPresentation accepts the actual output color space. The browser runtime selects linear output for FSR, depth of field and tunnel preparation; otherwise it uses the renderer's canvas output. Sidearm warmup uses the same output encoding as its screen pass. All effect pools, camera poses, shadows and worker behavior remain enabled. The target and shadow update flags are restored on failure.

## Shared startup for branded games

The maintained game pages both call `startGame` in `game/boot.ts`. It starts attract and the
advisory machine probe, runs optional local-world preparation, then awaits the public
`GameRuntime.play()` lifecycle. The probe stays parallel; the runtime owns the remaining wait.
There is no separate Euskadi physics/GPU startup. Euskadi imports the same game entry through
`vite.game.config.ts` and registers configuration and hooks before that entry runs.

To create another branded game, reuse these pages and configure `window.NABLA_BOOT` (splash,
music, start cameras, preloaded vehicles), `setPageQuery`, and `setTerrainHost`/`setDriveHost`.
Register runtime hooks before launch. Preparation/reveal gates and `beforeReveal` can pace an
intro or install content without replacing the common worker, GPU or collision preparation.
A custom application consuming only the package calls the public `GameRuntime.play()` directly;
`game/boot.ts` is the reference game composition, not a published package export.

Console descriptions describe operations independently of the translated or branded splash.
For example, camera `map` means drawing the overhead view, not downloading geographic cells.
Only streamed terrain emits the area-cell preparation step. GPU steps distinguish shader
compilation, texture upload, camera renders, mirrors, effects and weapon lighting. The final
ready notification ends before intro/reveal waits, so those waits belong to the host group,
not to GPU time. Group numbers organize responsibilities; step numbers give actual start order.

Local changes must also be rebuilt in the host's Engine checkout. A published host pinned by
`ENGINE_REF` will receive them only after that ref is updated to a released commit containing
these changes; changing the brand does not automatically update a pinned dependency.

## Reference game HUD

`game/hud-layout.ts` mounts the existing action controls in shared corner groups: ADD, CAM
(eye icon), FOV, quality and clock across the top right; interaction/weapon actions at the bottom
right. It moves the controls without recreating their listeners or popovers. Runtime interaction
help sits at the top left and game messages at the top right. The dashboard page hides the large
vehicle/camera/speed readout; instruments remain available in the vehicle. Engine defaults to
English; branded hosts retain their locale catalogs and presentation hooks.

## Runtime decomposition plan (2026-10-24)

The settings extraction is complete for independent runtime-owned preference state.
Small public delegates to existing audio, calibration, XR and world owners should remain
small delegates. `GameRuntime` remains the public facade and composition root.
See [interface ownership](manual/20-interface.md) for current settings owners.

Each row below is one implementation topic and one independently validated commit, in
this order. Include its regression tests and documentation in the same commit. Do not
mix a new extraction into the previous topic or publish intermediate failing states.
If a topic cannot be reviewed and validated independently, revise this plan before
expanding its scope. These are planned boundaries, not promises to create one class per row.

| Order | Topic / proposed commit                               | Scope                                                                                                                                                   | Required focused evidence                                                                                                                             |
| ----- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `Extract runtime input routing`                       | Bind/unbind keyboard, pointer, touch and controller events; focus and held-input release. Reuse pointer capture. Leave action execution in the runtime. | Real keyboard routing; lost focus/visibility and disposal; no duplicate listeners; two runtimes; pointer-capture unit tests.                          |
| 2     | `Extract runtime action dispatch`                     | Map normalized actions to existing game, camera, vehicle and weapon operations; retain asynchronous action guards.                                      | Vehicle/on-foot contexts; weapon/UI priority; repeated actions during pending vehicle entry; unchanged host messages and Relay confirmation behavior. |
| 3     | `Extract runtime preparation and reveal coordination` | Preparation queues, host gates, progress and reveal ordering. Keep terrain/model services and GPU work with their owners.                               | Abort during preparation, rejected gates, missing terrain, restart after failure, no late reveal after disposal; existing startup-camera tests.       |
| 4     | `Extract runtime player presentation lifecycle`       | Player body, held models and asynchronous asset replacement. Keep combat and inventory authority unchanged.                                             | Rapid model swaps, late loads after disposal, on-foot/vehicle transitions, rig readiness and resource cleanup.                                        |
| 5     | `Extract runtime vehicle presentation coordination`   | Vehicle visual preparation and effects coordination using existing view/audio/light owners. Keep simulation and network ownership unchanged.            | Enter/exit and replacement; late vehicle readiness; lights/smoke/audio; shared-vehicle confirmation and reconnect regressions.                        |
| 6     | `Extract runtime world controls`                      | Coordinate gravity, recovery, sky clock and water with scene/simulation state. Preserve authored scene values and existing clamps.                      | Before/after play changes, fixed/live clock, water state, gravity propagation and invalid inputs; no new persistence keys.                            |
| 7     | `Extract runtime frame coordination`                  | Make frame stages and their inputs explicit after the above boundaries stabilize. Keep ordering and ownership visible.                                  | Order-sensitive simulation/camera/environment/shadow/render checks; warm-up, attract and XR paths; no extra loops or duplicated resource updates.     |
| 8     | `Consolidate runtime teardown ownership`              | Audit and consolidate final cleanup across extracted owners, pending work and event subscriptions. Each earlier topic must already clean up correctly.  | Repeated create/play/dispose; cancellation at each loading stage; no surviving callbacks/listeners; one runtime survives another's disposal.          |

For every topic: compare the public API, retain existing saved keys and migration precedence,
run focused regression tests followed by `npm run check`, run the affected browser tests,
regenerate source references, and restart the local development server with its existing
configuration. Record the resulting commit and validation in the completion report.
Use narrow dependencies rather than handing the entire runtime to an extracted component.

Track the previously reproduced traffic-sign settings HUD failure separately; do not hide
it behind a passing runtime check or mix an unrelated fix into a structural extraction.
Publication and Euskadi `ENGINE_REF` updates are a separate integration step after the
selected commits are validated. Preserve Relay's integrated history and local host changes.

### Topic 1 completion: input event lifecycle

`RuntimeInputEvents` now owns DOM events, focus/visibility handling and ordered control
release. Listeners retain the existing runtime abort lifetime and registration order.
`GameRuntime` provides narrow callbacks for game-specific wheel, key and look behavior;
vehicle menus and action execution deliberately remain for topic 2. The public facade
and preference keys are unchanged. Browser coverage exercises two owners, repeated bind,
abort cleanup, secondary mouse buttons, pointer recapture, Shift synchronization,
non-passive wheel handling and release order, alongside the real runtime keyboard test.
