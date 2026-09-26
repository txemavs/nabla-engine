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
| `stage/`      | Old import paths. Do not add files.                                       | —                                                    |

`stage` used to mean "the live scene". That mixed the document, the graph and undo. Those now live in `scene/`. Callers that still import `stage/` keep working.

A finished game does not need Studio. It needs `render/`, `simulation/`, and a `SceneDocument`.
