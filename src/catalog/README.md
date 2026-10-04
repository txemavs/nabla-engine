# Catalog

Stock entity factories. Recipes do not become simulation implementations.

**Owns:** presets and `createCatalogEntities(kind, id, groundPosition)`.
**Does not own:** physics, presentation adapters, or how meshes are drawn.

- `car`: S3 preset (`assets/studio/cars/a3/s3.json`). `a3` is the previous cabrio, same folder.
- `carrier`: flying container, walkable interior, garage and one attached stern portal.
- `streetlight`: nine-metre highway pole with an overhanging luminaire and editable light component.

The supplied position is a ground contact. The factory applies the preset's origin
clearance. Cloning a carrier uses the editor's descendant cloning and portal remapping.

Capabilities are derived in [`src/entity`](../entity/README.md). Vehicles:
[`vehicles/`](vehicles/README.md). Monitor recipes:
[`monitors/`](monitors/creating-a-monitor.md). Road presentation IDs:
[`presentation/`](presentation/README.md).

- Tests: `test/presentation`, `test/local-presets.ts`
- How-to: [create a vehicle](vehicles/creating-a-vehicle.md)
