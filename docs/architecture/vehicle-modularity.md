# Vehicle and monitor modularity

The six extraction phases of issue #63 are implemented within one npm package.
This is a new foundation: obsolete imports, model upgrades and historical-format
converters are removed rather than maintained. The [module map](module-map.md)
records the actual owners and public entries.

## Composition

- **Catalogue**: `src/catalog/vehicles/` loads JSON presets. Definitions live
  under `assets/studio` and `assets/custom`, not as one file per vehicle. Stock
  road presentation adapters live in `src/catalog/presentation/`; monitors and
  S3 recipes live in `catalog/monitors/`.
- **Simulation**: wheeled, boat and flight controllers borrow bodies in a shared
  Rapier world. They receive inputs/environment from the host and apply forces
  before its fixed world step. They do not start a second loop or own the world.
- **Presentation**: `visual.presentation` selects an explicit adapter. Adapters
  supply mounts, lamps, mirror surfaces and instrument recipes to reusable
  controllers. There is no road-model filename lookup or saved-preset rewrite.
- **Monitors**: layered artwork, text, bars and needles have bounded update rates,
  visibility and power controls. Menus accept host actions independently of input
  devices, physics or vehicle instances. HTML is an optional backend.
- **Studio**: owns editor UI, input translation, persistence, rendering schedule
  and browser activation. Core modules do not import Studio.

See [create a vehicle](../../src/catalog/vehicles/creating-a-vehicle.md),
[create a monitor](../../src/catalog/monitors/creating-a-monitor.md),
[wheeled runtime](../../src/simulation/vehicles/wheeled/wheeled-runtime.md),
[boat/flight runtime](../../src/simulation/vehicles/boat-flight-runtime.md)
and [equipment ownership](../../src/render/vehicle-presentation/README.md).

## Current formats and factories

Scene version 1 is the current entity-document format. Project version 3 is the
only Studio project format; retired project versions are rejected. Validation
preserves authored tuning, paint, mirror tilt, placement and portal relationships.
The catalogue/sample/planet factories create current defaults explicitly, including
the carrier stern portal. Importing a scene never installs missing stock parts.

Canonical source owners replace all former `stage/`, catalogue sibling, Studio
metrics/effects and portal migration wrappers. The plural carrier portal factory
and public Jeep migration export are removed. Root and subpath exports remain
real public APIs, not obsolete wrappers.

The native XYZ world loader is active. Unused browser BIN/JSON and anchored-GLB
loaders, their old inspector, CacheStorage import, automatic palette rewriting and
proposal-only contracts have been removed. Server-side generators and active
terrain/water filters remain part of the current publishing/rendering system.

## Evidence and boundaries

- Installed-tarball examples use only public imports, including an independent
  procedural vehicle and boat/flight hosts. Strict TypeScript consumer contracts
  verify all 12 public package entries.
- Current scene roundtrips preserve edited values, undo/redo and validation.
- Architecture tests check runtime dependency boundaries. Lifecycle tests check
  asynchronous disposal, mounting, mirrors and shared-resource ownership.
- Browser journeys cover driving, boarding, portals, monitors, menus, lights,
  terrain streaming, camera transitions and contact effects.
- Draw-count and secondary-update checks are bounded fixtures, not a mobile/XR
  or many-car FPS benchmark.

The active Simulation facade still coordinates boarding, docking and ground/flight
transitions with a shared scene vehicle container. Independent hull/flight APIs
need no wheels; separating that scene container is an implementation change, not
legacy support. Ship/Cessna mounting remains model-specific. Tire effects and audio
are reusable source modules without dedicated public subpaths; Studio schedules
them. There is no second universal vehicle-core or speculative ECS API.

## Verification

```sh
npm run check
npm run build:prepare
npm run test:e2e
node scripts/check-package.mjs
```

The package check installs an actual tarball into a temporary independent project,
checks export files, runs the five Node examples and compiles its TypeScript
consumer. It does not rely on repository-private imports.
