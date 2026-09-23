# Native planetary tile generation and runtime

## One planetary address

Game, editor, remote portal views, and the zoom viewer share `PlanetWorld`. Generated
context is addressed as `WebMercatorQuad/{z}/{x}/{y}`, with storage at
`z/{z}/{x}/{y}/`. Columns increase eastward, rows southward. The supported zooms are
13, 14 and 15, within Web Mercator's latitude limit (approximately ±85.05112878°).
Tiles do not have a fixed physical width and do not depend on a city or scene origin.

```text
z/15/16218/11999/
  manifest.json
  source-<sha256-prefix>.json
  terrain-<sha256-prefix>.glb
  buildings-osm-<sha256-prefix>.glb
```

Downloaded files use `earth-WebMercatorQuad-z15-x16218-y11999-terrain.glb` and the
corresponding `buildings-osm.glb` suffix. Hashes identify revisions, not locations.
The inspector and zoom viewer expose both downloads.

## Generation and transformations

`prepare_planet.py` obtains OSM through the installation's cache. Requests share a
z13 ancestor query, then filter features to the exact requested cell. The publisher
samples Esri elevation on a global lattice: 128 segments at z15, 64 at z14/z13.
Shared samples use the same coordinates and elevation source zoom (12).

Geometry is constructed in a metric Mercator plane and projected once, vertex by
vertex, into the cell's east/up/south frame. GLB coordinates are metres; the anchor
is the geographic cell centre at zero altitude. The runtime applies one rigid root
transform to place each cell in the scene's floating local frame. Physics uses the
same frame and vertices. No 1,200 m intermediate grid, local tile offsets, or
centimetre snapping are involved.

The engine currently uses a mean-radius Earth sphere. This is not a WGS84 ellipsoid
or a conversion between geoidal and ellipsoidal heights. WebMercatorQuad addressing
is standard; accurate geodetic/vertical datum conversion remains future work.

Meshes are batched by rendering category/layer. Linear vertex colours preserve
surface and roof colours. Shared render vertices are indexed without changing their
positions. Feature ranges and source metadata remain in GLB extras. Terrain-edge
skirts hide mixed-resolution cracks; they do not participate in collisions. OSM
trees are metadata instances rendered as crossed, upright, alpha-tested planes.

## Discovery and private preparation

`POST /prepare/tiles` accepts `{ "keys": ["z/15/16218/11999"] }`, at most 24 cells.
It returns available native manifests to every visitor. Only an authenticated owner
session can enqueue missing cells. `/prepare/session` and `/prepare/status` retain
the existing private cookie protocol. `/prepare/zones` returns 410.

The durable `planet_jobs` queue is separate from retired local-grid jobs. One worker
prepares cells, with bounded retries, capacity and retention. Sources and layers are
written atomically, with `manifest.json` published last. Manifests include exact
bounds, anchor, attribution, hashes and byte counts. The browser verifies GLB size
and SHA-256, then caches the content-addressed asset locally. Missing cells are a
pending state, not speculative requests for legacy BIN/JSON files.

Expose `/prepare/tiles` in the reverse proxy as well as session/status. Serve
`/prepared/z/` publicly, but never expose the generation token or arbitrary upstream
proxy. Independent installations choose their own storage and credentials.

## Streaming and interaction

The stream requests near cells, parent fallbacks, an anticipated movement position,
and cells supporting parked vehicles/portals. A parent remains visible until its
required children are ready. Worker threads fetch, decode and spatially partition
GLBs. Buildings can be disabled independently, avoiding their download and collision
work. Resident cache retention and fetch concurrency follow performance settings.

Collision chunks are made from the GLB triangles, not a parallel legacy heightfield.
Only chunks within 65 m of an actor become convex triangle prisms; Cannon's box
vehicles cannot use Trimesh for all required contacts. Construction has a per-frame
budget and coverage swaps atomically. The chunk working set is reused within an 8 m
movement cell. High flight does not instantiate distant ground colliders.

Play displays Loading and ignores repeated activation while waiting for ground and
nearby colliders. Exit likewise displays its transition. The map is generated
context, not thousands of editable scene entities. Migration preserves authored
objects and explicitly customized map entities, including their world pose when a
generated parent is removed. Existing scene files remain user data.

## Operation

```sh
npm run build:prepare
python3 services/world-cache/prepare_planet.py z/15/16218/11999 /path/to/planet-cache \
  --cache-base http://127.0.0.1:8080 \
  --publisher prepare-dist/services/world-cache/prepare-planet.js

VITE_WORLD_PREPARED_URL=/prepared VITE_WORLD_PREPARE_API=/prepare npm run build:demo
```

For offline regeneration, pass a complete source (including elevation) directly to
`prepare-planet.js`. Keep the previous frontend, worker image and old cache through
the rollback window; the new runtime does not read the legacy cache.

## Validation and remaining limits

Tests cover canonical identities, boundaries, complete parent replacement, source
precision, migration of authored content, private queue access, retention, GLB
loading, driving collisions, downloads, zoom changes and Play/Exit transitions.
Real server generation is checked separately from mocked browser tests.

Cold areas require server generation and are not instant or prebuilt worldwide.
Public visitors cannot generate arbitrary new regions. Three zooms reduce terrain
sampling density, but building topology is still detailed and dense-city far LODs
can be improved further. Shared-vertex indexing and batching are not mesh
simplification or meshopt compression. Cross-tile editable topology, independent
feature extraction from a batched GLB, polar coverage, and geodetic datum accuracy
are separate future work.

## Elevation-only horizon and transport revisions

The native stream also requests a lightweight, independent elevation-only horizon.
It uses z13 XYZ cells, a 32-segment lattice, the same z12 Esri rasters and tile-local
planetary frame as the detailed GLBs. It does not wait for OSM or private generation.
Up to 25 nearby cells are retained, with two requests in flight and raster caching.
The default fog/clip range leaves this broad valley silhouette visible independently
of the detailed-map draw distance.

Each relief cell is partitioned on z15 boundaries. Active GLBs remove the corresponding
relief triangles from both rendering and collisions; there is no overlapping green
plane beneath the detailed surface. Nearby fallback triangles supply collision support.
Resting actors are raised when a more detailed surface arrives above their old support.
This is approximate ground, not a substitute for detailed road geometry; unavailable
upstream elevation is retried and cannot be fabricated locally.

`geometryRevision: transport-union-v1` identifies roads with shared bend cross-sections
and a unioned footprint. End caps no longer remain separate coplanar discs after
spherical projection. Old GLBs remain readable during regeneration. Owner discovery
queues stale revisions, and the client replaces a resident revision when the new
content-addressed manifest is published.

### Cockpit navigation charts

The GLB loader worker rasterizes the `Roads` mesh category into a transparent
1024 × 1024 blue chart once per loaded cell. The transferred bitmap stays with
that resident cell, counts toward its memory budget, and is closed on eviction.
Cockpit charts share the main world's visible tile coverage and local tile poses;
they redraw at 4 Hz without another WebGL camera or another map request. Authored
road entities remain supported. This is a schematic map of loaded transport
surfaces, not a route planner or a live aerial video. Gameplay HUD and mouse hints
sit above the WebGL canvas and CSS3D screen cutouts and do not intercept clicks.
