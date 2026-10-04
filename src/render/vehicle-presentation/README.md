# Vehicle presentation

Generic mounts, retractable supports, instruments, lights, mirrors and cameras.

**Owns:** `@nabla/engine/vehicle-presentation` controllers and resource lifetime.
**Does not own:** stock asset selectors (those stay in `src/catalog/presentation`).

Equipment is selected by an explicit `visual.presentation` ID. The renderer asks
the host's resolver for an adapter; it does not compare stock road-vehicle URLs,
lens names or dashboard coordinates. This phase changes presentation composition,
not drivetrain tuning, contacts or input mappings.

## Where things live

| Responsibility                                            | Location                                                |
| --------------------------------------------------------- | ------------------------------------------------------- |
| Public equipment API                                      | `@nabla/engine/vehicle-presentation`                    |
| Stock adapters and explicit IDs                           | `@nabla/engine/vehicle-presentation/presets`            |
| Stock S3, Wrangler and police assembly/material treatment | `src/catalog/presentation/road-vehicles.ts`             |
| Measured S3 casing cut and display mounts                 | `src/catalog/presentation/a3-mounts.ts`                 |
| S3 lamp selectors and authored shader masks               | `src/catalog/presentation/a3-lamps.ts`                  |
| Bilbao decals and lightbar                                | `src/catalog/presentation/police-equipment.ts`          |
| Generic support movement and surface geometry             | `src/render/vehicle-presentation/`                      |
| Prepared lamp/mirror/display controllers                  | `src/render/entity/car-{lights,mirrors,instruments}.ts` |
| Public presenter composition                              | `src/presentation/scene-view.ts`                        |

The controller filenames remain for continuity; they contain no S3 asset selectors
or coordinates. The generic controllers do not import catalog presets, Studio or
physics. Stock catalog data remains separate from runtime controller instances.
Boat/carrier/airplane model integration is not migrated in this phase.

## Add equipment to a different model

Set `visual.presentation` in the prefab to a stable application ID, e.g.
`mygame.buggy`. The schema accepts 1–80 letters, numbers, dots, underscores and
hyphens. Register its adapter in the host's resolver:

```ts
import { SceneView } from '@nabla/engine'
import { CarLights, type VehiclePresentationAdapter } from '@nabla/engine/vehicle-presentation'
import { stockVehiclePresentation } from '@nabla/engine/vehicle-presentation/presets'

const buggy: VehiclePresentationAdapter = {
  mount(model, entity, displayRecipe) {
    // Resolve named GLB mount nodes here. Clone any shared materials you modify.
    // Return any combination of lights, mirrors, instruments and beacons.
    // A missing optional node should emit a useful diagnostic and omit that part.
    return {}
  },
  preparePart(model, kind) {
    // Optional model-specific body/wheel/steering import correction.
  },
  paint(model, color) {
    // Optional selection of this asset's paint materials.
  },
}
const view = new SceneView(document, false, false, {
  vehiclePresentation: (entity) =>
    entity.visual?.presentation === 'mygame.buggy' ? buggy : stockVehiclePresentation(entity),
})
```

The example is an adapter skeleton; the application must supply the actual node
bindings. No edits to `SceneView`, `Simulation` or Studio are needed to register
another adapter. Existing `SceneView` root imports keep stock adapters by default.
The low-level renderer accepts only what the host injects.

A new asset should contain named mount nodes. The S3 lacks them, so its adapter
owns the measured bounds, `FocoC`/`Llanta 2` selectors and local quads. Copy those
only when adapting that exact asset. Renaming a GLB does not change an explicitly
selected adapter. Do not assign an S3 adapter to an unrelated model.

## Independent pieces

- `RetractableMount(root, offset, durationMs)` moves a supplied support relative to
  its authored position. `toggle(nowMs)`, `update(nowMs)` and `reset()` are driven
  by the host. Movement can reverse without jumping between host updates. It owns
  no renderer, RAF, keyboard listener or mounted resources.
- `CarLights(bindings)` receives prepared materials, lamp role, side and optional
  overlay mesh. The owner retains materials/geometries. `update(state, nowMs)` and
  `toggle(side)` have no knowledge of an asset name or physics instance. Default
  intensities and the 450 ms flash cadence retain existing behaviour.
- `CarMirrors(surfaces, worldUp, tilt, policy)` receives explicit meshes, with no
  material-name search. `worldUp` is the host/vehicle's up direction at mounting.
  The optional policy configures target width/height and capture interval. Defaults
  remain 384×256 and 125 ms. Captures require an enabled, visible, front-facing
  mirror; all mirrors are hidden during capture to avoid recursion.
- `CarInstruments(mounts, recipe)` receives display poses/quads, a support, retraction
  parameters and the phase-2 recipe. The generic `LayeredMonitor` remains usable
  separately without this car/GPS controller.
- Camera helpers are also public. `vehicle.headOffset` is an optional three-number
  driver-local eye offset, shared by camera and visible avatar. Stock road presets
  explicitly use `[0, -0.15, -0.26]`; procedural vehicles use the camera helper defaults. Existing `vehicle.driver` and `cameraDistance` still define seat and
  chase distance. Per-vehicle mirror elevation remains `vehicle.mirrorTilt`.

See `/examples/equipment.html` for a monitor support and lamp controller on a
standalone bench, without any vehicle or physics. H raises/lowers the display.

## Resource ownership and compatibility

The asset library owns shared geometry/textures; each model instance owns its
cloned materials. Adapters may modify those cloned materials. S3 casing extraction
clones geometry and records the original reference; disposing the instruments
restores it, releases the two private cuts and detaches the support. It never
frees a geometry used by another car. Navigator and layered displays release their
own geometry/materials/textures. Disposed instruments cannot reopen menus.

Mirrors own their planar geometry and render targets. `dispose()` detaches/releases
them once and restores the source lens. `CarLights` borrows bindings: the owner
releases attached overlay meshes and materials with the model. Beacon textures
returned in `VehicleEquipment.beacons.textures` are released by `SceneView`.
The host disposes the complete view; components do not start background loops.

Stock adapters resolve only explicit `visual.presentation` IDs. Missing IDs mean
plain models; unknown IDs warn and omit optional equipment. There is no filename
fallback or saved-preset migration. Authored tuning, paint, mirror elevation and
camera offsets are used as saved.

The first browser regression run retains the S3's 161 draw calls / 91,070 triangles
in the same unoccupied-car fixture. This is a geometry/draw-count comparison, not
an FPS claim. Mirrors, GPS and layered displays retain their previous refresh
budgets. Ground and boat/flight runtimes are now available; see the
[module map](../../../docs/architecture/module-map.md).

## Validation commands

```sh
npm run typecheck
npm run build
npm run build:demo
npx vitest run test/architecture test/render studio/test/car-lights.test.ts studio/test/presentation.test.ts test/simulation/police.test.ts test/simulation/s3.test.ts
npx playwright test studio/e2e/equipment.spec.ts studio/e2e/a3-nabla.spec.ts studio/e2e/wrangler.spec.ts studio/e2e/police.spec.ts studio/e2e/gps-retract.spec.ts studio/e2e/car-mirrors.spec.ts studio/e2e/s3-lights.spec.ts studio/e2e/cameras.spec.ts studio/e2e/mirror-menu.spec.ts
```

The ten browser checks pass, including a renamed GLB with an explicit adapter,
shared-geometry survival after disposing the first car, and no catalog/physics
requests from the independent bench. Wrangler remains 46 calls / 35,820 triangles;
police remains 32 calls / 106,340 triangles in their isolated fixtures.

- Generated reference: [REFERENCE.md](REFERENCE.md)
