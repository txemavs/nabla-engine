# Engine module map — start here

Issue #63 is implemented incrementally within one npm package. Public imports
below are available now; `composition-contracts.ts` is a design sketch, not an
exported runtime. Do not implement that sketch by copying it into a second engine.

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

The host owns one clock/world, input translation and resource lifetime. Controllers
apply forces before the fixed world step; presentation reads the resulting state.
No module creates its own render loop. Physics can run without WebGL/Audio. Use
narrow subpaths to avoid the broad root dependency graph.

## Compatibility policy

Scene JSON remains **version 1**. Optional `visual.presentation` and
`vehicle.headOffset` require no migration or rewrite. Saved colour and mirror
settings win over prefab defaults. Missing presentation IDs resolve through the
catalogue's legacy URL table; explicit IDs always win. Unknown IDs warn and omit
optional equipment. `parseScene` rejects unknown scene versions; future breaking
formats need an explicit migration before validation, never silently treating a
new version as version 1. Existing portal/preset migrations remain in place.

Old root exports, `/vehicles`, and `src/catalog/*.ts` / `src/stage/*.ts`
compatibility barrels remain. Deep internal renderer constructors are not public
package contracts; their injected signatures are described in the equipment guide.
The old internal `render/entity/police.ts` implementation moved to
`catalog/presentation/police-equipment.ts`; no public export was removed.

## Remaining boundaries (not hidden by the refactor)

- The serialized scene vehicle schema and Simulation facade still carry legacy
  wheel fields. Standalone boat/flight runtimes require no wheels. A breaking
  serialized capability schema is a separate migration.
- Boarding, portal transitions and dock ownership stay in Simulation; there is
  no exported universal `vehicle-core.spawn` or ECS API.
- Ship/Cessna mounting and the artificial horizon retain legacy presentation
  code. Road-model selection has moved to adapters. Do not claim every asset
  selector is gone.
- Tire effects/audio are reusable source modules, but have no dedicated public
  package subpath in this release. Studio still schedules their updates.
- Update intervals and draw budgets are tested; no new phone/XR/FPS performance
  guarantee follows from passing functional tests.

See [phase history and acceptance evidence](vehicle-modularity.md). Run
`npm run check`, browser regression tests and `npm pack --dry-run` before publishing.
