# Performance status and remaining work

## Implemented

- Streamed terrain, building triangles and draped roads are prepared in a worker;
  typed render arrays are transferred without copying.
- Road meshes are grouped by 256 m cell/material. Sector arrivals rebuild only
  affected cells; hidden road batches defer their work.
- Incremental scene validation checks incoming topology and global references,
  preserving already validated resident geometry. Imports and edits still receive
  full validation. Undo history shares one detached incoming batch.
- Physics catches up at most four fixed steps per frame. Long pauses cannot trigger
  a fifteen-step burst; dropped time is reported explicitly.
- Contact history uses Cannon's sparse body-ID matrix through a typed adapter.
  Reset/storage scales with recorded contacts, rather than all possible body pairs.
  This does not change collision geometry, broadphase, solver or collision distance.
- Cockpit charts share projected road data for each scene revision. Cached bounds
  reject off-chart paths without scanning their vertices, using each screen's zoom.
- Ocean decoding runs in a separate worker with bounded caches and concurrency.
  Sun and water shaders add no reflection camera or bloom render pass.
- Building, road, collision, shadow and resolution settings remain independent.
  Mirrors are limited to visible lenses in an occupied cockpit; lights are pooled.

## What remains

1. **Spread installation over frames.** GPU upload, mesh/batch installation and
   collider creation are still synchronous. Dense incoming sectors can cause spikes.
   Incremental installation needs atomic terrain/collision handover and cancellation
   that cannot leave the player over missing ground.
2. **Prepare vector tiles on the server.** Cold Overpass latency still prevents
   guaranteed seamless travel at high speed. Browser/server caches accelerate revisits,
   but do not replace a precomputed geographic tile pipeline.
3. **Progressive terrain detail.** Near/far terrain is present; multiple distance
   levels with matching boundaries could extend the horizon for less geometry.
   Roads must remain on the same surface used for driving and collisions.
4. **Instance repeated scenery and batch buildings.** Preserve selection/editing
   identity while sharing geometry/materials and reducing draw calls.
5. **Measure the user's GPU.** Current CPU timing and frame P95 do not isolate GPU
   execution. The automated browser uses software rendering; its FPS is not a claim
   about the user's hardware. Compare identical routes, settings and cache state.

Ocean polygons currently cover seas/coasts; inland water elevation, buoyancy and
swimming remain separate features. Do not add expensive reflections to diagnose
streaming stalls.

## Verification

`npm run check` verifies formatting, types, unit/physics tests and both builds.
Targeted browser tests exercise road rendering, ocean/solar shaders and streaming
at the origin and 12 km away. Contact-matrix tests compare collision events and
motion against Cannon's default matrix and verify zero dense storage at 18,000
bodies. Chart tests cover shared projections and long segments crossing the view.

## Flight presentation

Map detail distances measure horizontal distance to the ground footprint, so flying
above a road does not hide it merely because the camera is high. Frustum culling
still applies, and the camera far plane includes the vertical distance to the ground.
The streaming planner continues loading at flight altitude below its 12 km cutoff;
landing is not a prerequisite. Cold provider requests can still take time.

Closed OSM building meshes render their outward faces only. This avoids drawing an
adjacent building's back-facing wall on the same plane. Authored solids retain their
existing two-sided editing presentation. Distinct overlapping OSM volumes can still
require data-specific correction; back-face culling is not polygon union.

Container exhaust uses four pairs of eight-sided, unlit cones at the model's lower
sockets. It adds no shadow lights, particles or offscreen render passes. Exhaust
fades with flight mode and varies with speed. A shared Web Audio turbine graph starts
only after user interaction, attenuates with distance and inside the cabin, and mutes
when the page is hidden or play stops. The footer sound toggle persists locally.

## Stable local shadows

The sun uses one fixed-size orthographic shadow map centered on the player. Its
absolute light-space center is snapped to whole shadow texels before render-origin
rebasing, preserving the grid during small movements and distant travel. Resolution
settings change the texel size rather than the coverage. PCF radius is zero: hardware
bilinear comparison remains, without the screen-pixel-dependent rotated sampling
pattern used by the installed Three.js filter. Edges are simpler and less noisy.

Only the main scene requests a shadow update. Mirrors and portal views reuse the
last completed local map rather than rendering it repeatedly. This deliberately
prioritizes local shadows; distant portal destinations do not get another shadow map.
