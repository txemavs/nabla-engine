# One planet, independent render frames

The planet owns positions and tiles. Cities are search bookmarks, never namespaces
or separate maps. A cursor is the editor's geographic focus; cameras, physics and
renderers may use temporary nearby Cartesian frames without changing identity.

## Fixed grid contract

`src/planet-grid.ts` defines `earth-bands-v1/<row>/<column>`. Latitude bands are
fixed once from Earth's mean-radius circumference and a target 1,200 m spacing.
Each band has a fixed column count chosen at its midpoint. Bounds are half-open,
longitude wraps at the antimeridian, altitude is not part of identity, and pole
lookups use a canonical column. Cells are approximately 1.2 km across, not exact
Euclidean squares; their exact geographic bounds are authoritative. This is a
custom spherical grid, not a claim of OGC or ellipsoidal WGS84 conformance.

**Status:** the grid API and boundary tests exist. The live stream still uses the
legacy anchored 1,200 m grid. Do not label an old tile with the ID of its centre:
its footprint generally crosses several new cells. No saved objects or cached
baked/prepared files have been silently migrated.

## Required migration

1. Producers query and clip to the canonical cell bounds. Use one stable local
   frame per cell for GLB vertices; store that frame in the manifest. Quantization
   of shared edges must use common geographic samples, not each scene origin.
2. Requests, queue deduplication, disk cache, eviction and entity ownership use the
   canonical cell ID. Store legacy artifacts under their existing namespace until
   regenerated. A source OSM object crossing cells needs stable ownership plus
   clipped render fragments, not duplicated editable entities.
3. WorldStream evaluates cursor/actor geographic position, cell adjacency and
   distance to cell bounds. Install transforms map each cell frame into the
   temporary camera/physics frame. Rebase existing objects without regeneration.
4. Editor travel moves the cursor and camera geographically, projects the cursor
   onto sampled ground, and streams the new neighborhood. Saved authored objects
   and portals retain their geographic anchors, including distant destinations.
5. Separate terrain and building revisions; authored buildings and terrain
   overrides have explicit ownership and replacement masks. OSM updates must not
   erase user edits. Portal destination views need independent visible-cell sets.
6. Add near/far selection using projected error, not distance alone. Keep the old
   visible tile until its replacement is ready. Match shared boundaries or stitch
   LOD edges; do not swap distant visual meshes into collision shapes.

Acceptance includes cursor travel Irun–Zamora–Australia, approaching the same cell
from different origins with one cache key, dateline/pole coverage, rebasing with
no jumps, persistence of authored edits, and portals rendering other locations.

## Ground compaction experiment

`compactGround` snaps unedited elevation and land-cover positions to 0.1 m or 1 m
in their existing mesh frames. It welds vertices with identical positions and
colors, removes degenerate and repeated same-winding triangles, drops unused
vertices, then recomputes smooth normals. Sources, collision metadata, user edits,
buildings, roads and thin rails remain unchanged. Float32 storage introduces the
usual representation error around decimal coordinates.

The exporter writes `terrain-10cm.glb`, `terrain-1m.glb` and `variants.json` beside
the lossless split-layer artifacts. These are **render-only previews**, not yet an
automatic distant LOD or a seam-safe replacement for gameplay. Snapping surfaces
can change their relationship to roads; retain the original near runtime mesh
until shared-edge, depth and collision tolerances are addressed. Useful distant
LOD additionally needs triangle simplification with measured error and removal of
subpixel detail. The 1 m preview alone does not provide that.

The preparation worker now produces sidecars for newly prepared zones, publishes
the manifest last, and counts GLBs in retention together with their source tile.
A sidecar failure does not invalidate a successfully prepared binary tile. This
requires redeploying the preparation image; existing zones are not bulk rebaked.

## Deployment and measurement, 2026-09-23

The preparation image on chained.world was updated with sidecar generation and
retention. Rollback image: `nabla-world-cache:before-ground-worker`. Existing
prepared files remain intact. The Irún tile-lab offers both quantized previews.

| Ground-only file     |      Bytes |
| -------------------- | ---------: |
| Original terrain.glb | 12,394,300 |
| terrain-10cm.glb     | 10,587,744 |
| terrain-1m.glb       | 10,432,116 |

The first saves 14.6%; the second 15.8%. This does not establish an FPS gain or a
production LOD. Browser previews loaded both, and 298 TypeScript unit tests plus
35 cache-service tests passed. The geographic streaming migration remains the
explicit next architectural stage above.
