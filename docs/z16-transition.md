# Z16 delivery migration

Engine can opt into Z16 mesh delivery through the existing planet loader, renderer
and simulation. Z15 remains the default. This is client preparation, not approval
of Atlas review geometry for driving or a switch of Euskadi Online production.

## Host configuration

Use the existing static provider and an explicit detailed level:

```ts
tiles: {
  baseUrl: tileServer,
  mode: 'static',
  meshMinZoom: 15,
  meshMaxZoom: 16,
  imagery: 'package',
}
```

The terrain demo also accepts `meshMaxZoom=16`. Omit it (or use 15) to retain
existing behavior. Do not enable Z16 on the legacy dynamic generation service
until that service supports it. This setting is shared by the Engine planet
world; it does not create a different physics system for PC, VR or AR.

For the initial pilot, startup requests the four Z16 children of the spawn Z15
plus their Z15 fallback manifest. Mesh downloads prioritize Z16 and defer the
parent while a full healthy quartet is requested. A missing or failed child
restores the parent fallback; an already resident parent is retained until
coverage is ready. This avoids downloading both levels for the same area.
During ordinary streaming,
the existing request budget includes ancestors. Budgets too small for a quartet
keep coarser coverage. Loaded byte budgets and active/protected tile retention
still apply; this is not a promise that the requested area fits a particular headset.

## Supported delivery contract

The existing `nabla-planet-tile-v1` manifest path is zoom-independent:

- `BASE/z/16/32448/23996/manifest.json`
- canonical ID `WebMercatorQuad/16/32448/23996`
- child-specific `tile`, bounds, centre anchor and local-metre geometry
- terrain and buildings layer files with byte sizes and SHA-256 hashes
- existing optional package photo, road layers and instances sidecar

For `15/16224/11998`, children are `16/32448/23996`, `16/32449/23996`,
`16/32448/23997`, `16/32449/23997`. Child identity is never inferred by relabelling
a parent. The validator rejects a parent anchor served for a child.

The existing Atlas `nabla-z15-package/1` adapter remains unchanged in identity and
schema. A native Z16 manifest does not require that Z15 package pointer. Atlas's
`atlas-z16-cell/1` envelope is also supported by `src/planet/atlas-z16.ts`, verified
against the local tile server on 17 October. Its tile, origin, axes, revision,
asset sizes and hashes are validated. Asset URLs must remain inside that
revision and child directory; host proxy prefixes are retained.

The adapter loads terrain and buildings through the usual layers. The separate ground roads are rasterized for the GPS only, without scene meshes
or collision bodies: the terrain already includes those roads. Decks and tunnel
floors use the existing asphalt path; supports and bridge fill
use the structural road path. They retain embedded textures and participate in
the same collision pipeline. The instance sidecar feeds existing trees and lamps.
No acceptance flag disables driving: `drivable` is retained as Atlas metadata.
Bridge and tunnel surfaces remain physical geometry. Z15 delivery remains compatible and supplies parent coverage.

Atlas review availability is not native publication or driving acceptance. The
reported reviews remain `drivable=false`; this work does not alter that flag or
the shared collision implementation.

## Coverage and ancillary layers

The planner can refine Z15 to Z16 while retaining ancestor requests. An installed
parent remains visible until all four child regions are ready. Installation
means the normal worker/download/hash/geometry/collision preparation has finished.
If no parent is available, the existing progressive first paint can display the
available children; missing coverage is not invented.

Pinned children obey the same complete-cover rule: one pin cannot punch a hole
in a loaded parent. Parent and child meshes are not drawn together. The physics
world uses the same active coverage; protected positions may retain loaded
support through the existing mechanism.

Package roof/ground photo projection and field lights accept detailed Z16 cells.
Photo proximity compares coordinates at the same zoom, including the dateline.
Instances content hashes participate in resident revision identity, so a
vegetation/lamp-only publication change is not mistaken for identical content.

## Validation and remaining work

Automated cases cover child addresses and shared samples, all 16 ready-child
combinations, pinned overlap, request budgets, native Z16 manifest loading,
parent-anchor rejection, missing children, photo proximity and actual planet
startup/coverage selection. Existing Z15 cases remain in the suite.

Before enabling production:

1. Obtain an immutable published child and parent from Atlas. Verify its manifest,
   coordinate frame, file names, CORS, hashes, photos and instance ownership.
2. Test the four-child Zaisa pilot and adjacent parents with real geometry:
   road/water seams, bridge decks, tunnel entrances/interiors/exits and vehicle
   support during replacement. Numeric grid tests cannot prove authored seams.
3. Update AR's standalone map selection/navigation, which still assumes Z15 in
   several places. This patch prepares the shared planet world, not that UI.
4. Measure CPU/GPU memory, upload stalls and frame-time percentiles on Quest.
   Preserve headroom for parent/child overlap during installation; do not equate
   four smaller geographic cells with exactly one parent's memory footprint.
5. Integrate actually published simplified distance assets and tune prefetch,
   residency and hysteresis. Proposed 600/1200/2400/4800/9600 m bands are not
   enabled or treated as measured defaults.
6. Enable an opt-in Euskadi profile, then change the default only after acceptance.
   Keep the previous Engine/data configuration available for rollback.

## Development publication refresh

Opt in with `PlanetSourceOptions.developmentRefresh: true` on a static Z16 source,
or `tileRefresh=1` in the terrain demo query. Z15 delivery is unchanged.
Engine polls `<source base>/z/16/updates.json` every 15 seconds without credentials,
using ETag/If-None-Match. A 304 retains the snapshot; a validated 200 replaces it.
Failures retain the last snapshot and use a bounded retry backoff. Missing entries
never request eviction. The source base may be a same-origin HTTPS proxy to the
Atlas HTTP development server; publisher paths retain that proxy prefix.

Revision UUIDs are compared only for equality, including when geometry hashes
are identical. New loads use the registry's exact pinned manifest. Tile identity,
revision, supported asset roles, byte lengths and SHA-256 are validated. All Z16
layers and the optional instances sidecar must succeed, including GPS-only roads.
Disabled buildings are validated but excluded from the rendered payload.

Changed resident cells are staged while the old cell remains usable. Nearby
collision resources are prepared separately and committed alongside the new
visuals. Refresh does not invoke terrain-support repositioning or respawn: player
position, orientation and velocity are preserved at the swap. Physics resumes
against the new geometry normally, so a genuinely changed surface can subsequently
cause contacts or falling. A superseded staging revision is discarded; resources
from different manifests are never combined.

Read-only integration review confirmed a 200 snapshot, conditional 304, and a
matching pinned manifest on the development server. Unit tests cover conditional
polling, failures, pin validation and staged collision replacement. A real Atlas
regeneration followed by an in-browser position-preserving swap remains an operator
integration test; backend publication tests alone do not establish that behavior.
