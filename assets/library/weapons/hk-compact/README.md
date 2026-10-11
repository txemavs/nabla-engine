# HK Compact presentation model

`hk-compact.glb` is the assembled game model, in metres, Y up, −Z forward.
It preserves the existing authored frame and slide, completes the rear exterior,
and adds a rounded curved trigger and a simple barrel exterior. The user's rear-view
reference supplies the notched rear sight with two green dots, red-dot front sight,
and visible rounded compact hammer in the rear opening of the slide.
These additions are visual approximations for rendering, not manufacturing geometry.

The user supplied `cargador.glb`, preserved as `hk-compact.magazine.source.glb`.
Its authored transform is baked into the assembled model without changing its shape.
The previous `body.glb` and `slide.glb` remain unchanged as source and legacy assets.
Regenerate the complete asset with `node scripts/author-hk-compact.mjs`.

The separate `Frame`, `Slide`, `Barrel`, `Trigger` and `Magazine` nodes
are assembled at rest. `assets/rigs/weapons/hk-compact.rig.json` records their names, attachment markers
and artistic presentation travel. Always animate relative to each saved rest transform.
The magazine has no ammunition or internal working mechanism geometry.

The spent magazine that falls out on reload is this `Magazine` node, not a separate mesh.
`hk-compact.magazine.source.glb` is the user-supplied magazine (also named `hk-usp-compact-magazine` in review); its transform is baked into the assembled model in metres. Do not load the source GLB at runtime: it is still in the author's units.

Exterior references: the user's two supplied side-view photographs and
[Umarex USP Compact airsoft leaflet](https://www.colosus.cz/projekty/p1/files/4/42072/2.5996.asg.heckler.koch.usp.compact.pdf).
The leaflet is used only for visual identification; its airsoft operating instructions
and ammunition specifications are not part of this asset or the game simulation.

## Engine integration

`Sidearm` loads the assembled model and binds the slide, trigger and magazine from
the presentation rig, preserving their authored rest transforms. Both sights move
with the slide; the exterior hammer remains attached to the frame. Firearm and
reload state remain separate from this cosmetic geometry.
