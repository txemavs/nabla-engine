# Engine module map — start here

Issue #63 is implemented incrementally within one npm package. Public imports
below are the implemented APIs. There are no compatibility import paths or
parallel proposal-only contracts.

| Public import (`@nabla/engine` + suffix) | Owner / entry                                    | Use for                                                                 |
| ---------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------- |
| root                                     | `src/index.ts`, `src/presentation/scene-view.ts` | Validated scenes, editor history, Simulation and ready-to-use SceneView |
| `/vehicles`                              | `src/catalog/vehicles/index.ts`                  | Stock entity factories; this is a catalogue, not the wheeled solver     |
| `/physics`                               | `src/simulation/physics-api.ts`                  | Shared Rapier world/body/shape adapter                                  |
| `/vehicles/wheeled`                      | `src/simulation/vehicles/wheeled/index.ts`       | Standalone ground runtime, drivetrain, contacts and telemetry           |
| `/vehicles/boat`                         | `src/simulation/vehicles/boat.ts`                | Hull buoyancy and propulsion with injected water                        |
| `/vehicles/flight`                       | `src/simulation/vehicles/flight.ts`              | Assisted/aircraft flight with injected environment and cargo            |
| `/monitors`                              | `src/render/monitors/index.ts`                   | Static artwork, glyphs, bars and needles; HTML loads only on demand     |
| `/monitors/html`                         | `src/render/monitors/html-monitor.ts`            | Explicit browser HTML backend                                           |
| `/menus`                                 | `src/render/monitors/menu.ts`                    | Keyboard-independent menu state/actions; no DOM or Three.js             |
| `/monitors/presets`                      | `src/catalog/monitors/index.ts`                  | Stock layered definitions and S3 instrument recipe                      |
| `/vehicle-presentation`                  | `src/render/vehicle-presentation/index.ts`       | Mounts, retractable supports, instruments, lights, mirrors and cameras  |
| `/vehicle-presentation/presets`          | `src/catalog/presentation/road-vehicles.ts`      | Stock asset selectors, geometry adaptation and resolver                 |

## Which file should change?

- New car: [create a vehicle](../creating-a-vehicle.md). Prefer a prefab and asset
  adapter. Do not add model URL branches to Simulation or the renderer.
- New screen or dashboard: [create a monitor](../creating-a-monitor.md). Bind data;
  do not make the monitor call physics or own an input loop.
- Boat/flight dynamics: [runtime contract](boat-flight-runtime.md).
- Ground dynamics: [wheeled contract](wheeled-runtime.md).
- Model-specific material names, holes, logos and mount coordinates:
  `src/catalog/presentation/`; [equipment contract](vehicle-equipment.md).
- Editor keyboard/touch focus, storage and undo actions: `studio/` host.
- Boundary regressions: `test/architecture/`; inventory command:
  `node scripts/module-inventory.ts` (Node 22.18+).

The runtime composition owns one clock/world and resource lifetime. Low-level
hosts may drive the shared session with their own clock; automatic and manual
clocks are exclusive. Controllers apply forces before the fixed world step;
presentation reads the resulting state. Individual modules do not schedule frames.
Physics can run without WebGL/Audio. Use narrow subpaths to avoid the broad root
dependency graph.

The first #78 extraction adds `/runtime/session` (headless play lifecycle),
`/runtime` (shared camera, input and vehicle effects), `/runtime/browser`
(standalone browser composition), `/scene`, and `/examples/flat-tile`.
`game/` consumes these public entries. Studio uses the extracted components but
still owns some gameplay orchestration; see the
[remaining parity inventory](studio-extraction.md) before claiming the editor is
independent or moving it to another repository.

## Current-format policy

This foundation has no backward-compatibility commitment. Scene JSON uses version 1;
Studio projects use version 3 with an explicit planet ID. Project versions 1/2 are
rejected, not converted. A scene is validated as authored: parsing never upgrades
stock tuning, wheel/seat mounts, colors, buildings, placement or carrier portals.

Stock road equipment requires an explicit `visual.presentation` ID. An omitted ID
means a plain model; it does not trigger filename-based guessing. Unknown IDs warn
and omit optional equipment. Factories compose current defaults; scene settings
remain authoritative after creation. The carrier palette, sample and planet factories
explicitly include the stern portal.

Import from the public package or canonical `scene/`, `entity/`, `catalog/vehicles/`,
`render/effects/` and `diagnostics/` owners. The old `stage/`, catalogue sibling,
Studio effect/metrics and portal migration wrappers have been deleted. The singular
`createCarrierPortal` is the only carrier-mouth factory. The native XYZ loader is
the active world loader; unused browser BIN/JSON and anchored-GLB loaders are gone.
Map cache storage uses IndexedDB directly, without importing historical CacheStorage.

## Remaining boundaries (not hidden by the refactor)

- The serialized scene vehicle schema and Simulation facade currently share
  wheel fields in their active vehicle container. Standalone boat/flight runtimes require no wheels. Splitting that active
  container is a separate runtime/schema change, not an obsolete compatibility layer.
- Boarding, portal transitions and dock ownership stay in Simulation; there is
  no exported universal `vehicle-core.spawn` or ECS API.
- Ship/Cessna mounting and the artificial horizon retain model-specific presentation
  code. Road-model selection has moved to adapters. Do not claim every asset
  selector is gone.
- Tire effects/audio are reusable source modules, but have no dedicated public
  package subpath in this release. Studio still schedules their updates.
- Update intervals and draw budgets are tested; no new phone/XR/FPS performance
  guarantee follows from passing functional tests.

See [phase history and acceptance evidence](vehicle-modularity.md). Run
`npm run check`, browser regression tests and `npm pack --dry-run` before publishing.
