# Native planetary tile generation

## Status

The native **server generation** route exists and has automated boundary and geometry tests.
It does not consume a 1,200 m prepared tile, a saved scene, or a local tile offset.
**The production game, automatic preparation queue, collision stream, and XYZ pilot still use
parts of the previous pipeline. This document does not mark that migration complete.**
Do not delete the old cache or switch production to these render-only artifacts yet.

## Identity and storage

A cell is identified by `WebMercatorQuad/{z}/{x}/{y}`. Its directory is
`z/{z}/{x}/{y}/`. Rows increase southward; columns increase eastward. The matrix covers
latitudes up to approximately ±85.05112878 degrees. A tile has angular/projected bounds,
not a constant physical width. The first supported zooms are 13, 14, and 15.

Example directory:

```text
z/15/16218/11997/
  manifest.json
  source-<sha256-prefix>.json
  terrain-<sha256-prefix>.glb
  buildings-osm-<sha256-prefix>.glb
```

A downloaded terrain file is named
`earth-WebMercatorQuad-z15-x16218-y11997-terrain.glb`. The building layer uses the same
stem and `buildings-osm.glb`. A content digest denotes a revision, never a location.
A filename or path does not depend on Madrid, Irún, the editor cursor, or the scene origin.

## Native source and projection

`prepare_planet.py` requests OSM for the exact XYZ bounding box through the owner's cache.
It reuses only the addressing-independent OSM query/relation normalizer. It passes a
`nabla-planet-source-v1` source to `prepare-planet.ts`, which fetches Esri elevation and
builds the terrain and building layers directly.

Elevation samples use an integer global lattice. Adjacent tiles and matching parent/child
samples evaluate the same longitude/latitude expression. All levels sample the same source
elevation zoom (12); they do not query different elevation pyramids at shared vertices.
The current sample counts are 128 segments at z15 and 64 at z14/z13. These are terrain
sampling densities, not centimetre quantization. No 10 cm position snapping is applied.

Geometry is constructed in a metric Mercator plane, then **every vertex** is projected to
the tile's local east/up/south frame on the engine's existing mean-radius Earth sphere.
The anchor is the tile's geographic centre at zero altitude. Heights are metres above the
provider's vertical reference, not relative to the user's current location. Earth datum
and vertical datum integration remain a separate concern; this is not a WGS84 ellipsoid
or an orthometric-to-ellipsoidal height conversion.

GLBs retain named meshes, source metadata, colours, roof colours, and rendering layer
metadata. `renderOnly: true` is deliberate: the exporter does not advertise the old flat
construction scene as a valid collision mesh or editable scene after spherical projection.
Trees and other sprite assets are not yet part of these two mesh layers.

## Atomic publication

Layer and source files are content-addressed. Each is written through a temporary file
and renamed; `manifest.json` is replaced last. The manifest records exact bounds, anchor,
full SHA-256 digests, byte sizes, suggested download names, source revision, and attribution.
An interrupted generation must not point the current manifest at a partial revision.
Old content-addressed revisions are not deleted by this command. Retention belongs in the
queue/cache rollout, with a grace period for readers of the previous manifest.

## Running on the owner server

```sh
npm run build:prepare
python3 services/world-cache/prepare_planet.py z/15/16218/11997 /path/to/planet-cache \
  --cache-base http://127.0.0.1:8080 \
  --publisher prepare-dist/services/world-cache/prepare-planet.js
```

The command uses the existing authenticated/private cache deployment; it does not introduce
an unauthenticated public generation endpoint. Server hostnames, credentials and deployment
paths do not belong in the repository. Independent installations choose their own output root.

For offline regeneration from a complete source including elevation:

```sh
node prepare-dist/services/world-cache/prepare-planet.js source.json /path/to/planet-cache
```

## Required cutover work

- Replace local queue identities and requests with canonical XYZ IDs. Retire local `x_z`
  lookups rather than probing every legacy format when a global tile is absent.
- Add bounded availability/status discovery so a missing tile is a pending state, not a
  cascade of speculative `.bin`, `.json`, and manifest 404s.
- Connect the game/editor to native manifests. Retain a parent until all required children
  are ready; enforce network, memory, and per-frame installation budgets.
- Supply collision data in the same geographic frame. Validate driving across tile edges;
  flat legacy heightfields cannot simply be renamed and reused.
- Stitch mixed-resolution terrain edges (or use a verified skirt strategy), and coordinate
  boundary normals. Identical matching samples alone do not eliminate coarse/fine T-junctions.
- Add distant building simplification/merging. A broader tile with fewer elevation samples
  alone does not make a dense city's buildings cheaper to render.
- Preserve custom objects, edited map features and required parent frames during migration.
  Regenerate untouched environment data. Do not reinterpret local offsets as XYZ indices.
- Replace the finite pilot catalogue and remove the legacy active stream only after the
  native pipeline has passed travel, flight, collision, scene save/load and rollback checks.

The cutover must be tested with independent generation of neighbouring cells, all three
zooms, at least two cities, a saved custom object and a portal between distant locations.
