# `world`

Python library used by `service/server.py`. It does not open a port. The server imports it and decides what to expose.

A published cell is a folder `z/{zoom}/{x}/{y}` with a `manifest.json` and two GLB files. Zoom is 13, 14 or 15.

## Folders

| Folder     | What it does                                                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `osm/`     | Builds an Overpass query for a latitude/longitude box and turns the JSON answer into rings (buildings, roads, water, land, trees).                                                                                       |
| `bake/`    | Older path. Writes a static JSON zone so a place can be served without calling Overpass again. `format.py` is the file shape. `zones.py` builds one zone. `prefill.py` warms many zones into the disk cache.             |
| `queue/`   | SQLite list of cells someone asked to generate. States are `queued`, `running`, `ready` and `failed`.                                                                                                                    |
| `planet/`  | The live path. `prepare.py` downloads OSM for one cell and runs the TypeScript publisher in `src/publish`. `worker.py` takes the next queued cell, publishes it, and deletes old cells when the disk budget is exceeded. |
| `photo/`   | After the GLBs exist, reads their triangles and writes `preview.jpg` in the cell folder. Top-down, north up, 256×256, zoom 13–15. A cell whose elevation is entirely NoData is sea: flat GLBs at 0 m and a blue JPEG.    |
| `map/`     | HTML for `/map`. Draws those JPEGs as a slippy map and posts one cell to the queue when you click an empty one.                                                                                                          |
| `status/`  | Numbers for the operator page: requested cells, how many are still generating, the lat/lon span of published cells, and bytes on disk.                                                                                   |
| `archive/` | Optional S3 copy of the official map. Off unless `ATLAS_BUCKET` and AWS credentials are set. A missing cell is downloaded; a new cell is uploaded only when that key is not already there.                               |

## How a cell is made

1. The server accepts `POST /prepare/tiles` with keys like `z/15/16218/11999`.
2. `queue/` stores that request.
3. `planet/worker.py` claims the next request.
4. `planet/prepare.py` asks the cache for OSM, clips features to the cell, and runs `node prepare-dist/src/publish/prepare-planet.js`.
5. That program writes the GLBs and the manifest under `PREPARE_ROOT`.
6. `photo/` writes `preview.jpg` next to that manifest. The server serves it at `/tiles/{z}/{x}/{y}.jpg`.
7. `status/` reads the queue and those manifests for the page at `/`. `/map` is the same cells as pictures.

`bake/` is not that path. It produces JSON zones for the old fixed grid. New planet coverage comes from `planet/`.
