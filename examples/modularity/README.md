# Independent hosts — current API examples

See [architecture, contracts and phase-2 implementation](../../docs/architecture/vehicle-modularity.md).
Build the package before running the public-API Node examples:

```sh
npm run build
node examples/modularity/headless-vehicle.mjs
node examples/modularity/menu-only.mjs
```

The [standalone wall monitor](../../studio/examples/modular-monitor.html) is served
by `npm run dev` at `/examples/modular-monitor.html`. It uses the public `/monitors` and `/menus`
subpaths and never starts the Studio editor.

The [static S3 monitor](../../studio/examples/s3-monitor.html), at
`/examples/s3-monitor.html`, uses `/monitors/presets`: the same definition and
telemetry bindings as the S3, without a vehicle instance or physics. It includes
speed/RPM sliders and the keyboard menu; actions update local example properties.
Vite maps the public subpaths to source; the published package maps them to `dist`.
Consumers serve their own monitor assets (the stock recipe uses `/monitors/`).

Inventory: `node scripts/module-inventory.ts` (Node 22.18+).
Checks: `npx vitest run test/architecture` and
`npx playwright test studio/e2e/module-monitor.spec.ts studio/e2e/a3-nabla.spec.ts`.
The design contracts under `docs/architecture` are proposals, not runtime APIs.

The [equipment bench](../../studio/examples/equipment.html) uses the public
`/vehicle-presentation` module for retractable support and lamps, with no vehicle
instance. H raises/lowers its monitor; lowered monitors receive no data updates.
See [phase-3 adapter guide](../../docs/architecture/vehicle-equipment.md).

The [wheeled runtime example](wheeled-runtime.mjs) goes one level below the existing
headless Simulation example: it defines a new car with primitive colliders and
uses only public `/physics` and `/vehicles/wheeled` imports. Run after building:

```sh
node examples/modularity/wheeled-runtime.mjs
```

It shares one Rapier world and owns all stepping and teardown. See
[phase-4 contracts](../../docs/architecture/wheeled-runtime.md).

- `node examples/modularity/boat-flight.mjs`: independent hull and hovering craft,
  injected water/flight environment, one shared world, no wheel controllers.
  Build first. See [boat/flight runtime](../../docs/architecture/boat-flight-runtime.md).

- `node examples/modularity/custom-prefab.mjs`: a new procedural compact car using
  the existing public scene facade.

After building, `node scripts/check-package.mjs` runs all Node examples against
an actual installed tarball in a temporary independent project.
