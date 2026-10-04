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

| Parameter                     | Meaning                                                                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `terrain` (or `z15`)          | Tile host, **without** the trailing `/z`. Manifests are read from `<base>/z/15/<x>/<y>/manifest.json`. `/` = this origin.               |
| `tile`                        | Start over the centre of this tile, e.g. `16211/12003`. Optional when the host serves `<base>/index.json` (first tile).                 |
| `dx`, `dz`                    | Metres east / south of that centre. Use them to start on a road.                                                                        |
| `lat`, `lon`                  | Start at explicit coordinates instead of `tile`.                                                                                        |
| `heading`                     | Compass heading the parked fleet faces, degrees clockwise from north (default 0).                                                       |
| `alt`                         | Origin altitude in metres (default 0: the GLBs carry absolute elevations; the vehicles are rested on the real ground).                  |
| `vehicle`                     | Preset the player starts in: `car` (default), `a3`, `white-truck`, `carrier`.                                                           |
| `relief`                      | `engine` (default, drivable, with roads) or `lidar` (2 m LiDAR mesh as ground, experimental).                                           |
| `photo`                       | Orthophoto draped on the ground: `full` (4096 px, default), `lo` (1024 px) or `none` (vertex colours).                                  |
| `sky`                         | `day` (default fixed midday sun), `live` (real clock) or an ISO date-time with zone.                                                    |
| `distance`, `memory`, `cache` | Load radius in metres, cells kept in memory and disk cache in MB (see "Cache and load radius"); they override what the menu remembered. |
| `player`                      | `hover` (default): on foot you are Studio's floating monitor (1.25 m above the ground); `walk`: a 1.8 m walker.                         |
| `layers`                      | Layers to hide: `-road` (road mesh gone, ground photo stays), `-photo`, `-buildings`; `all`/`none`. Also stored in `localStorage`.      |
| `quality`, `fps`, `scale`     | As in the other game modes.                                                                                                             |

`?example=z15` is an alias that still requires `terrain`/`z15`; without a terrain
location the page says so in Spanish instead of guessing.

A URL **without any query** (or with only display options) plays the default of the dev-server mount:
`?terrain=/terrain&tile=16211/12003&dx=17.4&dz=-197.6&heading=118&vehicle=car`, when `/terrain/index.json`
answers. `?tiles=` and `?example=flat` keep their original behaviour.

## Choosing the terrain at runtime

The in-game menu (top right, _Pantalla y rendimiento_) starts with a **Terreno** section:

| Option                  | Meaning                                                       | URL it applies                        |
| ----------------------- | ------------------------------------------------------------- | ------------------------------------- |
| **Plano**               | the bundled flat GLB tile, fully offline                      | `?example=flat`                       |
| **Teselas**             | a tile host; type its base URL in the field                   | `?tiles=<base url>`                   |
| **Carpeta de paquetes** | the Atlas Z15 folder served at `/terrain` (+ _Relieve LiDAR_) | `?terrain=/terrain` (`&relief=lidar`) |

_Aplicar y recargar_ reloads the page with that URL and remembers the choice in `localStorage`
(`nabla.terrain.source`). The logic is `src/planet/terrain-source.ts` (`parseTerrainSource`,
`withTerrainSource`, `chooseTerrainSource`, storage helpers); the game only draws the section
(`game/terrain-selector.ts`) and picks the mode (`game/entry.ts`). Rules:

1. **The URL wins.** `?example=flat`, `?tiles=` and `?terrain=` (alias `?z15=`) keep working and are never
   overridden by the remembered choice. Precedence between them: packages, flat, tiles.
2. A URL that names **no source** (a bare URL, or only `quality`, `fps`, `layers` ...) uses the remembered
   choice. With none remembered it plays the package folder when `/terrain/index.json` answers, else the flat tile.
3. A remembered _default_ package folder is ignored while its index does not answer; a remembered custom folder
   or tile host is trusted.
4. Changing the kind drops position parameters (`tile`, `dx`, `dz`, `heading`, `lat`, `lon`, `alt`); changing only
   the relief or the URL of the same kind keeps them. Other parameters are kept.
5. A tile URL must start with `http://`, `https://` or `/`; otherwise the menu shows a Spanish message and does not
   reload. The field is pre-filled with the active, then the remembered, then the build-time `VITE_NABLA_TILES_URL`.

### Cache and load radius

The same section has the controls Studio already had, now in the game menu (Spanish):

| Control           | Mechanism                                                                          |
| ----------------- | ---------------------------------------------------------------------------------- |
| Caché en disco    | `setMapCacheBudget` of the shared IndexedDB map cache: Desactivada, 25 MB … 10 GB. |
| Celdas en memoria | `PlanetWorld.setMaxTiles` (12 … 240 cells kept resident).                          |
| Radio de carga    | `PlanetWorld.setDistance` (1 … 20 km): cells farther than this are not requested.  |
| Vaciar caché      | `clearMapCache`.                                                                   |

Values are remembered in `localStorage` (`nabla.terrain.cache`); `?cache=<MB>&memory=<cells>&distance=<m>` win
over the remembered ones. The disk cache defaults to 1 GB here (cells are 11-15 MB; the engine's 100 MB default
would evict them as they arrive). The pure vocabulary (choices, parsing, labels) is
`@nabla/engine/planet/terrain-cache`; it reuses the choices and texts of Studio's cache panel (`studio/main.ts`, which is unchanged).

The section is bound before anything loads, so a terrain that fails to load can still be swapped from the menu.

## Behaviour matched to Studio's play mode

- **Streaming is Studio's.** The example uses the engine's own `PlanetWorld` ground-mode streaming
  (`planMapZooms`, the pump with its worker, the IndexedDB cache, `installBudgetMs` per frame): the cell under
  the player and its neighbours first, then the rest by distance within the load radius (4 km by default,
  like Studio's balanced profile). The game starts as soon as the spawn cell is ready; the HUD shows
  `Celdas: n/33` (`· cargando k…` while cells arrive). Loading never turns into an error while cells keep
  arriving (the wait is a stall limit, not a total time).
- **Heavy work in the worker.** Download, SHA-256, GLB parse, collision chunks, the ground-photo drape geometry
  and the photo's download/check/decode all run in the streaming worker; the main thread only wraps the arrays.
- **Far photos are small.** Cells farther than one cell from the player use the 1024 px `lo` photo (about 16x
  fewer pixels to download, decode and keep on the GPU); a cell the player approaches is upgraded to `full`.
- **Ground height.** The collision surface is the engine terrain. The photo drape used to be lifted 15 cm
  above it (a roof-only offset applied to the ground too), so every wheel looked 15 cm into the drawn road;
  ground photos now sit on the surface (`GROUND_DRAPE_LIFT`), roofs keep their lift.
- **Floating monitor.** Studio plays with `playerMode: 'hover'`; the example does too (`player=walk` for a walker).
- **Leaving a vehicle.** The exit spot is the first free side from which the vehicle can be reached again: a
  building collider is hollow, so the old rule could drop you behind a wall where E found nothing.
- **Layers.** The display menu lists the terrain layers (`TILE_LAYERS`, road first). Turning _Carretera_ off hides
  the road mesh and its photo; the ground photo underneath remains and collision is unchanged.

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
