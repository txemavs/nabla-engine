# HK Compact presentation model

`hk-compact.glb` is the assembled game model, in metres, Y up, −Z forward.
It preserves the existing authored frame and slide, completes the rear exterior,
and adds a rounded curved trigger and a simple barrel exterior. The original sight
silhouettes remain; added plates, hammer, sight dots and control levers are deferred.
These additions are visual approximations for rendering, not manufacturing geometry.

The user supplied `cargador.glb`, preserved as `hk-compact.magazine.source.glb`.
Its authored transform is baked into the assembled model without changing its shape.
The previous `body.glb` and `slide.glb` remain unchanged as source and legacy assets.
Regenerate the complete asset with `node scripts/author-hk-compact.mjs`.

The separate `Frame`, `Slide`, `Barrel`, `Trigger` and `Magazine` nodes
are assembled at rest. `assets/rigs/weapons/hk-compact.rig.json` records their names, attachment markers
and artistic presentation travel. Always animate relative to each saved rest transform.
The magazine has no ammunition or internal working mechanism geometry.

Exterior references: the user's two supplied side-view photographs and
[Umarex USP Compact airsoft leaflet](https://www.colosus.cz/projekty/p1/files/4/42072/2.5996.asg.heckler.koch.usp.compact.pdf).
The leaflet is used only for visual identification; its airsoft operating instructions
and ammunition specifications are not part of this asset or the game simulation.

## Engine integration to follow

The current `Sidearm` still uses the legacy split assets. Complete the model review
before changing its runtime contract. A reusable weapon presenter should load one
assembled asset and bind explicit rig parts and sockets; preserve authored rest poses;
animate slide, trigger and magazine from state; place effects from `MuzzleSocket`;
and share the asset between world representation and first-person presentation.
Cadence, ammunition and reload state should have one simulation owner, separate from
cosmetic animation. Dispose instance-owned resources and handle late loading consistently.
