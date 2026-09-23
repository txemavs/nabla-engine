# geoEuskadi road-area pilot

This implements the **data audit and visual comparison** slice of issue #22. Open
`/geoeuskadi.html` to switch between OSM road ribbons and official BTA road polygons
on the same existing Esri terrain in Irún / Ventas. The camera stays in place when
switching. Buildings are optional. It renders only on camera/UI changes.

The comparison remains a laboratory. A separate drivable combined starter is now
available; see **Drivable combined pilot** below. It does not change the default
worldwide source preset or existing saved scenes. Regional rollout still requires
the reconciliation and elevation work below.

## Verified product

- [BTA5 dataset and licence](https://www.geo.euskadi.eus/base-topografica-armonizada-a-escala-1-5-000-de-gobierno-vasco-bta/webgeo00-dataset/es/):
  the catalogue states CC BY 4.0, data period January–December 2025 and catalogue
  update 9 March 2026. This is not proof that every service feature changed then.
- [Layer 59: road surfaces](https://www.geo.euskadi.eus/geoeuskadi/rest/services/U11/KARTOGRAFIA_CAS/MapServer/59):
  polygons, queried as GeoJSON in EPSG:4326 (longitude, latitude). The service's
  native map extent is Web Mercator. These returned coordinates are **XY**, not
  surveyed bridge or terrain elevations.
- [BTA dictionary, pages 29–35](https://www.geo.euskadi.eus/cartografia/DatosDescarga/Documentacion/BTA/BTA_GV_2022.pdf):
  `SITUACION=SUP` means surface, `ELE` elevated, `SUB` underground;
  `ESTADO=USO` means in use; `COMPONEN2D=CGN` is generic visible geometry, `POC` hidden.
  The adapter accepts only SUP + USO + CGN. Unknown/null states are excluded.
- Visible attribution: **Eusko Jaurlaritza / Gobierno Vasco. geoEuskadi. Adapted by
  Nabla. CC BY 4.0.** OSM and Esri attribution remains visible separately.

The committed snapshot queries the rectangle `[-1.825,43.325,-1.81,43.335]`, with
38 returned features. Five are not explicitly at surface level and five are hidden
or unclassified. Twenty-seven polygon parts intersect the existing terrain tile.
Geometry may extend past the query rectangle: a spatial query returns intersecting
features, not clipped polygons. Rendering clips to the existing terrain bounds.
This rectangle is an **import extent**, not a guarantee of complete road coverage.
BTA layer 59 is not a substitute for all OSM residential streets and footpaths.

## Rebuild

From the repository root, using Python 3 and the project's Node version:

```sh
python3 services/world-cache/import_geoeuskadi.py \
  --output assets/geography/geoeuskadi-ventas.json
npm run build:prepare
node prepare-dist/services/world-cache/prepare-pilot.js \
  assets/geography/irun-ventas.json \
  assets/geography/geoeuskadi-ventas.json \
  assets/geography/geoeuskadi-pilot
npm run build:demo
```

The importer snapshots all matching OBJECTIDs and fetches them in batches of 100,
with a 250 ms pause between batches. It rejects incomplete batches, duplicates,
invalid geographic geometry, open rings and a changed ID set at the end. Requests
have a timeout and byte budget; imports are limited to 0.03 degrees per axis and
4,000 features. Use official bulk/sheet downloads for regional preparation instead
of lifting these bounds to query the whole region live.

An ID-list check cannot detect an in-place geometry update that retains all IDs.
The output is a dated content-hash snapshot, not a transactionally consistent
upstream revision. OBJECTIDs are revision-scoped and must not identify persistent
user edits across imports without reconciliation.

Failed imports leave the previous file intact. Retry the command after checking the
error; there is no automatic regional polling or import queue in this pilot.
The source fixture keeps only structural fields and the road code. It does not
carry addresses or long multilingual labels.

The offline TypeScript preparation uses the engine's existing OSM geometry,
geographic conversion and terrain-triangle draper. Polygon holes remain empty.
Surface heights use the existing terrain plus the same 35 mm visual offset as
roads, with millimetre coordinate quantization. No extra collision meshes are
created. OSM and official road meshes are mutually exclusive in the comparison.
This is **not** yet spatial matching or selective OSM replacement.

## Artifacts, serving and rollback

`manifest.json` records provider, dataset, source revision, recipe, origin, query
bounds, attribution, exclusion counts and geometry ranges. The `.pack` file is a
gzip-compressed little-endian Float32 buffer: nine values per vertex (XYZ, normal
XYZ, linear RGB), non-indexed triangles, grouped into terrain/OSM/official/buildings.
The manifest ranges are byte offsets and vertex counts. The browser verifies the
compressed SHA-256, decompresses and checks length before GPU upload. This format
is specific to the visual audit; it does not change prepared-world format 5.

The initial comparison is approximately 3.0 MiB downloaded / 14.2 MiB decoded,
including both road alternatives and buildings. Terrain + the selected road layer
use two draw calls; buildings add one. These are laboratory mesh counts, **not**
measurements of full-game flight performance. Geometry generation happens offline.

Serve `.pack` as an ordinary binary file **without Content-Encoding: gzip**: the
browser decompresses it explicitly. The unusual extension avoids automatic `.gz`
handling by development/static servers. Serve the manifest with revalidation;
content-hashed packs can be immutable. Keep previous packs during publication.
Upload the pack before replacing its manifest atomically. Restore the previous
manifest to roll back. Keep the source snapshot too if a reproducible rebuild is
required.

A demo deployment needs `geoeuskadi.html`, its built JS/CSS chunks and
`geography/geoeuskadi-pilot/`. The source fixture is not fetched by the viewer.
No browser request goes to geoEuskadi. This pilot can be served alongside the
existing demo without replacing its index or server cache service.

## Validation and next gates

```sh
python3 -m unittest discover -s services/world-cache -p test_geoeuskadi.py
npm run check
npm run build:prepare
```

Tests cover paginated completeness, upstream changes, failed-write preservation,
polygon holes, draping accuracy, geographic coordinates and unsafe vertical states.
A browser test checks both source modes, camera controls, buildings and absence of
remote provider requests. Test the built page over HTTP(S), not `file://`.

Still required before the main-world enhancement preset:

1. Validate official DTM acquisition, vertical datum, resolution and shared tile edges.
2. Reconcile BTA surfaces with OSM centerlines/semantics; preserve OSM for unmapped
   streets, bridges and outside coverage. Clip replacement masks to avoid duplicates.
3. Make rendering and driving support agree through road junctions and layer changes.
4. Extend persistent scene provenance, feature classification, recipe/cache identity
   and authored override reconciliation. `src/map-provider.ts` currently defines
   normalized **import** provenance; it does not change the saved scene schema.
5. Plug preparation into the durable queue and benchmark the real Irún–Hendaye flight
   route before regional rollout. No LiDAR mirror, automatic provider switch or new
   collision behavior is implied by this visual pilot.

## Drivable combined pilot (second slice)

Open `/?world=geoeuskadi`, or **Archivo → Irún · Ventas · OSM + geoEuskadi**.
This opens a new starter scene, like the existing OSM starter; save/export any
current work first. It is not a hot provider toggle on an authored scene.
The launch parameter is consumed after loading so a later reload can restore the
saved scene instead of overwriting edits with the starter again.

The prepared pilot combines **only the initial Ventas tile**. OSM continues to
supply surrounding streamed tiles. The original OSM baseline fingerprint is retained,
so existing streaming treats the combined tile as modified/pinned and cannot replace
it with a global cached tile. This costs one resident tile even when traveling away;
regional source-aware streaming and versioned overrides remain future work.

Preparation unions valid official ground polygons, clips them to the terrain tile,
and subtracts that mask from overlapping OSM ground-road footprints. OSM roads that
do not overlap are untouched. The footprint uses the same segment rectangles and
12-sided joint caps as the raw road renderer. Remaining OSM surfaces retain their
colors and footpath offset. This is **coverage subtraction**, not a semantic match:
OSM shoulders wider than the official polygon remain. Narrowing roads to BTA widths
requires a later centerline/feature match and replacement envelope.

OSM bridges, tunnels, nonzero layers and smooth-float roads are not cut or changed.
Official elevated, hidden or unknown features are not projected onto the ground.
The ground-road centerline entities retain their IDs and simulation properties;
`road.renderSuppressed` hides only their old ribbon rendering. New surface chunks
have `motion: none`, with terrain as the single collision support. This does not
improve the existing terrain's vertical accuracy or implement new bridge profiles.
The existing 35 mm rendering offset (25 mm for footpaths) is retained.

The scene source schema now also accepts geoEuskadi dataset/revision provenance.
OSM source IDs still validate as node/way/relation IDs. Official polygons are merged
for rendering, so their scene provenance identifies the dataset union; native
per-feature identity remains in the source snapshot. Selecting individual official
road records and editing them is not implemented in this slice.

Rebuild on the preparation machine/server:

```sh
npm ci
npm run build:prepare
node prepare-dist/services/world-cache/prepare-driving-pilot.js \
  assets/geography/irun-ventas.json \
  assets/geography/geoeuskadi-ventas.json \
  assets/geography/ventas-combined.pack
npm run build:demo
```

The `.pack` is gzip-compressed JSON containing the scene and prepared render buffers,
using the existing prepared decoder version 5 plus the separate
`ventas-combined-roads-v1` recipe. It is about 6.3 MiB compressed, 23.6 MiB decoded in
the initial fixture. No polygon operations or mesh generation run in the client's
initial load. JSON decoding, validation, GPU upload and simulation initialization
still happen there. This is not the future binary prepared-world format.
Serve it without a `Content-Encoding` header; load revalidates it. Publish a temporary
pack and rename it atomically before publishing the matching frontend. Keep the
previous pack/index for rollback. Neither the global `/prepared` namespace nor the
queue service is changed. The committed pack allows a fresh clone/demo build to run
without access to the live provider; regenerating it is an explicit operator action.
