# Math

Numeric kernels. No OSM tags, no scene documents, no entities. A function that only computes belongs here, so the hot paths stay in one place and can be profiled together.

Metres, Y-up, −Z forward. Rotations are unit quaternions.

## Folders

| Folder     | What it computes                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `frame/`   | Vec3 and quaternion tuples. Degrees to quaternion for the UI.                                                    |
| `geo/`     | Mean-radius sphere, local east-up-south frame, slippy-tile indices, approximate sun and moon, planet-fixed pose. |
| `planar/`  | Point in polygon and axis-aligned segment clip.                                                                  |
| `solid/`   | Local mesh topology: box, extrude, validate, triangulate.                                                        |
| `terrain/` | Heightfield sample and the matching triangle grid.                                                               |

Left outside on purpose. Mercator tile identity and zoom cover stay in `scene/`. OSM rings, roofs, draped roads and multipolygon assembly stay in `planet/`: they encode map rules and then call these kernels. `planet/land/terrain.ts` re-exports the heightfield so existing land imports keep working.

## WASM

Nothing here is worth a WASM port. A call per point loses to the boundary, and the loops that could be batched are already cheap.

Measured on a 121×121 grid at 10 m, the same clip-and-sample loop as `drapeRoad`: a land-cover polygon covering the tile is 8 ms (86 400 samples), a 400×12 m road is 0.2 ms, and `terrainHeight` alone is about 22 ns. A district of roads and cover stays in the tens of milliseconds. Fusing that loop into WASM might cut the worst polygon from 8 ms to a few. That does not show up in import time.

`pointInPolygon` and `clipSegment` are smaller than that. Sphere, pose, quaternions and solids go through Three.js and run at tile load or in the editor, not per triangle.
