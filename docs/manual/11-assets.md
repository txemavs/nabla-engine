# 11. Assets and content catalogs

[Manual contents](README.md)

An asset supplies representation; a definition supplies behavior. A GLB alone does
not define a vehicle's suspension, a character's inventory, or a portal's connection.
Keep the model import transform, authored anchors, physics definition, and catalog
registration explicit so that each can be inspected independently.

The library under `assets/library/` contains model families and recipes. Catalog
modules turn those recipes into reusable presets. `visual` describes model URLs and
presentation choices, while `vehicle` contains physical and control-related data.
A model filename or display name must not act as an implicit behavior selector.

## Adding content

1. Record the asset's origin and redistribution conditions alongside its content.
2. Normalize scale and orientation to the engine contract or declare an explicit
   import transform. Inspect the result beside a known-size reference object.
3. Author collision dimensions independently of rendering detail.
4. Add a recipe and the appropriate catalog registration.
5. Check loading in the production build, including any packed/quality variants.

For a procedural first asset, use the compact car in
[scene.mjs](../../examples/manual/scene.mjs). For a modeled vehicle, follow the
[vehicle definition guide](../vehicle-definition.md) and inspect an existing
recipe from the same family. Copying a car's visual mesh does not make its physics
parameters appropriate for a motorcycle or boat.

## Distribution and lifetime

`npm run assets:pack` prepares asset packs. The game build has a finalization step
for runtime resources; deploying only JavaScript output can leave model URLs broken.
See [asset packs](../asset-packs.md) for format and serving details.

The asset loader shares resources where appropriate while instances retain their
own transforms and selected material state. Dispose resources owned by an instance
through its lifecycle; do not dispose a cached shared texture merely because one
vehicle disappears. Quality variants and warmup belong to loading/presentation,
not physics identity.

A practical validation is to instantiate two copies, remove one, and verify that
the other remains visible and correct. Also test a missing resource: the error
should identify its URL instead of appearing as a mysterious physical failure.

## Source of truth

- [Asset provenance](../../assets/README.md).
- [Asset loader](../../src/render/entity/assets.ts).
- [Asset quality](../../src/render/entity/asset-quality.ts).
- [Pack builder](../../scripts/pack-assets.mjs).
- [Vehicle catalog](../../src/catalog/vehicles/index.ts).
