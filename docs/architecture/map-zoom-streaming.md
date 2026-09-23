# Standard map tiles and three flight zoom levels

## Decision

Use OGC **WebMercatorQuad**, with XYZ addressing (`z/x/y`, rows increasing
southwards), for new generated map artifacts. The canonical engine identifier is
`WebMercatorQuad/<z>/<x>/<y>`. Do not create another fixed-metre grid. Latitude,
longitude and altitude remain the coordinates of authored objects; the map's
projection is an indexing/rendering concern, not a replacement for world poses.

Sources:

- https://docs.ogc.org/is/17-083r4/17-083r4.html
- https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames

The initial flight levels are **15, 14 and 13**. At Irún these have approximate
ground widths of 0.89, 1.78 and 3.56 km. Width varies with latitude; 256/512 pixel
imagery tile dimensions do not prescribe mesh resolution. A zoom-13 parent covers
exactly four zoom-14 children, each of which covers four zoom-15 children.

Web Mercator does not cover the poles (latitude beyond ±85.05112878°). Those areas
must use a separate matrix/globe representation. Never silently clamp a polar
object to a Mercator boundary. Matching this addressing scheme does not imply
that our GLBs implement OGC 3D Tiles, or that upstream providers permit unrestricted
bulk downloads.

## Implemented foundation

`src/map-tiles.ts`, exported by the engine, provides canonical identifiers,
geographic bounds, parent/child relationships, latitude-dependent scale, and a
bounded three-zoom selection plan. It supersedes the proposed `earth-bands-v1`
custom grid for future artifacts; that API remains readable for compatibility.

`planMapZooms` selects a nonoverlapping quadtree cover. Initial refinement bands
are 3 km for zoom 14 and 1 km for zoom 15, measured using ground distance combined
with height **above terrain**, not absolute GPS altitude. These are initial tuning
values, not a measured performance promise. Requests contain ancestors first so
coarse coverage can arrive before detail. The default limit is 96 visible leaves;
request count can be larger because fallback ancestors must also be retained.
A `budgetLimited` result explicitly reports curtailed coverage. Local ground
scale is used for prioritization; this is not an exact geodesic distance API.

`readyMapCover` retains a ready parent until every required child subtree has a
ready cover. It never returns both a parent and its descendants. When a root has
neither a complete descendant cover nor a ready parent, it returns no geometry
for that root: the renderer must retain its separate globe fallback. The caller
must retain prior visible resources when camera movement changes the plan; this
function does not own network requests, GPU memory or the previous frame.

Tests cover canonical IDs, shared boundaries, longitude wrapping, all three
levels, readiness transitions, height and budgets. **This is not yet wired into
the production renderer or server generator.** Existing 1,200 m GLBs continue to
use their original addressing and transforms. No cache or saved scene is relabelled.

## End-to-end migration contract

1. **Produce canonical geometry.** Query/clip against XYZ bounds, sample shared
   boundaries from the same geographic coordinates, and generate vertices in a
   stable per-tile frame. Use a new artifact namespace; an old tile's centre
   cannot identify its new footprint. Preserve authored objects independently.
2. **Generate three spatial scales.** Zoom 15 contains detailed ground and
   buildings. Zoom 14 and 13 need genuinely simplified meshes, fewer render
   batches and retained visual road/landcover detail (baked textures where useful).
   Merely joining four full-resolution GLBs is not simplification. Preserve coast,
   road continuity and silhouette; record geometric error and triangle/byte counts.
   Do not require a 10 cm coordinate lattice. Near surfaces retain source geometry.
3. **Publish independent layers.** Example path:
   `world/WebMercatorQuad/15/<x>/<y>/terrain.glb`, alongside
   `buildings-osm.glb` and `manifest.json`. A download name such as
   `nabla-earth-WebMercatorQuad-z15-x16218-y11999-terrain.glb` is globally meaningful.
   Manifest metadata includes matrix/coordinates, bounds, local frame, source and
   generator revisions, per-layer hashes, bytes, bounds and geometric error.
   Publish immutable content before the manifest; invalidate parents when source
   children change. Keep legacy cache retention separate during rollout.
4. **Stream without blocking.** Fetch coarse coverage first, then refine with
   bounded network/decode/upload queues. Re-evaluate on tile/height-band changes,
   not every render frame. Use hysteresis to avoid oscillating between levels and
   prefetch along flight velocity. Preserve the old visible cover while replacements
   load; failures cannot erase usable ground. Budget GPU bytes as well as tile count.
5. **Render and simulate separately.** Distant levels are batched visual geometry,
   absent from the editable entity tree and physics. Near collision data has its
   own lifetime. Hide overlapping fallback regions, stitch mixed-resolution edges,
   and keep original building visibility settings. Independent portal cameras need
   their own cover while sharing immutable decoded assets.
6. **Measure before switching production.** Compare one camera path with identical
   settings: frame-time percentiles/long tasks, decoded bytes, GPU residency,
   triangle/draw counts, initial coverage time and time to refine. Test high-speed
   Irún–Zamora travel, teleports, multiple scene origins, saved edits, empty caches,
   failed child loads, dateline crossings and building-disabled flight. Roll out
   behind a setting until visual continuity and performance are demonstrated.

The existing anchored-grid loader must not be removed until canonical generation,
server queue validation, retention and the new runtime loader work together.

## Deployed pilot scope

`zoom-lab.html` is a separate visual experiment, not a switch of the playable
world's loader. `export-xyz-pilot.ts` clips resident legacy geometry into actual
XYZ bounds, exports independent ground/building layers at zoom 13–15, batches by
layer/material, and records triangle/byte counts. Coarser meshes use conservative
vertex clustering, preserving open boundaries; the near level is not quantized.
This does **not** yet provide an error-bounded mesh simplifier. Long narrow road
meshes retain many boundary vertices, so expected triangle savings are limited.

The catalog explicitly declares partial coverage. Missing cells outside that
finite catalog mean empty space only in the pilot; production must distinguish
missing/unprepared data from genuinely empty map cells. The pilot crops legacy
extraction margins, including buildings, and is not an editor/physics migration.
It must not be used to overwrite authored scenes or the production prepared cache.
The full migration contract above remains outstanding.

### Production pilot verification (2026-09-23)

Available at `https://chained.world/zoom-lab.html`, linked from `tile-lab.html`.
The first catalog contains 27 XYZ cells across three zooms, generated offline from
three existing Irún source tiles. Source bins, production preparation worker and
Studio's entry point were not replaced. Publication used content-hashed GLBs,
then the catalog, then the viewer and laboratory link.

Verified all three levels in Chromium on the public domain, GLB download links,
no page exceptions, and HTTP 200 for Studio and the existing tile lab. All 310
unit tests, the new browser test, type checking, preparation compilation and
production frontend build passed. Local screenshot inspection confirmed that
roads, buildings and landcover render. This is a coverage/transition prototype;
no claim is made that long-distance flight performance is solved. The coarse
meshes still need considerably stronger simplification or baked surface detail.

## Initial game integration

The game now uses `XyzWorld` to stream available generated zoom layers; the editor
retains its original individually editable entities. Public layer URLs have the
shape `z/<zoom>/<x>/<y>/<layer>-<hash>.glb`; the canonical identity still names the
OGC matrix. Detailed simulation/collision data continues to use the existing
loader. This is a visual integration, **not** completion of the canonical server
preparation/physics migration.

A generated region replaces drawing only when every intersecting cell is ready.
A shader mask clips XYZ rendering to those regions and removes the coarse horizon
underneath. Original render batches omit replaced entities; trees, impacts and
customized regions remain on their existing path. Building visibility settings
apply to both paths. Leaving Play clears the mask and restores editor meshes.
GLBs are checked against catalog sizes and SHA-256 hashes, with one request job
at a time, a resident download-byte budget, retry backoff and disposal on travel.
The byte budget is not a precise GPU-memory measurement.

Coverage still consists of the three prepared Irún source tiles. Elsewhere the
existing streaming system remains active. Do not claim that visiting a new city
will automatically create XYZ artifacts yet. Coarse geometry reduction still
requires further work before claiming a long-distance performance improvement.

Play/Stop now have a shared asynchronous transition lock. They show `Loading…`
and `Saliendo…`, disable repeated activation (including keyboard/menu commands),
and yield a frame before the synchronous simulation construction/disposal.
This makes the status visible; it does not move physics initialization to a worker
or guarantee that initialization itself is nonblocking.
