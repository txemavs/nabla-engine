# Real-world driving: Streets GL integration review

Status: incremental OSM/Esri neighborhood streaming is implemented around the Irun Ventas start. The Streets GL adapter and planetary streaming architecture below remain future work; see the implementation sections at the end.

The product direction is to drive and fly through real geography, with selective
local editing. The authored circuit remains a test scene. A whole city should not
be rebuilt manually in the solid editor.

## Source review

Reviewed Streets GL `dev` at commit
[`2412c8ea85ea221356f0fe103e7a412743224120`](https://github.com/StrandedKitty/streets-gl/tree/2412c8ea85ea221356f0fe103e7a412743224120).

- The [project README](https://github.com/StrandedKitty/streets-gl#readme) documents
  OSM-derived vector tiles, a modified Planetiler pipeline, Esri Terrain 3D and
  browser-side geometry generation. Its manually updated tile cadence is a
  project statement, not a freshness guarantee checked by this review.
- `src/lib/tile-processing/vector/providers/CombinedVectorFeatureProvider.ts`
  currently selects `PBFVectorFeatureProvider`. The other instantiated providers
  are not the active collection path. `Config.TilesEndpointTemplate` points to
  `https://tiles.streets.gl/vector/{z}/{x}/{y}`.
- The decoder consumes processed fields such as `height`, `minHeight`, `levels`,
  `roofShape`, `color`, `material`, `isPart`, `osmType` and `osmId`. It is not safe
  to substitute arbitrary vector tiles and expect the same feature semantics.
- `src/lib/tile-processing/tile3d/providers/Tile3DFromVectorProvider.ts` separates
  collection, Mercator scaling, height sampling and geometry generation. It still
  imports application utilities: extraction requires an adapter, not merely an
  npm install.
- `Tile3DBuffers.ts` separates extruded, projected, terrain-following, instanced
  and label output. Positions, normals, UVs, texture IDs and color buffers offer
  a concrete boundary for a Three.js adapter. Matching the original appearance
  also requires compatible materials, textures and terrain projection behavior.
- `src/app/terrain/EsriElevationFetcher.ts` fetches Terrain3D and decodes LERC.
  A raster basemap cannot substitute for these height samples.
- The reviewed navigation code samples terrain height. It does not provide the
  vehicle collision integration Nabla needs. Rendering roads is not sufficient
  to make them drivable.

The upstream code is [MIT licensed](https://github.com/StrandedKitty/streets-gl/blob/dev/LICENSE).
Retain its notice when adapting code. [OSM data licensing and attribution](https://www.openstreetmap.org/copyright)
are separate from the code license. Esri service terms and attribution also remain
separate. Public endpoint availability, browser CORS and permitted production use
have not been verified here; configure providers rather than making the public
Streets GL service an irreplaceable production dependency.

## Proposed ownership

```text
OSM vector provider + elevation provider
                  |
          bounded tile streaming
                  |
        worker geometry generation
                  |
       geographic / local-metre adapter
                  |
         +--------+----------+
         |                   |
     Three.js view     nearby physics geometry
         |                   |
         +--------+----------+
                  |
     Nabla vehicles, flight, portals and editor
                  |
       persistent local world overrides
```

Keep one renderer and one physics owner in Nabla. Adapt useful upstream generation
modules rather than embedding a second independent viewport. This preserves the
camera, vehicle assets and remote portal rendering. Visual parity is a separate
acceptance target; copying polygon buffers alone will not reproduce Streets GL's
full lighting and material pipeline.

The present `GeographicView` loads imagery over a spherical surface; it does not
load street geometry or elevation. `Simulation` creates scene colliders at startup.
Both need runtime tile lifecycle support. Loading map tiles must not rebuild the
simulation, reset cars or contaminate undo history.

## World data versus authored edits

Streamed map content is a cache, not thousands of saved scene entities. Keep it
outside the current 2,000-entity authored scene document. Select a map feature by
its OSM type and ID. Multi-part buildings additionally need stable part identity;
tile coordinates alone cannot identify an edited building across reloads.

A local override records the source identity, provider/dataset version or content
fingerprint, geographic anchor and one of: appearance override, hidden source,
or replacement authored entity. The replacement uses the solid editor. New cars,
portals and other catalog objects remain authored entities with geographic anchors.
Editing a map feature does not publish changes to OpenStreetMap.

Deduplicate features across tile boundaries. Apply an override to every rendered
fragment of its source. On source changes, preserve the authored replacement and
flag a conflict rather than silently discarding it. Clone produces a new authored
entity, without hiding or modifying the source building.

## Driving and flight requirements

- Convert Mercator coordinates and scale factors to physical metres exactly once.
  Nabla uses a mean-radius spherical geographic frame; explicit conversion is
  necessary to avoid latitude-dependent vehicle sizes and speed errors.
- Reuse elevation samples for rendering and colliders. Reconcile vertical datums,
  geographic altitude and local ground clearance; a nominal Madrid altitude of
  zero is not a real terrain measurement.
- Build simplified collision near actors, with terrain heightfields and suitable
  road/building meshes. Keep detailed distant scenery visual. Do not instantiate
  the current per-triangle solid collision for an entire city.
- Treat bridges, tunnels and stacked roads as separate surfaces, not merely a
  single terrain heightfield. Make missing metadata and fallback behavior explicit.
  (Bridges now have matching deck geometry and collision; tunnel cutouts remain deferred.)
- Prefetch in the direction of travel. Switch render/collision tiles atomically
  at simulation boundaries and retain support beneath vehicles until replacements
  are ready. Missing or failed data must not become a hole under the car.
- Rebase physics as well as rendering during long trips. Decrease map detail during
  ascent; transition to the existing globe at altitude. Portal destination views
  need a bounded remote streaming budget rather than unbounded world duplication.

## First playable milestone

The first district is Irun Ventas, selected by the user. A future streaming version
will allow selecting other districts through the GPS controls.
Load actual road outlines, building footprints/heights and terrain. Place the A3 on
a valid drivable surface after ground data arrives. Preserve the authored circuit
as a separately selectable test scene; do not overlay it onto the real streets.

Acceptance:

1. Drive across several adjacent tiles without resets, missing ground or visible
   vehicle-size changes; climb a measured slope with matching wheel contact.
2. Fly above the district and return to the same street with coherent elevation.
3. Select a real building, recolor or replace it, leave the area, reload and return:
   the change persists and the source geometry does not reappear underneath.
4. Exercise a building spanning tiles, a courtyard, a multi-part building and a
   bridge; display unsupported cases explicitly rather than claiming full coverage.
5. Simulate slow and failed tile requests. Bound memory and request concurrency;
   retain safe physical support and show loading state.

Only after this milestone should the scope expand to longer drives, richer roofs,
vegetation, furniture and remote portal destinations. Planetiler preprocessing and
self-hosted tile service deployment are later infrastructure decisions, not work
required on every user's machine.

## Implemented first district: Irun Ventas / Katea

The first playable slice now starts on **Irurzunzar in Ventas / Katea, Irun**:
43.329690 N, 1.819606 W. The bundled elevation sample at the anchor is approximately
28.253 m. Fresh sessions open this district; the **Irún · Ventas** button reloads
its baseline. The previous circuit remains under **Escena A3** and the explicit
`?scene=circuit` development/test route. Existing saved data is not overwritten
until the user chooses Save; the first district introduction is tracked separately.

The Streets GL public vector endpoint returned HTTP 403 from this development
environment. The starting zone uses one bounded extract from the official OSM
map API and predecoded Esri Terrain3D samples. Adjacent zones use Overpass and live
Esri elevation requests, as described below. It does **not** claim live Streets GL
tile streaming or full visual parity with its materials and roof generation.
No map-service request is needed to play the bundled district.

Each physical terrain zone covers **1,200 × 1,200 metres**, sampled on a 121 × 121 grid.
The visible mesh, road draping and Cannon heightfield share the same triangulation.
Road outlines are clipped against terrain triangles before rendering, so asphalt
does not cut through a differently tessellated slope. Near the ground, a boundary
constraint stops vehicles and the monitor before an unloaded edge. Shared edges
between resident zones are traversable. Flight anticipates new ground zones too;
local ground fetching pauses above 12 km.
The globe fallback collider sits below the local terrain, rather than filling its
valleys with an invisible flat support surface.

The starting extract produces over 370 building entities; centroid ownership keeps
buildings crossing a zone boundary whole and prevents duplicate buildings. Footprints come from OSM;
`height`, `min_height`, level counts and hexadecimal building colors are interpreted.
Missing heights use explicit defaults (3 m per level; three levels for ordinary
buildings, two for industrial buildings). Approximately rectangular, single-ring
footprints support tagged gabled, hipped and skillion roofs as editable solid geometry.
Total building height includes the roof; `roof:height` sets the rise, otherwise it is
inferred from footprint width (capped at 3 m). Ridge orientation follows the longer
footprint axis; explicit roof direction/orientation tags are not interpreted yet.
Unsupported shapes and complex footprints retain flat roofs. Closed-member
multipolygons are supported; incomplete/split-member relations and other roof forms
remain unsupported. Construction and step roads are omitted; bridges use estimated
elevation profiles and tunnels remain metadata until terrain cutouts exist. The elevation source is terrain, not
a surveyed road surface model. The remaining streets follow it, including unmodeled
grade changes.

### Landcover and water from OSM

Landcover polygons are now extracted from OSM `landuse`, `leisure`, and `natural` tags.
Each polygon is draped onto the terrain with a slight vertical offset to avoid z-fighting.
Surface types are classified and rendered with distinct colors:

| OSM Tag(s)                                                                           | Surface Type | Color     |
| ------------------------------------------------------------------------------------ | ------------ | --------- |
| `landuse=grass`, `landuse=meadow`, `leisure=park`, `leisure=garden`, `leisure=pitch` | grass        | `#7cb868` |
| `landuse=forest`, `natural=wood`, `natural=tree_row`                                 | forest       | `#4a8c3a` |
| `landuse=farmland`, `landuse=orchard`, `landuse=vineyard`, `landuse=allotments`      | farmland     | `#c5b87a` |
| `natural=beach`, `natural=sand`, `natural=dune`                                      | sand         | `#e8dca8` |
| `natural=scrub`, `natural=heath`, `natural=grassland`                                | scrub        | `#8ba86a` |
| `natural=water`, `water=*`, `waterway=riverbank`, `landuse=reservoir`                | water        | `#4a90a8` |
| `natural=wetland`, `natural=marsh`, `natural=swamp`                                  | wetland      | `#6a9878` |
| `natural=bare_rock`, `natural=scree`, `natural=rock`                                 | rock         | `#9a9a8a` |
| `landuse=residential`, `landuse=garages`                                             | residential  | `#d0c8b8` |
| `landuse=industrial`, `landuse=commercial`, `landuse=retail`                         | industrial   | `#b8b0a0` |

Water surfaces use animated wave normals adapted from Streets GL (MIT licensed).
The water normal texture is at `assets/geography/water-normal.png`. Landcover and
water polygons are batched by 256m cell and surface type for efficient rendering.

#### Inland water areas (rivers, lakes, reservoirs)

Inland water bodies are rendered from OSM **area** geometries, not the OpenFreeMap
ocean layer (which handles `class=ocean` only). This includes:

- `natural=water` areas (lakes, ponds, rivers mapped as areas)
- `water=river` / `water=lake` / etc. polygons
- `waterway=riverbank` / `waterway=dock` area ways
- `landuse=reservoir` / `landuse=basin` areas
- Multipolygon relations with proper outer/inner ring assembly

**Multipolygon assembly**: Large rivers are often mapped as multipolygon relations
where member ways need to be joined at shared endpoints to form complete rings.
The importer assembles these automatically, joining ways that share coordinates
and handling reversed way directions. When some member ways are missing or
cannot be joined, complete rings are still salvaged — incomplete chains are
skipped without discarding the entire relation.

**Centerline fallback**: Where no area polygon exists, `waterway=river` and
`waterway=stream` centerlines are rendered as extruded ribbons using the OSM
`width=*` tag or type-based defaults (15m for rivers, 3m for streams). These
are explicitly labelled as centerline approximations in their entity names.

Landcover is visual only; it does not affect collision or physics. The terrain
heightfield remains the collider. This implementation does not use satellite/orthophoto
imagery; it relies solely on OSM vector data for surface classification.

### Bridges, tunnels and stacked roads

Bridge and tunnel ways are now included (previously filtered). Road entities carry
`elevation` (`'bridge'` | `'tunnel'` | `undefined`) and `layer` (integer) from OSM tags.
Construction and step roads remain omitted.

Bridges use an estimated clearance of 5 m per absolute layer (at least one layer),
with ramps returning to terrain at the ends of the original OSM way. Profiles are
sampled at intervals of at most 5 m inside the tile. Clipped segments preserve their
position along the original way so tile boundaries do not introduce extra ramps.
Shared cross-sections join sloping deck segments without horizontal joint discs.
Physics uses the same triangles as rendering, with thin collision prisms below the
deck. Streamed bridge bodies participate in collision-distance culling.

Tunnels retain source metadata but have no visible surface or road collider yet.
Rendering asphalt below an intact terrain collider would not make a usable tunnel;
terrain openings and corridor collision are required first.

Road assist is **disabled by default**. Applications may opt in through
`Simulation.setRoadAssist(enabled, strength)`. It indexes terrain-road segments in
world coordinates, considers vertical separation, and yields to manual steering.
Flight-capable vehicles are excluded. The spatial index is rebuilt when the scene's
entity list changes, rather than scanning all roads each physics tick.

These are approximations, not surveyed interchange elevations. Absolute `ele` and
`height`, connected-way ramp topology, grade limits and terrain-cutting tunnels are
still future work. Layer values are bounded to the supported range of -5 to 5.

Buildings retain their OSM type/ID, retrieval time and source tags. They use the
solid editor and can be recolored, reshaped, cloned or removed. Saves store a full
local scene snapshot; reload preserves modifications without regenerating the
baseline. There is no automatic OSM refresh, conflict reconciliation or upload to
OSM. Road entities store compact paths and a terrain reference; their visual mesh
is regenerated, avoiding several megabytes of redundant road triangles per save.

### Reproducing the data fixture

Requires Python 3, Node and `npm ci`. The LERC decoder is a development dependency;
the initial zone loads the prepared JSON. Streaming uses the LERC decoder inside
a browser worker for newly requested elevation tiles.

```bash
curl --fail 'https://www.openstreetmap.org/api/0.6/map?bbox=-1.828,43.324,-1.811,43.336' -o /tmp/irun-osm.xml
curl --fail 'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer/tile/12/1499/2027' -o /tmp/irun-terrain.lerc
curl --fail 'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer/tile/12/1500/2027' -o /tmp/irun-terrain-south.lerc
node scripts/prepare-irun.mjs
python3 scripts/prepare-irun.py
```

This is a bounded development extract, not a bulk-download or world-streaming
strategy. Re-running it retrieves newer source data; keep the resulting fixture's
retrieval metadata. OSM feature data is distributed under ODbL 1.0 with contributor
attribution; Esri elevation has separate provider terms and attribution. See
[asset provenance](../assets/README.md).

## Implemented neighborhood streaming

`src/world-stream.ts` schedules 1.2 km zones on a shared local grid. It requests the
complete 3×3 neighborhood and a continuous corridor up to 15 seconds / 4.8 km ahead, prioritizing
nearby ground. The worker in `playground/world-worker.ts` fetches OSM features,
decodes Esri LERC elevation, and generates editable building topology. Physics
and render entities are appended without recreating the simulation, resetting
vehicles, or replacing the existing scene view.

- Up to three zone requests run in parallel, with a 100 ms scheduling interval
  between request slots. The player's **immediate 3×3 neighborhood** is always
  prioritized and never cancelled: if the player crosses into unloaded terrain,
  those nine zones jump to the front of the queue and may preempt distant prefetch.
  Failed zones use progressive backoff: 1-5 seconds for nearby zones (fast retry
  when the player needs them), 10-60 seconds for distant prefetch. The worker still
  paces uncached public Overpass requests at 30 seconds and cools down failed OSM
  requests for 60 seconds; local cache hits are checked before that wait. The private
  server retains its upstream pacing. Obsolete requests are cancelled when the actor
  moves beyond their desired neighborhood, except for the immediate neighborhood which
  is always protected. Incomplete responses are never installed as empty ground.
  Stopping or replacing the scene cancels outstanding work.
- The status bar shows loading progress: how many zones are loading, how many are
  pending, and whether any nearby zones are waiting for retry.
- `VITE_WORLD_OVERPASS_URL` can select a self-hosted/contracted Overpass endpoint
  at build time. By default the provider uses public Overpass via POST, not the OSM editing API
  for traversal. It is a development provider, not a guaranteed production tile
  service. A deployed multi-user world needs its own cache/service and request
  budget; public Overpass cannot guarantee continuous high-speed travel. See the
  [operator's usage guidance](https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances).
- Normalized extracts are cached in browser Cache Storage (32 zones, 30-day
  freshness); decoded elevation has a separate 16-tile memory cache. Cache failure
  does not prevent online loading. No Street GL tile service or generator is used.
- Up to 24 nearby/ahead zones are desired. Distant clean zones are removed when
  beyond 3 km or the resident set exceeds ten. The starting zone, zones already
  present in a saved document, edited zones, and ground supporting parked vehicles
  or portals are retained. These pins can exceed the normal working-set budget.
- Edits are detected against the loaded baseline before eviction. They remain in
  the authored scene, rather than being silently regenerated. **Guardar** persists
  the complete resident snapshot; large saves fall back to IndexedDB when
  localStorage is full. JSON import accepts up to 40 MB / 20,000 entities.
- Roads are clipped at common zone boundaries. Terrain uses the same global sample
  lattice and vertical reference as the initial extract; colliders and visible
  terrain share the triangulation. No fake flat tile replaces unavailable height data.
- The status line reports loading, available zones and failures. A missing region
  retains a ground-level safety boundary until usable terrain is ready. This can
  stop a fast vehicle when the provider is slow; prefetch is not a latency guarantee.

This is local neighborhood exploration around a fixed geographic anchor, not yet
planet-scale rebasing or Streets GL visual parity. Bridges, tunnels, water, complex
multipolygon assembly, terrain grading and remote portal-view prefetch remain
separate work. Geometry creation runs in a worker, but GPU upload and collider
installation still run on the main thread and can cause a brief hitch in dense zones.

## Shared cache and long-distance terrain

The optional [Docker cache](../services/world-cache/README.md) shares exact OSM
queries and elevation bytes across browser sessions. Private installation details
are local configuration, never repository defaults. Cached hits do not incur the
direct-public-provider request delay. This is demand caching, not an offline Spain archive.

The real-world view uses a 6 km camera far plane and atmospheric fog from 3.5 to
5 km at ground level. A separate visual-only 121 × 121 elevation grid at 100 m
spacing covers 12 × 12 km around the viewer. It recenters in 2.4 km increments.
A shader masks out resident detailed terrain footprints to avoid double surfaces.
Distant terrain has no vehicle collider, buildings or trees; the existing near-zone
streamer still supplies those. Ground safety boundaries remain until detailed terrain
is ready. Loading elevation does not request additional OSM features.

### Missing imagery recovery

Online raster imagery loads its coarse layer before fine detail. Failed images retry
while the camera is stationary, after 5 seconds with exponential backoff capped at
60 seconds. Evicted images are cancelled and disposed; failures no longer remain
permanently blacklisted for the current view. This raster path is separate from the
OSM building/elevation streaming path used by the real-world scene.

Regression coverage includes cached arrivals, isolated zone failures, cancellation
when travelling far away, the 1000 km/h prefetch corridor, a browser starting 12 km
from the base district, and raster recovery without movement. Network responses in
those browser tests are controlled fixtures, not a claim that public Overpass can
sustain live uncached travel at 1000 km/h.

### Dense-city residency budget

Streaming reserves a budget of 18,000 scene entities, below the 20,000-entity
schema limit. Before installing an incoming zone, it releases farther unedited
zones in the same replacement operation. Nearer detail takes priority, and zones
around actors, edited zones and saved/base zones remain protected. If those
protected entities leave insufficient room, the status reports the detail limit;
rejected zones are reconsidered after travelling 200 m rather than repeatedly
loading them while stationary. Dense cities can therefore show fewer complete
zones at once. This is a residency budget, not a guarantee of an unlimited saved
world or uninterrupted travel at flight speed.

Streaming updates undo snapshots only when their geographic origin matches the
current scene, so travelling between cities does not mix their map entities.
Building surfaces render without permanent edge overlays; topology lines remain
available in the solid editor.

Options → Performance → Map buildings can hide imported building surfaces and disable their collisions, including portal exit checks. Terrain, roads and authored objects remain available. The preference persists locally and applies to newly streamed zones; it does not delete buildings or reduce downloaded data or scene residency. Re-enable it in a clear location to avoid overlapping a restored building.

### Driving frame cost

Imported roads use render-only batches grouped by 256 m cell and colour while
playing. Original entities and geometry remain available for selection/export in
edit mode; streaming invalidates the batches. Authored roads without an OSM source
are left unchanged. Batches preserve terrain-draped heights and pedestrian offsets.

**Options → Performance → Road detail** controls a separate 250 m–6 km drawing
radius, or hides road geometry entirely. It is capped by the overall drawing
distance and uses conservative batch bounds, so a road crossing the boundary can
remain visible. Terrain and its collisions remain in place. This option reduces
drawing work; it does not reduce map downloads.

With buildings disabled, the simulation defers constructing new imported building
collision shapes, including streamed arrivals. Enabling buildings constructs those
missing shapes and restores normal collision culling. Existing disabled bodies are
retained for reuse. Play-mode streaming updates the count/status without rebuilding
the disabled editor tree and inspector; stopping play refreshes the full editor.

The performance panel reports frame interval P95 over the last 120 frames, main-thread
frame submission time, draw calls and triangles across rendering passes. These are
diagnostics, not GPU timer measurements. High P95 with low CPU time may reflect GPU,
browser scheduling or other work outside the measured frame. Try road detail at
250/500 m, shadows off and resolution 0.75× when comparing the same route. Terrain
integration, scene validation and road mesh generation on tile arrival can still
cause occasional stalls; these changes do not claim to eliminate every source of
stutter or guarantee a hardware-independent frame rate.

### Incremental render preparation

Streamed sectors now prepare terrain, terrain-clipped road meshes, building triangles
and vertex normals in the world worker. Typed position, normal and index buffers are
transferred to the renderer rather than cloned. The scene view adopts these arrays
directly. Render buffers are ephemeral, consumed once and never serialized into scene
JSON, undo history or the persistent geographic cache. Initial saved scenes and travel
destinations retain the synchronous fallback; this change targets arrivals during play.

Road batches retain their 256 m spatial cells across streaming updates. Adding,
removing or replacing a road rebuilds only cells containing that road. Unaffected GPU
buffers remain resident. Disabling road detail defers batch reconciliation until it
is enabled again; individual authored roads remain available in edit mode.

Regression coverage verifies that adding/removing a separate cell preserves all 800
resident cell meshes, including their buffers, and that transferred geometry matches
the original draped surface. This is a work-elimination guarantee, not an FPS claim.
The browser performance fixture still checks draw-call bounds and road-distance controls.
GPU uploads, collision installation and whole-document validation remain synchronous;
precomputed geographic tiles and progressive terrain LOD remain separate improvements.

### Sea and sunlight

The sea is a separate visual layer of OpenFreeMap/OpenMapTiles `water` polygons
with `class=ocean`, including coastline cutouts and island holes. It loads zoom-12
vector tiles through a dedicated worker, transfers triangles and renders at sea
level relative to the geographic origin. It is not inferred from a terrain height
threshold. The ocean layer excludes inland rivers/lakes; those now use the separate OSM
landcover layer described above. No swimming, buoyancy or water collision is added.

OpenFreeMap requests disclose the explored tile coordinates to that provider.
The provider was explicitly authorized for this installation. Set
`VITE_WATER_TILEJSON_URL` to use another compatible TileJSON endpoint, including
an operator's own mirror; no private URL or Mapbox key is committed. The browser
cache holds up to 96 responses for seven days. Only one request is active at a
time, failed tiles back off for a minute, and up to 25 nearby tile meshes are
retained. Loading stops above 12 km. Existing OSM/Esri server cache is unchanged.
Attribution remains visible with the geographic HUD.

The angular sun disc and Gaussian halo, and three scrolling water-normal samples,
are adapted from Streets GL. The normal texture and MIT notice are included in
`assets/geography/water-normal.png` and `assets/licenses/streets-gl-MIT.txt`.
These effects use no reflection camera, screen-space reflection or bloom pass.
Existing geographic time, moon and directional lighting remain in control.

### Long-frame recovery

Simulation catch-up is capped at four fixed 1/60-second steps per display frame;
excess elapsed time is reported as dropped time instead of creating a 15-step
catch-up burst. Normal 30/60/120 Hz simulation timing is unchanged. Under sustained
very low frame rates the simulation advances more slowly than wall time.
Already-validated simulation documents and map-chart/view graph updates avoid
redundant whole-scene validation. Streaming history shares one detached addition
batch between immutable snapshots rather than copying it once per undo entry.
Performance readouts distinguish physics time from the most recent sector install.
GPU uploads and sector installation can still produce long frames; this is not a
guarantee of a particular frame rate on the user's hardware.

Streaming transactions additionally parse and validate only incoming topology,
retaining existing validated entity/geometry references. Global identity, hierarchy,
portal and terrain-reference checks still run on the combined document before it
is committed. The internal `replaceMapScene` path requires privately owned validated
data; authored edits and external scene imports continue to use full `parseScene`.

### Landcover delivery and rendering contract

Normalized bakes use version **2**, prepared geometry uses version **4**, and the
browser extract cache uses `nabla-world-v2`. Older extracts cannot establish that
landcover was fetched, so they are not silently reused as complete data. Rebuild
bakes without `--skip-existing` after deploying the new worker. Browser queries,
bake and prefill request the same landuse/leisure/natural/water polygons.

Closed outlines are triangulated with holes assigned to their containing outer
ring, clipped to each tile and intersected with the actual terrain triangles in
the worker. Vertex sharing and bounded topology chunks keep the solid editor's
limits intact. Tile-specific identities prevent duplicate ownership across zone
boundaries. Generated surfaces have `motion: none`; hiding map buildings does
not hide landcover. They remain part of the tile eviction/fingerprint lifecycle.

The renderer reuses prepared mesh positions, including parent transforms. It only
rebuilds dirty 256m/material cells once per scene revision; camera movement and
origin rebasing reuse those buffers. Distance culling uses actual geometry bounds
and shadow materials are registered through the existing CSM integration. Water
uses the existing normal texture without another camera or reflection pass.

Limitations: inland water follows the elevation grid; this is not a surveyed
flat lake level or hydrology simulation. Multipolygon relations with ways that
cannot be joined (no shared endpoints) produce partial results — complete rings
are salvaged but incomplete chains are skipped. Nested equal-priority landuse
polygons are not a full polygon-union/classification system. The procedural atlas
prototype has been removed because it was unused; current land materials use solid
colors. Centerline river fallback is an approximation using default or tagged
widths; it does not match actual surveyed banks.

### Physical reflections with cascaded shadows

The CSM addon bundled with Three.js r186 still carries an older complete lighting
chunk. Its wholesale replacement omits the current DFG lookup and multi-scattering
initialization, making metallic materials lose reflections. Nabla retains the
installed engine's lighting chunk and replaces only the directional-light branch
with the addon's cascade handling. This preserves paint/chrome material values,
iridescence, environment lighting and the current other-light/probe support.
A browser regression measures an environment-only metal sphere across all shadow
tiers; reflection brightness must remain unchanged.

### Surveyed pyramidal roofs and overlapping ground

Pyramidal roofs also support single star-shaped surveyed outlines with more than
four corners. The area centroid must lie in the outline's visibility kernel;
multiple rings/courtyards and incompatible outlines retain a flat fallback.
`roof:height` takes precedence over `roof:levels` (three metres per level). The
real OSM outline of `way/154094152` is a regression fixture: seven sloped roof
faces, upward normals and the original red roof colour. Other nonrectangular
roof shapes still need separate generators.

Ground categories have distinct millimetre offsets, in surface-precedence order,
below the 35mm road offset. This prevents different landuse colours from occupying
the same depth and does not rely exclusively on polygon offset with logarithmic
depth rendering. Prepared geometry v4 invalidates older roofs and ground heights.

### Optional smooth road decks

Select a terrain-level road in Studio and change **Superficie de conducción** to
**Suavizada · experimental**. The choice is stored as `road.mode: "smooth-float"`
and supports undo, scene export and edited-tile preservation. `raw` remains the
default. There is deliberately no global switch that changes every road at once.

The implementation replaces PR #18's original endpoint-only smoothing and flat
joint discs. It samples the route at intervals of at most 5 m, uses shared mitered
cross-sections, and clips each deck triangle against the DEM triangles to bound the
highest terrain under its entire footprint. Both station ends stay at least 0.1 m
above that bound. A 30 m moving average and 15% grade envelope raise approaches;
they never cut terrain away. Averaging uses linear-time prefix sums. Rendering,
worker preparation, conversion to editable solids and physics share `roadGeometry`.
Collision prisms extend below the visible surface and no default box is added.

This is a conservative opt-in treatment for individual roads, not surveyed highway
engineering. Decks can rise several metres above terrain on steep cross-slopes.
Independent roads/intersections and tile boundaries are not jointly graded; inspect
connections before using a smoothed road as a route. Closed rings, folded ribbons
and roads exceeding 4096 sampling intervals fall back to the original surface.
Bridge profiles retain their separate implementation; tunnels remain deferred until
terrain excavation and collision cutouts exist. Turning buildings off does not
remove road-deck collision.

## Railways and settlement names

The import includes `railway=rail|light_rail|tram|narrow_gauge`. Each track has a
ballast ribbon and two narrow rail ribbons, draped on the same terrain triangles
as roads. `gauge` is interpreted in millimetres (1,435 mm fallback), and bridge
profiles respect `bridge` and `layer`. The **Vías OSM** group is independent of
roads: its bounded solid chunks have `railway.part` and `motion: none`, never a
road component. They are batched by cell and colour using the road renderer, but
do not create road assist, vehicle support or rigid-body colliders. Road detail
distance also controls railway draw distance. Tunnels/subways and inactive or
proposed tracks are omitted; sleepers, trains and catenary are not included.

Named OSM `place=city|town|village` nodes become nonphysical `placeLabel` entities
in **Poblaciones OSM**. Each node has one tile owner, preserving its OSM identity
and spelling. Labels use canvas text (not HTML), a fixed apparent text size, and
are discarded with their streamed zone. Only loaded settlements can be named;
this is not a worldwide geocoding database.

Inland water is visual only. Centerline fallback is generated as water geometry,
not as a road; mapped areas take precedence over covered centerline triangles.
The shore transition remains approximate at terrain-triangle resolution. Missing
inner relation rings are not filled, and incomplete building relations are not
salvaged into invented footprints. Named streams in tunnels are omitted.
