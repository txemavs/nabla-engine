# Play on a terrain folder (Atlas Z15 packages)

`game/` can drive on the real tiles that `nabla-atlas` publishes as `z/15/<x>/<y>/`
cells: LiDAR relief, engine terrain, OSM buildings and an orthophoto. The player gets
the same play mode as Studio and the flat example: walk, board and drive the S3, the
A3, the white truck with its trailer, and fly the container ship (`V`), with the
cameras, HUD, sounds, mirrors, GPS and menus of the shared `GameRuntime`.

The terrain location is **never hard-coded**. You tell the game where to read it.

```text
/?terrain=<base>&tile=<x>/<y>[&dx=<m>&dz=<m>][&heading=<deg>]
```

| Parameter                 | Meaning                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `terrain` (or `z15`)      | Tile host, **without** the trailing `/z`. Manifests are read from `<base>/z/15/<x>/<y>/manifest.json`. `/` = this origin. |
| `tile`                    | Start over the centre of this tile, e.g. `16211/12003`. Optional when the host serves `<base>/index.json` (first tile).   |
| `dx`, `dz`                | Metres east / south of that centre. Use them to start on a road.                                                          |
| `lat`, `lon`              | Start at explicit coordinates instead of `tile`.                                                                          |
| `heading`                 | Compass heading the parked fleet faces, degrees clockwise from north (default 0).                                         |
| `alt`                     | Origin altitude in metres (default 0: the GLBs carry absolute elevations; the vehicles are rested on the real ground).    |
| `vehicle`                 | Preset the player starts in: `car` (default), `a3`, `white-truck`, `carrier`.                                             |
| `relief`                  | `engine` (default, drivable, with roads) or `lidar` (2 m LiDAR mesh as ground, experimental).                             |
| `photo`                   | Orthophoto draped on the ground: `full` (4096 px, default), `lo` (1024 px) or `none` (vertex colours).                    |
| `sky`                     | `day` (default fixed midday sun), `live` (real clock) or an ISO date-time with zone.                                      |
| `quality`, `fps`, `scale` | As in the other game modes.                                                                                               |

`?example=z15` is an alias that still requires `terrain`/`z15`; without a terrain
location the page says so in Spanish instead of guessing.

## Serving the folder from the dev server

The Vite game server (`vite.game.config.ts`) mounts a folder **read-only** when
`NABLA_TERRAIN_DIR` is set (`scripts/vite-terrain-folder.ts`). The folder must be the
one that contains `z/`, for example `C:\Data\terraform` for `C:\Data\terraform\z\15\16211\12003`.

```sh
NABLA_TERRAIN_DIR=/data/terraform npm run dev:game
# http://localhost:5174/?terrain=/terrain&tile=16211/12003
```

`NABLA_TERRAIN_ROUTE` changes the URL prefix (default `/terrain`). The route answers
`GET`/`HEAD` only (single `Range` supported), refuses dot files, anything outside the
folder (including symlinks that leave it) and any write. Payloads are named by content
hash, so they are sent `immutable`; `manifest.json` is `no-cache`. `<route>/index.json`
lists the cells that have a manifest, which lets the game skip requests for cells the
folder does not have (no 404 noise) and pick a default start.

Docker (the Atlas deployment, port 8703): `docker-compose.yml` in the `-run` directory
bind-mounts `/mnt/c/Data/terraform` at `/terrain-data:ro` and starts Vite with
`NABLA_TERRAIN_DIR=/terrain-data`. See [Deployment](#deployment-on-atlas).

Any other static host works too: `?terrain=https://tiles.example.org/atlas` needs CORS
for the page origin and, from an `https:` page, `https:` tiles.

## What an Atlas cell is, and how the engine reads it

```text
z/15/16211/12003/
  manifest.json                  nabla-planet-tile-v1, generator native-xyz-v2 (engine format)
  z15-<hash>.json                nabla-z15-package/1: every file with role, bytes, SHA-256
  terrain-<hash>.glb             engine terrain + roads + land use   (role engine.terrain)
  buildings-osm-<hash>.glb       OSM buildings                       (role engine.buildings)
  terrain-lidar-<hash>.glb       1.998 m LiDAR grid, UV, no colours  (role terrain.lidar)
  ground-<hash>.webp (+ -lo)     orthophoto of the cell, 4096/1024   (role ground.composite[.lo])
  ground-lots, ortho, roof, classes, mask-*, roof-ids, far*, instances, roofs, osm, provenance, licenses
```

`src/planet/atlas-z15.ts` (public `@nabla/engine/planet/atlas-z15`) is the adapter.
`fetchTileManifest(tile, { atlas })` reads the manifest with the standard validator,
fetches the package the manifest points to (size and SHA-256 checked, 4 MiB cap, safe
file names only) and returns a manifest the unchanged loader worker consumes.

| Atlas                                                         | Engine                                                                                                                                                   |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest.json`                                               | read as is: format, generator, id, tile, anchor (= tile centre, checked to 1e-9), bounds, files                                                          |
| `files.terrain` / `files.buildings-osm`                       | the loader's own layers (`engine.terrain`, `engine.buildings`; the package must name the same path and hash)                                             |
| `terrain.lidar`                                               | with `relief=lidar` replaces `files.terrain`; the worker declares it category `Terrain`, so it is rendered, collided with and draped like engine terrain |
| `ground.composite` / `.lo`                                    | `manifest.photo`; draped over terrain, roads, land use and roofs by the existing "Drape" mechanism, replacing the ArcGIS download (`imagery: 'package'`) |
| instances, masks, classes, roofs, roof-ids, far, OSM snapshot | listed (`atlasCompatibilityNotes`) but **not consumed yet**                                                                                              |

### Incompatibilities found (cells 16211, 16212 and all 33 manifests)

1. **LiDAR file name.** `terrain-lidar-<hash>.glb` did not match the published-name
   rule (`terrain-<16 hex>.glb`), so a manifest naming it was "Invalid planet layer".
   `isPublishedGlbPath` now accepts it for the terrain layer.
2. **Geometry revision.** 26 of the 33 cells are `native-surfaces-v2`, 7 are
   `native-surfaces-v5`; the engine writes v5 and, in static mode, re-requested the
   manifest of any older cell on every discovery pass. A static host cannot
   regenerate, so static mode now loads the GLB as published and does not re-poll it.
3. **Roof/ground photos came from the internet.** The Drape code always downloaded
   ArcGIS imagery. `imagery: 'package'` uses the cell's own orthophoto; `'none'`
   disables it. Default behaviour (`online`) is unchanged.
4. **Unpublished neighbours.** The streamer asks for every cell around the player
   (and coarser zooms). 404s are now remembered for a minute in static mode and
   `coverage` (from `index.json`) removes the requests entirely.
5. **LiDAR is visual relief, not a driving surface.** Its node says `drivable: false`;
   it has no roads, vertex colours or land-use meshes, and its heights differ a few
   metres from the engine's (buildings can float or sink on it). Hence `relief=engine`
   is the default and `lidar` is experimental.
6. Extra manifest fields (`z15Package`, `groundImagery`, `source`, `collision`,
   `palette`, `units`, `axes`, `attribution`, `retrievedAt`) are not rejected by the
   validator and are ignored apart from `z15Package`.

Same frame as the engine: origin at the cell centre, +X east, +Y up (absolute
elevation), +Z south. Terrain GLBs are 7.6–55.5 MB (loader cap 64 MB); on a plain
`http:` LAN origin the SHA-256 check runs in JavaScript and takes a few seconds on the
largest cells.

## Start positions

The start is computed from package metadata. For cell `16211/12003` the manifest
anchor is lon −1.8951416, lat 43.2971984. The first straight, flat road in the engine
terrain of that cell (Masti-Loidi) is 17.4 m east and 197.6 m north of the centre,
heading 118°:

```text
/?terrain=/terrain&tile=16211/12003&dx=17.4&dz=-197.6&heading=118
```

The player's car starts there; the A3, the white truck with trailer and the flying
container are parked ahead of it on the same road, each rested on the loaded ground
(`GameRuntimeOptions.restParkedOnGround`). Controls: `WASD`, `Space`, `C` cameras,
`E` enter/exit, `V` flight, `F` couple, `T` transfer, `H` GPS, `J` menu, `R` recover.

## Deployment on Atlas

```yaml
# nabla-engine-z15-run/docker-compose.yml (excerpt)
environment:
  NABLA_TERRAIN_DIR: /terrain-data
volumes:
  - /home/txema/projects/nabla-engine-z15:/workspace
  - /mnt/c/Data/terraform:/terrain-data:ro
```

Verify with `curl -I http://<host>:8703/` (200) and
`curl -I http://<host>:8703/terrain/z/15/16211/12003/manifest.json`.
