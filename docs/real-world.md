# Real-world driving: Streets GL integration review

Status: source-reviewed design, not an implemented or tested map integration.

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
- Prefetch in the direction of travel. Switch render/collision tiles atomically
  at simulation boundaries and retain support beneath vehicles until replacements
  are ready. Missing or failed data must not become a hole under the car.
- Rebase physics as well as rendering during long trips. Decrease map detail during
  ascent; transition to the existing globe at altitude. Portal destination views
  need a bounded remote streaming budget rather than unbounded world duplication.

## First playable milestone

Start with a bounded Madrid district, selectable through the existing GPS controls.
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
