# Independent hosts — current API examples

See [architecture, contracts and phase-2 implementation](../../docs/architecture/vehicle-modularity.md).
Build the package before running the public-API Node examples:

```sh
npm run build
node examples/modularity/headless-vehicle.mjs
node examples/modularity/menu-only.mjs
```

Studio serves `/examples/modular-monitor.html` and `/examples/s3-monitor.html`
from its own repo. Both use public `/monitors` and `/menus` (the S3 page also
uses `/monitors/presets`) and never start the editor. See
[create a monitor](../../src/catalog/monitors/creating-a-monitor.md) and the
[library contract](../../src/render/monitors/README.md).
Vite maps the public subpaths to source; the published package maps them to `dist`.
Consumers serve their own monitor assets (the stock recipe uses `/monitors/`).

Inventory: `node scripts/module-inventory.ts` (Node 22.18+).
Checks: `npx vitest run test/architecture` and
`npx playwright test studio/e2e/module-monitor.spec.ts studio/e2e/a3-nabla.spec.ts`.
The design contracts under `docs/architecture` are proposals, not runtime APIs.

Studio's `/examples/equipment.html` bench uses `/vehicle-presentation` for
retractable support and lamps, with no vehicle instance. H raises/lowers its
monitor; lowered monitors receive no data updates.
See [phase-3 adapter guide](../../src/render/vehicle-presentation/README.md).

The [wheeled runtime example](wheeled-runtime.mjs) goes one level below the existing
headless Simulation example: it defines a new car with primitive colliders and
uses only public `/physics` and `/vehicles/wheeled` imports. Run after building:

```sh
node examples/modularity/wheeled-runtime.mjs
```

It shares one Rapier world and owns all stepping and teardown. See
[phase-4 contracts](../../src/simulation/vehicles/wheeled/wheeled-runtime.md).

- `node examples/modularity/boat-flight.mjs`: independent hull and hovering craft,
  injected water/flight environment, one shared world, no wheel controllers.
  Build first. See [boat/flight runtime](../../src/simulation/vehicles/boat-flight-runtime.md).

- `node examples/modularity/custom-prefab.mjs`: a new procedural compact car using
  the existing public scene facade.

After building, `node scripts/check-package.mjs` runs all Node examples against
an actual installed tarball in a temporary independent project.
