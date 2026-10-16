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
plus their Z15 fallback: five deliveries, not four. During ordinary streaming,
the existing request budget includes ancestors. Budgets too small for a quartet
keep coarser coverage. Loaded byte budgets and active/protected tile retention
still apply; this is not a promise that five deliveries fit a particular headset.

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
new delivery envelope, registry lookup and URLs must be checked against a real
published sample before adding any separate adapter. No speculative Z16 package
schema or `/api/atlas/geo/z16` production asset route is implemented here.

Atlas review availability is not native publication or driving acceptance. The
reported reviews remain `drivable=false`; this work does not alter that flag or
the existing candidate-road collision policy.

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
