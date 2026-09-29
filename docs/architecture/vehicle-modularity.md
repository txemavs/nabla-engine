# Vehicle modularity — phases 1–6

Design baseline for [issue #63](https://github.com/txemavs/nabla-engine/issues/63).
Phase 1 inventoried the working tree, specified boundaries and ownership, and
added executable examples and architecture checks. Later phases add public monitor/menu APIs, equipment adapters and independent
ground, boat and flight runtimes. Phase 6 closes the API documentation and
compatibility checks. See the [current module map](module-map.md); the sections
below retain the measurements and scope of each phase.
The baseline includes the local S3/monitor work preceding this issue; it is not a
claim that every feature is already published on main.

## Reproduce the inventory

```sh
# Node 22.18+ for the inventory script's built-in TypeScript stripping.
node scripts/module-inventory.ts > /tmp/nabla-module-inventory.json
npx vitest run test/architecture
```

The read-only script parses TypeScript with Babel and emits runtime and type-only
edges, reexports and literal lazy imports. It follows local `.js` references to
`.ts`, reports computed imports instead of guessing them, and leaves npm packages
as terminal dependencies. Counts include the entry file and external terminals.
It does not inspect npm internals, GLB names, runtime registries or string-based
host wiring. Paths are relative to the repository, so another agent can reproduce
and compare it. Babel is a pinned development dependency; it adds no runtime cost.

Measured in this working tree on 2026-09-29:

| Entry                                | Runtime closure | Including types | External runtime terminals |
| ------------------------------------ | --------------: | --------------: | -------------------------- |
| `render/monitors/menu.ts`            |               1 |               1 | none                       |
| `render/monitors/layered-monitor.ts` |               3 |               3 | Three.js                   |
| `simulation/vehicles/drivetrain.ts`  |               1 |               4 | none                       |
| `simulation/vehicles/boat.ts`        |               3 |              20 | Rapier                     |
| `catalog/vehicles/index.ts`          |              21 |              21 | Three.js, Zod              |
| `render/entity/car-instruments.ts`   |              30 |              34 | Three.js, Zod              |

There are 557 import edges from 151 source files with imports, and no computed
imports in this snapshot. These counts are observations, not golden snapshots:
tests assert architectural rules, not exact file counts.

## Current ownership and coupling

| Current location                         | Owns now                                                                | Next destination / constraint                                            |
| ---------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `entity/vehicle/field.ts`                | Persisted vehicle schema; required four-wheel fields                    | Separate common prefab from capability schemas, with versioned migration |
| `entity/vehicle/vehicle.ts`              | Runtime state including Rapier body, wheels, boat and flight fields     | Runtime capability state; never persist bodies or render objects         |
| `simulation/simulation.ts`               | One world/clock, control, boarding, driving, flight, queries            | Keep orchestration; delegate behaviour behind narrow interfaces          |
| `simulation/vehicles/boat.ts`            | Buoyancy and thrust using the common `Vehicle` and physics vectors      | Boat runtime consuming water/physics services; no wheel prerequisite     |
| `simulation/vehicles/drivetrain.ts`      | DSG, manual gears, launch and retention                                 | Pure wheeled-vehicle behaviour                                           |
| `render/entity/view.ts`                  | Asset loading and URL-specific accessory construction                   | Presenter composed from prefab adapters and mount descriptors            |
| `render/entity/car-instruments.ts`       | A3 geometry surgery, GPS mount, monitor telemetry, menu                 | A3 adapter + generic retractable support + independent displays          |
| `render/entity/car-lights.ts`            | Lamp logic and A3 material/region selection                             | Generic lamp controller + asset-specific lamp selectors                  |
| `render/entity/car-mirrors.ts`           | Lens fitting, elevation, capture throttling                             | Reusable mirror component; adapter provides lens mount                   |
| `render/monitors/`                       | Layered surfaces, HTML rasterization, menu state                        | Preserve implementations; isolate HTML and add public subpaths           |
| `catalog/vehicles/`, `catalog/monitors/` | Ready-made definitions and artwork bindings                             | Leaf-level composition recipes; no generic module imports a stock model  |
| `audio/flight.ts`                        | Shared audio graph for multiple transport modes                         | Vehicle audio consumer, activated/suspended by host                      |
| `studio/main.ts`                         | Key bindings, actions, editor persistence, effects and telemetry wiring | Host retains input/storage/permissions; reusable adapters leave Studio   |

Exceptions recorded at the phase-1 baseline (1–3 resolved in phase 2):

1. `CarInstruments` imports exactly `catalog/monitors/car.ts` and
   `catalog/monitors/s3-cluster.ts`. Tests allow those two exact edges until phase 2
   removes them; any new render-to-catalog edge fails.
2. `LayeredMonitor` eagerly imports `HtmlMonitor`, so its runtime closure includes
   that module even for a non-HTML screen. Construction of non-HTML layers does
   not construct an HTML monitor. Phase 2 must isolate HTML, not merely rename it.
3. The public root export is broad. A menu imported from the root can run in Node,
   but that is **not** proof of a small import graph. A dedicated menu subpath is
   still needed. Vehicle presets themselves also currently pull Three.js/Zod.
4. Boat runtime types reach the shared four-wheel vehicle contract. No claim of
   independent boat packaging is made yet.

## Dependency rules and proposed public API

Keep one npm package initially. Existing root imports and `@nabla/engine/vehicles`
continue working. Menu/monitor subpaths below are implemented in phase 2;
vehicle/core, boats, flight, presentation, effects and audio remain proposals:

| Subpath                              | Contract                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------- |
| `/vehicles/core`                     | Seats, identity, mount descriptors, component lifecycle; no renderer/DOM  |
| `/vehicles/wheeled`                  | Wheel dynamics, steering, transmission and vehicle telemetry              |
| `/boats`                             | Hull/propulsion/flotation; supplied water sampling service                |
| `/flight`                            | Flight behaviour; can coexist with wheeled capability                     |
| `/monitors`                          | Layered renderer and bindings; no vehicle, menu or Rapier requirement     |
| `/monitors/html`                     | Optional trusted-local-HTML backend, explicitly browser-only              |
| `/menus`                             | Selection, hierarchy and declarative actions; no Three.js, DOM or physics |
| `/vehicle-presentation`              | Cameras, mirrors, lamps and mounts configured by adapters                 |
| `/vehicle-effects`, `/vehicle-audio` | Consumers of telemetry, contacts and activation                           |

A prefab/catalog entry may compose these modules. None may import a stock vehicle
or Studio. Application/editor input adapters translate device input to commands.
Monitors accept data; menus emit actions. Neither reaches into `Simulation`.

The architecture checks enforce the boundaries that already hold, including
transitive runtime closures for presets and behaviours. Phase 2 removes the two exact render-to-catalog exceptions. They also test the parser
with synthetic forbidden reexports and lazy imports. They do not pretend the
future directory layout is already present or enforce it through a blanket
allowlist of all current edges.

## Contract decisions

The [type-checked design contracts](composition-contracts.ts) are a **proposal**,
kept outside `src` and package exports. Their test demonstrates composition with
plain data, not an implemented component framework.

- **Coordinates:** metres, Y-up, −Z forward. Mount poses are local to their parent;
  physics contacts are absolute world metres with normalized world normals. A
  presenter subtracts the host's floating origin exactly once. Contact absence is
  represented by null position/normal, never a zero normal treated as valid.
- **Time:** one 60 Hz fixed-step simulation. `FixedFrame` carries seconds and tick;
  presentation gets elapsed seconds and a monotonic millisecond timestamp for
  existing monitor/capture schedulers. No component creates its own physics world
  or RAF loop. Examples may own a host loop.
- **Telemetry:** read-only snapshots identify tick and simulation time. Proposed
  speed unit is m/s; the adapter explicitly converts current `speedKmh` and display
  units. A monitor must not trigger stepping or issue commands by reading data.
- **Lifecycle:** host creates, calls cancellable `prepare`, activates, steps and
  disposes. Disposal is idempotent. Deactivation stops optional work but retains
  reusable loaded resources; disposal detaches bindings/listeners and releases
  leases. A late async completion after abort/dispose releases its allocation.
- **Ownership:** asset cache owns shared geometries/textures. A component owns its
  cloned materials, render targets and subscriptions. `Lease.dispose()` releases
  a reference; destroying one vehicle cannot destroy another's shared wheel.
  A mount owns only attachment; detaching a surface does not dispose its asset.
- **Properties:** JSON-only validated values, defaults in prefab, per-entity
  overrides in scene, transient state outside it. Mirror example: −5…12 degrees,
  step 1, default −2. An explicit saved value always wins over a new default.
- **Actions:** a menu dispatches a typed action to the host; host checks target,
  capability and value and returns applied/reason. Studio performs undo/redo and
  persistence; standalone games choose their own storage. Never execute code from
  a scene string. Menu focus consumes navigation before driving; losing focus
  clears held device input.
- **Mount adapters:** named nodes or GLB metadata for new models; explicit mapping
  and geometry extraction for legacy assets. Missing optional slots emit a
  diagnostic and omit that accessory; missing required physics/seat data fails
  prefab validation. Never infer a capability from a filename or display name.
- **Scheduling:** host prioritizes occupied/visible components. Refresh policies
  carry interval, priority and inactive=stop. No blanket guarantee that every
  monitor costs the same: layered meshes, HTML rasterization and camera capture
  remain different workloads. Diagnostics report actual updates and resource use.

## Baseline budgets

These are current implementation limits, not FPS promises or measured CPU/GPU
latency. Re-run on the same scene, camera, device and preset before comparing a
later refactor. Hidden and powered-off scenarios must be included.

| Component       | Current limit / behaviour                                                                                           | Regression evidence                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Mirrors         | 384×256 target per mirror, capture opportunities every 125 ms; occupied cockpit + frustum only                      | `car-mirrors.spec.ts`                  |
| GPS             | 300 ms primary / 1,200 ms secondary, adaptive pressure up to ×4; pose-change check; stops when retracted/menu shown | `gps-retract.spec.ts`                  |
| HTML monitor    | 150 ms default, 50…5,000 ms clamp; adaptive, secondary ×4; one shared in-flight raster gate                         | `html-monitor.spec.ts`                 |
| Layered display | Shared atlas per font per instance; glyph UV/mesh transforms update, not whole-screen HTML raster                   | `layered-monitor.spec.ts`              |
| Tyre marks      | 2,048 segments, 20 s lifetime, ≤20 emission ticks/s, one draw                                                       | `tire-marks.spec.ts`, unit tests       |
| Smoke           | 96 points, one draw                                                                                                 | `tire-smoke.ts`                        |
| Wheel asset     | 4,596 triangles, 4 material batches; geometry shared by four wheels                                                 | `a3-wheel.spec.ts`, `a3-nabla.spec.ts` |

The current isolated `a3-nabla.spec.ts` fixture reports **161 calls / 91,070 submitted
triangles**, GPS lowered, without mirror captures. This is a geometry/render-call
baseline in headless Chromium with software WebGL available, not a driving-world
frame-time measurement. Wall-monitor and Node examples add separate independence
checks. CPU percentiles, GPU timer queries, device/mobile baselines and package
size budgets must be measured during the affected migration phase; this document
does not invent numbers for them.

## Executable examples using today's APIs

```sh
npm run build
node examples/modularity/headless-vehicle.mjs
node examples/modularity/menu-only.mjs
npm run dev
# Open /examples/modular-monitor.html
```

- Headless vehicle: public package imports, one Rapier world, no browser or asset
  renderer. Checks acceleration and disposes the world.
- Menu-only: dedicated public `/menus` import, opens a submenu, dispatches an action and
  returns, without creating a vehicle or browser context.
- [Wall monitor](../../studio/examples/modular-monitor.html): a minimal browser
  host imports the public `/monitors` and `/menus` subpaths and feeds synthetic temperature
  data. It does not import the Studio editor, vehicle catalogue or physics. Keys
  select LIVE/HOLD. The host owns its loop and disposes resources on page exit.
  Vite maps these public subpaths to source for development; package builds resolve `dist`.
- [Static S3 monitor](../../studio/examples/s3-monitor.html): the exact S3 recipe,
  sliders and keyboard menu, without a car, physics or Studio editor.

The wall example lives under Studio's Vite server only for serving; its source
has no dependency on Studio services. The browser test checks requested modules
as well as interaction. Its own 100 ms loop is an example policy, not a global
engine policy change.

## Phase-1 exit and phase-2 handoff

- [x] Reproducible dependency inventory and named existing exceptions.
- [x] Proposed exports, data flow, lifecycle, coordinates, resource ownership,
      persisted/transient state and scheduling contracts.
- [x] Current budget limits and an isolated rendered baseline, with measurement limits.
- [x] Public-API headless vehicle/menu examples and a browser monitor without vehicles.
- [x] Automated boundary rules, a scanner regression test and a browser independence test.

The handoff from phase 1 was to add the menu/monitor subpaths, separate HTML loading and replace
the two `CarInstruments → catalog` edges with injected definitions/bindings.
The acceptance condition was using the same display definition in the S3 and a static mount,
removing those exact exceptions, preserving saved scenes and matching the relevant
budgets. Do not move boat physics or retune vehicles as part of that phase.

## Phase 2 — implemented locally

The package now exposes `/monitors`, `/menus`, `/monitors/html` and
`/monitors/presets`. Existing root imports and `/vehicles` remain available. The
root remains a broad compatibility entry point; use subpaths for small hosts.
`/menus` has no imports at all. `/monitors` eagerly loads only its renderer and
Three.js; the HTML implementation loads through a literal dynamic import only
when constructing an `html` layer. The inventory's runtime closure deliberately
**includes lazy imports**, so its count is not an eager-download measurement.
Architecture tests distinguish those graphs, and browser tests record requests.

`MonitorData` and refresh options live in a type-only common module. HTML layers
remain source-compatible: `ready` waits for the optional backend and template,
pre-load updates retain the latest data snapshot, secondary priority survives
loading, and disposal before/during loading prevents resurrection. Shared refresh
objects are copied per surface, so throttling one instance cannot change another.
The HTML work limits and layered glyph/needle rendering strategy are unchanged.

The renderer's `CarInstruments` now receives a `CarInstrumentDefinition`:
cluster/menu layouts, menu items/title and pure telemetry/menu binding functions.
The stock `s3Instruments` recipe owns the Spanish labels, speed/RPM conversion and
gear formatting. Car-specific GPS geometry and retract animation remain in the
legacy mount adapter for a later phase. Menu dimensions now come from the recipe.

Composition is explicit in `src/presentation/scene-view.ts`. The public
`SceneView` supplies the stock recipe by default, with an optional fourth
`SceneViewOptions` argument to replace it (or `carInstruments: null` to omit it).
Studio and its remote destination-view factory use this composed presenter.
`src/render/entity/view.ts` is the bare renderer: internal consumers must inject
a recipe if they need instrument mounting. It never imports stock display recipes.
No scene schema, saved mirror values, driving controls or physics changed.

The two direct `CarInstruments → catalog` edges are gone, with **no allowlist**.
The instrument runtime dependency closure also excludes the catalog. This does
not claim that the entire renderer graph is catalog-free: legacy portal/scene
migration paths still reach stock vehicle migrations and are outside this phase.
No generic monitor or menu reaches those paths.

The same `s3Instruments.cluster` and binding functions run on the car mount and
the standalone S3 example. The standalone host handles menu actions against its
own local properties: this demonstrates that a screen does not edit a vehicle or
simulation by itself. Assets are still application-served under `/monitors/`;
packaged consumers should serve the package assets or provide their own URLs.

### Validation

- Architecture rules, pure recipe/menu tests and asynchronous disposal tests.
- Node examples using built package subpaths and a headless vehicle.
- Browser checks: independent generic and S3 monitors, layered glyphs/needles,
  on-demand HTML and separate refresh priorities, HTML raster output, GPS
  retraction/re-entry, menu actions and camera flow.
- The isolated car still submits **161 calls / 91,070 triangles**, matching the
  phase-1 baseline. This is not an FPS or device CPU/GPU timing claim.

### Next phase

Extract asset-specific mounts, lamps, mirrors and retractable supports from the
legacy car adapter using explicit configuration. Keep the validated stock recipe
and saved-scene compatibility. The broader component lifecycle under
`composition-contracts.ts` remains a proposal; phase 2 has not implemented a
universal vehicle/boat/flight component framework.

## Phase 3 — configurable equipment

Implemented S3, Wrangler and Bilbao police adapters selected by explicit
`visual.presentation` IDs, with a stock-only fallback for old scenes. Road-car
URL switches and S3 coordinates/material selectors have left `SceneView`. Mounts,
retractable motion, prepared lamp/mirror controllers and camera helpers are
available through `/vehicle-presentation`; stock recipes through its `/presets`
subpath. Camera/visible-avatar offsets share an optional per-vehicle property.

See [equipment integration and ownership](vehicle-equipment.md) for the adapter
contract, public imports, legacy compatibility and resource disposal. The next
phase is the terrestrial vehicle runtime, not additional physics tuning.

## Phase 4 — terrestrial runtime

The new public `/vehicles/wheeled` module owns wheel setup, steering, axle torque,
DSG/manual shifts, retention, launch/grip/braking and normalized contact snapshots.
`Simulation` delegates ground driving while retaining the shared clock/world,
occupancy, docks, geography, roads and mode orchestration. Pure configuration no
longer depends on the complete entity schema. Old facade methods remain compatible.

The `/physics` entry supports a [standalone custom-car host](../../examples/modularity/wheeled-runtime.mjs)
without importing `Simulation`, catalog models or a renderer. See the
[runtime contract, ownership and validation](wheeled-runtime.md). The original
27 driving snapshots across S3, Wrangler and police match exactly after extraction.

Next: boat/flight runtime composition and explicit water/environment services.

## Phase 5 — boat and flight composition

Boat and flight forces now live in independent public runtimes, with water and
flight environment supplied by the host. Existing Simulation delegates while
retaining boarding, docking, portals and mode transitions. Ship/boat readings
reuse layered monitors. Legacy scene wheel fields remain compatible.

See [contracts, ownership and limitations](boat-flight-runtime.md) and the
[standalone shared-world host](../../examples/modularity/boat-flight.mjs).

## Phase 6 — public API, compatibility and cleanup

- [Create a vehicle](../creating-a-vehicle.md), [create a monitor](../creating-a-monitor.md)
  and the [module map](module-map.md) are the entry guides for a new contributor.
- Public root/catalog imports remain. Narrow runtime/presentation/monitor exports
  include emitted declaration files. The package consumer check installs an actual
  tarball outside this repository and runs every Node example plus a strict TypeScript consumer via public imports.
- Scene version 1 still opens without optional presentation/head fields; a new
  regression verifies explicit saved paint/mirror values, undo/redo, JSON roundtrip
  and rejection of unsupported versions. No unnecessary migration rewrites saves.
- Browser fixtures now use current module paths, CSS selectors, Desktop tabs and
  model names; their checks still exercise the corresponding current UI actions.
- Duplicate police rendering was removed in phase 3; documentation now points to
  its catalogue adapter. Compatibility barrels remain where they still serve old
  source imports. Experimental composition contracts are clearly labelled as design.

```sh
npm run check
npm run test:e2e
node scripts/check-package.mjs # after build; installs dependencies in a temporary host
```

### Acceptance evidence and remaining scope

| Goal from #63                            | Evidence / limit                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Create a car without editing core/Studio | `examples/modularity/custom-prefab.mjs`; injected adapter resolver for GLBs                            |
| Drive from outside Studio                | Installed-tarball examples; no private source imports                                                  |
| Boat without fictitious wheels           | Standalone `createBoat`/`stepBoatInWater`; scene schema retains compatibility wheel fields             |
| Reuse monitors and menus                 | Wall/S3/equipment examples; ship/boat layered readings; independent menu actions                       |
| Display independence                     | Architecture import tests and headless runtime examples                                                |
| Preserve saved settings                  | Version-1 compatibility/history test and mirror-menu browser journey                                   |
| Preserve driving and transitions         | Rapier unit tests and browser journeys for controls, docking, portals, lights and effects              |
| Lifecycle/shared resources               | Layered async disposal, mirror/mount and multi-instance tests                                          |
| Secondary performance                    | Power/visibility/update budgets and isolated draw-count fixtures; no claim of a many-car FPS benchmark |

This closes the six incremental extraction phases, not every aspirational module
in the initial proposal. The [module map](module-map.md#remaining-boundaries-not-hidden-by-the-refactor)
identifies legacy scene capabilities, ship mounting, effect/audio exports and
measurement work that require separately scoped changes.

### Cleanup defects found by the full regression run

An empty native-tile coverage key incorrectly looked already calculated when a
relief cell arrived. Its collision chunks stayed empty until coverage changed or
an optional photo loaded. Coverage invalidation now distinguishes “not calculated”
from an empty set; missing/corrupt photos do not prevent terrain availability.
A focused unit test fails on the old implementation and checks initial coverage,
cover/uncover transitions and rejected image decoding.

The independent geoEuskadi viewer was missing the separator before its manifest
filename; the zoom viewer was not draining the new incremental installation queue.
Both hosts are corrected without changing tile formats or quality policy.

The gallery regression also exposed two Rapier hitscan defects: a transported ray
started inside the destination window barrier, and animated targets inherited
stationary tree-trunk colliders. Transport now clears the exit thickness (including
oblique rays) and preserves the remaining range. Only tree billboards get trunks;
target hits follow the visible sprite. Unit and browser regressions cover both.

### Validation for the phase-6 delivery

- 405 Vitest tests across 103 files; type checks, formatting and both builds.
- 124 browser cases verified across the full run and focused reruns after repairs.
- 103 Python cache/delivery tests.
- Actual npm tarball installed outside the repository: all 12 public entries,
  five Node examples and strict TypeScript consumer contracts.

Browser validation uses isolated fixtures and Chromium; it is not a measured
mobile/Quest performance result.
