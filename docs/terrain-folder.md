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

| Parameter                     | Meaning                                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `terrain` (or `z15`)          | Tile host, **without** the trailing `/z`. Manifests are read from `<base>/z/15/<x>/<y>/manifest.json`. `/` = this origin.                                          |
| `tile`                        | Start over the centre of this tile, e.g. `16211/12003`. Required: no index file is read (a host may still serve `index.json`; the game never needs it).            |
| `dx`, `dz`                    | Metres east / south of that centre. Use them to start on a road.                                                                                                   |
| `lat`, `lon`                  | Start at these decimal degrees (WGS84) instead of `tile`; both are required. `dx`/`dz` are ignored. Example: `lat=43.3386&lon=-1.7899`.                            |
| `ll`                          | The same in one value, as Google Maps copies it: `ll=43.3386,-1.7899` (see "Starting by latitude and longitude"). Not combinable with `lat`/`lon`.                 |
| `heading`                     | Compass heading the parked fleet faces, degrees clockwise from north (default 0).                                                                                  |
| `alt`                         | Origin altitude in metres (default 0: the GLBs carry absolute elevations; the vehicles are rested on the real ground).                                             |
| `vehicle`                     | Preset the player starts in: `car` (default), `a3`, `white-truck`, `carrier`.                                                                                      |
| `vehicles`                    | Extra host vehicles after terrain is ready: JSON array of `{lat, lon, heading, vehicle, alt?}`. Same shape as the drive demo; see [Game library](game-library.md). |
| `relief`                      | `engine` (default, drivable, with roads) or `lidar` (2 m LiDAR mesh as ground, experimental).                                                                      |
| `photo`                       | Orthophoto draped on the ground: `full` (4096 px, default), `lo` (1024 px) or `none` (vertex colours).                                                             |
| `sky`                         | `day` (default fixed midday sun), `live` (real clock) or an ISO date-time with zone.                                                                               |
| `time`                        | Time of day as `HH:MM` in the viewer's time zone, on the day of `sky` (default 21 June); `ahora` (or `now`) follows the real clock. See "Time, sea and vehicles".  |
| `sea`                         | Sea level in metres, -5 to 50 (the range of Studio's sea-surface control). Default: the simplified tide (±1 m). See "Time, sea and vehicles".                      |
| `distance`, `memory`, `cache` | Load radius in metres, cells kept in memory and disk cache in MB (see "Cache and load radius"); they override what the menu remembered.                            |
| `player`                      | `hover` (default): on foot you are Studio's floating monitor (1.25 m above the ground); `walk`: a 1.8 m walker.                                                    |
| `layers`                      | Layers to hide: `-road` (road mesh gone, ground photo stays), `-photo`, `-buildings`; `all`/`none`. Also stored in `localStorage`.                                 |
| `quality`, `fps`, `scale`     | As in the other game modes.                                                                                                                                        |

`?example=z15` is an alias that still requires `terrain`/`z15`; without a terrain
location the page says so in Spanish instead of guessing.

A URL **without any query** (or with only display options) plays the default of the dev-server mount:
`?terrain=/terrain&tile=16211/12003&dx=17.4&dz=-197.6&heading=118&vehicle=car`, when the manifest of
cell 16211/12003 answers (one request). `?tiles=` and `?example=flat` keep their original behaviour.

## Starting by latitude and longitude

`?terrain=/terrain&lat=43.3386&lon=-1.7899` (or `&ll=43.3386,-1.7899`) starts the player at that point, which is
inside the Irun package of cell **16221/11998**. A URL with a position and no `terrain=` also works
(`/?ll=43.3386,-1.7899` plays the remembered source, the package folder by default) and replaces the default
road start instead of being mixed with it.

- **Maths** (`src/planet/lat-lon.ts`, export `./planet/lat-lon`): `tileOffsetFromGeo(point)` gives the Web
  Mercator (WebMercatorQuad) Z15 tile that holds the point and the metres east/south of that tile's centre; it is
  the inverse of `tileOffsetToGeo` (so `tile=x/y&dx=&dz=` and `lat=&lon=` describe the same places and round-trip
  to the millimetre). `parseLatLon(text)` reads what people paste: `43.3386, -1.7899` (Google Maps), with a space or
  `;`, a decimal comma (`43,3386; -1,7899`), hemisphere letters (`43.3386 N, 1.7899 W`, `N43.3386 W1.7899`) and
  degrees-minutes-seconds (`43°20'19.0"N 1°47'23.6"W`). Latitude comes first unless letters say otherwise; values
  outside ±85.0511° latitude or ±180° longitude are rejected.
- **Height** is never given: the player starts on the real ground (`waitForGround`) of that cell, like any other start.
- **Menu → "Posición"**: it shows the player's current `lat, lon` (also in the HUD; click it to copy), a
  _Copiar posición_ button, and the field _Ir a latitud, longitud_ with the button _Ir_ (Enter works too). It
  restarts the page at the pasted point, keeping the other URL options (`heading`, `quality`, `layers` ...) and
  dropping the old position (`tile`, `dx`, `dz`, `lat`, `lon`, `ll`). Text that is not a position is explained in
  Spanish in the menu. Positions are never stored; only the source choice is.
- **Holes.** A point over a cell the host does not have behaves like any other hole: the page says in Spanish
  `No hay terreno en la celda x/y …` and offers _Ir a la celda disponible más cercana_ (see below).

## Time, sea and vehicles

The **Planeta** and **Vehículos** menu sections (Spanish) reuse what Studio and the engine already have; no new system was added.

- **Hora** (inside Planeta). A slider (00:00-23:59), an hour field, a time-speed slider (×1–×24) and an _Ahora_ button. They change `SceneDocument.sky` through
  `GameRuntime.setSkyClock`, so the sun, sky, stars, fog and lighting follow on the next frame (the frame loop already
  reads the document every frame). _Ahora_ is the `live` clock. ×1 is wall time; ×24 advances a day per hour from the current sky instant. The hour is the viewer's local time on the calendar
  day of the current clock (21 June by default, today after _Ahora_); the sun position is computed for the player's
  real latitude/longitude. Helpers: `parseClockTime`, `formatClockTime`, `skyClockAtMinutes`, `skyClockAtRate` in `src/planet/sky.ts`
  (export `./planet/sky`). URL: `&time=21:30`, or `&time=ahora`, and `&timeSpeed=12`; the menu keeps the URL in step, so a copied link
  repeats the choice. The default tide is computed from the same clock, so changing the hour also moves the tide.
- **Mar** (inside Planeta). A show/hide toggle, a slider and a number field (-5 to 50 m, 0.1 m steps, as in Studio) set a manual sea level through
  `GameRuntime.setWater`: the ocean sheet (`OceanSheet.setLevel`) and the physics water level (boat buoyancy) use the
  same value. _Marea automática_ goes back to the simplified tide (`worldWater`). URL: `&sea=3`. The sea only shows
  where the terrain lies below that level, so use a coastal start (Hondarribia is near the Irun package) and a level
  of a few metres to see it.
- **Vehículos.** _Añadir vehículo_ puts the chosen catalog vehicle (`vehiclePresets()`: the S3, the A3 cabrio, the white
  truck and the flying container; the passive trailer is left out; the catalog has no plane or helicopter) on the
  real ground in front of the player, facing the same way. `GameRuntime.spawnVehicle(template)` waits for ground
  ahead (`waitForGround`), rests the vehicle at `ground + playGroundClearance(entity)` exactly like the parked fleet,
  then adds it to the running view (`SceneView.addVehicles`), simulation (`Simulation.addVehicles`) and input mixer.
  It can be boarded with `E` like any other vehicle. Each added vehicle is listed with _Quitar vehículo_
  (`GameRuntime.removeSpawnedVehicle`); removal is refused while the player is inside. Limits: added vehicles are
  never towed, and the container has no stern portal (that gate belongs to the editor's catalog entry).
  On `/drive` the menu has the same controls, but that page does not read `&time=`/`&sea=`.
  Operators can also declare extra vehicles in `&vehicles=` (or `VITE_NABLA_VEHICLES`) as WGS84
  `{lat, lon, heading, vehicle, alt?}` entries; after `play()` the page converts them to local metres
  and calls `GameRuntime.placeVehicle`. The single-vehicle `lat`/`lon`/`heading`/`vehicle` params stay
  the possessed start.

## No index: holes and the missing list

No index file is needed, and the game never waits for a total. The engine requests
`<base>/z/15/<x>/<y>/manifest.json` for the cells it wants (`planMapZooms`). When the host answers 404 or 403
the tile is a **hole**: an empty gap in the map, not an error, and loading does not block on it.

`src/planet/missing-tiles.ts` (`MissingTiles`, export `./planet/missing-tiles`) keeps those holes:

- **Persistent record**: `z/x/y`, HTTP status and time, in `localStorage` under
  `nabla.terrain.missing:<base>` (at most 2000 entries). `GameRuntime.missingTiles` returns the list,
  `clearMissingTiles()` forgets it, and the Terreno menu shows it (`Celdas que faltan`, `Volver a pedirlas`)
  as `15/16210/12003 403 2026-10-05T…Z` lines that can be sent to Atlas (the producer) to publish them.
- **Negative cache**: a tile seen missing is not asked for again for 10 minutes (no 404/403 spam while
  streaming); after that it is asked once more and, if it turned up, removed from the list.
- A start position over a hole fails at once (`GroundMissingError`, naming the cell) instead of waiting. The
  page says so in Spanish (`No hay terreno en la celda x/y …`) and offers a button to the nearest cell of the
  host's optional `index.json`, or to the default start when that is published. The position is never
  remembered: it lives only in the URL (the stored choice is the source kind, URL and relief).
- **Not holes**: any other failure (HTTP 5xx, network/CORS, timeout, invalid manifest) is an error. It is retried
  after 15 s and shown on the loading screen (`Peticiones: … · n con error`, `Último error: …`), never silent.

**Tile hosts need CORS.** A page on another origin can only read a manifest if the host answers with
`Access-Control-Allow-Origin`; without it the browser reports a network error (also for the 403 of an absent
tile, so absent tiles cannot be told apart from a blocked host). `https://atlas.chained.world/euskadi/terraform`
currently sends no CORS headers (checked with `Origin: http://100.100.10.1:8703`), so it only works from a page
served from that host or through a same-origin mount.

## Choosing the terrain at runtime

The in-game menu (top right, _Menú_) includes a **Terreno** section:

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
   choice. With none remembered it plays the package folder when the manifest of the default start cell answers, else the flat tile.
3. A remembered _default_ package folder is ignored while its default start cell does not answer; a remembered custom folder
   or tile host is trusted.
4. Changing the kind drops position parameters (`tile`, `dx`, `dz`, `heading`, `lat`, `lon`, `ll`, `alt`); changing only
   the relief or the URL of the same kind keeps them. Other parameters are kept.
5. A tile URL must start with `http://`, `https://` or `/`; otherwise the menu shows a Spanish message and does not
   reload. The field is pre-filled with the active, then the remembered, then the build-time `VITE_NABLA_TILES_URL`, then `DEFAULT_TILES_URL` (`https://atlas.chained.world/euskadi/terraform`).

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
  `Celdas: n cargadas · m faltan` (`· cargando k…` while cells arrive; there is no total). Loading never turns into an error while cells keep
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
lists the cells that have a manifest. It is optional and the game does not read it: the
engine asks for the tiles it needs and a missing one is a hole (see below).

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
  asphalt-<hash>.glb             candidate asphalt (role roads.asphalt; optional)
  supports-<hash>.glb            candidate bridge supports (role roads.supports; optional)
  road-collision-<hash>.glb      candidate collision, inspect-only (role roads.collision; optional)
  ground-lots, ortho, roof, classes, mask-*, roof-ids, far*, instances, roofs, osm, provenance, licenses
```

`src/planet/atlas-z15.ts` (public `@nabla/engine/planet/atlas-z15`) is the adapter.
`fetchTileManifest(tile, { atlas })` reads the manifest with the standard validator,
fetches the package the manifest points to (size and SHA-256 checked, 4 MiB cap, safe
file names only) and returns a manifest the unchanged loader worker consumes.

| Atlas                                                   | Engine                                                                                                                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest.json`                                         | read as is: format, generator, id, tile, anchor (= tile centre, checked to 1e-9), bounds, files                                                          |
| `files.terrain` / `files.buildings-osm`                 | the loader's own layers (`engine.terrain`, `engine.buildings`; the package must name the same path and hash)                                             |
| `terrain.lidar`                                         | with `relief=lidar` replaces `files.terrain`; the worker declares it category `Terrain`, so it is rendered, collided with and draped like engine terrain |
| `ground.composite` / `.lo`                              | `manifest.photo`; draped over terrain, roads, land use and roofs by the existing "Drape" mechanism, replacing the ArcGIS download (`imagery: 'package'`) |
| `roads.asphalt` / `roads.supports` / `road.*.candidate` | `manifest.roads` or Atlas `#49` `roadCandidates.layers`; loaded, rendered and used when present. `drivable` / `engineLoad` are not skip gates            |
| `roads.collision` / `road.collision.candidate`          | inspect-only; loaded only with `&inspectRoads=collision` / `inspectRoadCollision: true`                                                                  |
| `osm.snapshot` (`osm-*.json.gz`)                        | `manifest.osmSnapshot`; in-car GPS street names + vector roads. Offline package only; never Overpass at runtime                                          |
| instances, masks, classes, roofs, roof-ids, far         | listed (`atlasCompatibilityNotes`) but **not consumed yet**                                                                                              |

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
   (and coarser zooms). A tile the host does not have (404, or 403 on S3/CloudFront) is a **hole**, not an
   error: the engine keeps playing around it and records it in `MissingTiles` (see below).
5. **LiDAR is visual relief, not a driving surface.** Its node says `drivable: false`;
   it has no roads, vertex colours or land-use meshes, and its heights differ a few
   metres from the engine's (buildings can float or sink on it). Hence `relief=engine`
   is the default and `lidar` is experimental.
6. Extra manifest fields (`z15Package`, `groundImagery`, `source`, `collision`,
   `palette`, `units`, `axes`, `attribution`, `retrievedAt`) are not rejected by the
   validator and are ignored apart from `z15Package` and optional `roads` /
   `roadCandidates`.
7. **Candidate asphalt/supports load even when marked `drivable: false`.** That flag
   and `engineLoad` are Atlas provenance/acceptance, not an engine skip. The worker
   renders and uses those meshes (Roads collision included) from either `roads.files`
   or `roadCandidates.layers`. The separate collision GLB stays inspect-only
   (`&inspectRoads=collision`) and is not the default driving collider. Road revision
   / `evidenceSha256` is part of the tile cache key.

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
`E` enter/exit, `V` flight, `F` couple, `T` transfer, `H` lights, `G` GPS, `J` menu, `R` recover.

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
