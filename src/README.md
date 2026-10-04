# Engine

A game loads this package and a scene JSON. Studio is the editor that writes that JSON. Nothing here imports `studio/`.

## Layers

| Folder        | Owns                                                                      | Does not own                                         |
| ------------- | ------------------------------------------------------------------------- | ---------------------------------------------------- |
| `math/`       | Numbers. See `math/README.md`.                                            | Documents, OSM, drawing.                             |
| `entity/`     | One node's schema and the checks for each kind.                           | The document, the transform graph, meshes on screen. |
| `scene/`      | The JSON document, its undo history, and the rigid transform graph.       | Picking, gizmos, panels.                             |
| `catalog/`    | Stock entities: car, carrier, lamps, and the drop-in palette.             | How those meshes are drawn.                          |
| `planet/`     | Map rules that turn a tile into geometry, collisions and published files. | Streaming, the sky dome, the sea shader.             |
| `simulation/` | The fixed step: bodies, vehicles, flight, walking, portal crossing.       | Cameras, audio, HUD.                                 |
| `render/`     | What a canvas needs to show a document. See `render/README.md`.           | The editor shell.                                    |

`stage` used to mean "the live scene". That mixed the document, the graph and undo. Those now live in `scene/`. The `stage/` compatibility folder is removed; callers import the actual owners.

A finished game does not need Studio. It needs `render/`, `simulation/`, and a `SceneDocument`.

## Where to change a feature

Start with [the vehicle catalogue](catalog/vehicles/README.md) for cars, boats,
aircraft and the container craft. Published models live in `assets/studio`;
`assets/custom` is local and not committed. Physics and rendering belong to this package.

Reusable post-processing lives in `render/effects/`, bounded frame measurements
in `diagnostics/`, and synthesized sound in `audio/`. Studio supplies DOM controls,
preferences, user activation and the frame loop. Engine does not read Studio DOM
or local storage. Studio imports these implementations directly.

See [sea surface](render/planet/sea-surface.md) for the single ocean cap,
tile-water filtering, manual flood level and simplified tide. See
[performance lab](../docs/architecture/performance-lab.md) for quality and tile
inspection controls; measurements live in [`diagnostics/`](diagnostics/README.md).
Frame-time metrics describe measured CPU/frame time, not GPU cost, and do not
certify a mobile or Quest performance target.

High-resolution PNG export lives in `render/capture.ts`. See
[photo export](render/photo-export.md) for tiled rendering, scene freezing,
cancellation and memory limits. Studio owns the button and download.
