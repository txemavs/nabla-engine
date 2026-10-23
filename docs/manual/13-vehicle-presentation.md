# 13. Vehicle presentation and equipment

[Manual contents](README.md)

Vehicle presentation maps simulation telemetry onto visible equipment: lamps,
instruments, mirrors, moving parts, driver pose, exhaust, and other effects.
`visual.presentation` selects an adapter explicitly. A missing presentation ID
does not authorize guessing equipment from a filename.

The generic renderer and the stock presenter have distinct composition roles.
The stock `SceneView` supplies road-vehicle presentation and instrument defaults;
custom hosts can replace those choices. Prefer adapters and authored mounts over
adding a condition for each vehicle ID inside the renderer.

## Authoring a modeled vehicle

Use the GLB conventions described in the vehicle definition and rig guides. Named
light materials such as `nabla.light.<role>` and authored anchor metadata allow
presentation to find intended equipment. The recipe selects the adapter and
configuration. Collision shape still belongs to the vehicle definition.

For a new dashboard, establish the monitor definition and telemetry mapping first.
Then place it using the model's mount. Test speed/RPM inputs independently before
debugging a complete driving scene. `@nabla/engine/monitors` supplies layered
monitors; `/monitors/html` and `/menus` expose other composition pieces.

## Example workflow

```sh
npm run rigs:check
npm run rigs:test
```

If authored rig inputs change, use `npm run rigs:generate`, inspect its diff, and
repeat the checks. Generated rig data is an output, not the place to hand-edit a
model's source mount.

Validate headlights and brake/reverse/indicator states separately. For mirrors,
inspect the lens mesh, camera placement, and configured aim before altering the
whole chassis orientation. For moving equipment, check its local transform both
at rest and while the vehicle moves. A presentation-only animation must not
silently change the simulation's physical dimensions.

Reuse material and lighting policies across vehicles. The repository's UI and
appearance conventions discourage ad hoc per-model fixes that compensate for an
incorrectly authored asset. A documented adapter is appropriate when the actual
equipment differs.

## Source of truth

- [Presentation exports](../../src/render/vehicle-presentation/index.ts).
- [Stock adapters](../../src/catalog/presentation/road-vehicles.ts).
- [Authored lights](../../src/render/vehicle-presentation/authored-lights.ts).
- [Vehicle rigs](../vehicle-rigs.md).
- [Monitor creation](../creating-a-monitor.md).
