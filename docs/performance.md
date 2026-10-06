# Performance status and remaining work

See the [2026-10-04 measured review](architecture/performance-review-2026-10-04.md)
for current profile comparisons, limitations and the user's 60 FPS / 10 km RTX 4090
reference. [Simulation ownership](architecture/simulation.md) and
[configuration by topic](configuration.md) describe the current implementation.
The notes below include historical context; current quality values are defined
in `src/config/performance.ts` and `src/config/shadows.ts`.

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
- Rapier keeps its own contact pairs. There is no dense body-pair matrix.
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
at the origin and 12 km away. A drop test checks a dynamic body resting on a
static one. Chart tests cover shared projections and long segments crossing the view.

## Flight presentation

Map detail distances measure horizontal distance to the ground footprint, so flying
above a road does not hide it merely because the camera is high. Frustum culling
still applies, and the camera far plane includes the vertical distance to the ground.
The streaming planner continues loading at flight altitude below its 12 km cutoff;
landing is not a prerequisite. Cold provider requests can still take time.
Near-ground fog now uses the same altitude-adjusted footprint as the camera far
plane: `hypot(0.75 × distance, height)` through `hypot(distance, height)`. A fixed
1 km fog range previously hid already-loaded ground when hovering above 1 km,
even though the camera and streaming still included it. This changes visibility,
not the requested map radius or the number of zones loaded. A browser pixel test
checks visible preloaded ground at 100 m, 1.2 km and 5 km; a scheduler test checks
that delayed data is installed while hovering without a landing event.

Closed OSM building meshes render their outward faces only. This avoids drawing an
adjacent building's back-facing wall on the same plane. Authored solids retain their
existing two-sided editing presentation. Distinct overlapping OSM volumes can still
require data-specific correction; back-face culling is not polygon union.

Container exhaust uses four pairs of eight-sided, unlit cones at the model's lower
sockets. It adds no shadow lights, particles or offscreen render passes. Exhaust
fades with flight mode and varies with speed. `VehicleAudio` is one shared graph
(turbine, propeller, powertrain, tires, gear clack). It starts only after user interaction.
The turbine attenuates with distance and inside the cabin, and the graph mutes
when the page is hidden or play stops. The footer sound toggle persists locally.

## Cascaded local shadows

The sun uses the cascade count, map size and coverage recorded in
`src/config/shadows.ts`: the 512 tier reaches 120 m; 1024 reaches 1 km;
2048 and 4096 reach 4 km with three and four cascades respectively. Low is the
default for new profiles; saved preferences are respected. High quality adds shadow
passes and memory, so it is an optional distance/detail tradeoff, not a free upgrade.

CSM fits a proxy camera in absolute coordinates, snaps to its shadow texel grid,
then rebases its lights into render coordinates. Projection changes refresh cascade
bounds. Low quality prioritizes nearby vehicles without adding a pass.

### Shadow bias and acne

Bias is set per cascade from the world size of one shadow-map texel
(`cascade width / map size`), not as fixed metres: the tier gives `normalBiasTexels` and
`depthBiasTexels`, `cascadeShadowBias` multiplies them by the texel size and clamps the result
to `shadowBiasMetres` (normal 4–50 cm, depth 2–50 cm). A fixed offset was a fifth of a texel on
the 512 map (0.7 m texels) and a quarter of one on Ultra, so ground that writes into the shadow
map shadowed itself. The depth offset is converted to the orthographic depth range
(`metres / (far − near)`), so it stays in world units as before.

| Tier key (presets)      | Near texel (1280×800, 60°) | Normal bias       | Depth bias        |
| ----------------------- | -------------------------- | ----------------- | ----------------- |
| 512 (Baja, Equilibrada) | ≈ 0.70 m                   | 0.3 texel ≈ 21 cm | 0.3 texel ≈ 21 cm |
| 1024 (Alta)             | ≈ 0.43 m                   | 0.4 texel ≈ 17 cm | 0.3 texel ≈ 13 cm |
| 2048 (Ultra), 4096      | ≈ 0.20 m                   | 0.5 texel ≈ 10 cm | 0.3 texel ≈ 6 cm  |

Previously every tier used a fixed 2 cm depth bias and a 4–8 cm normal bias.

Ground is also drawn single-sided. `tileMeshSide` overrides a GLB's `doubleSided` flag to
`FrontSide` for bare-ground tile meshes (`Terrain`, `Surfaces` and ground-photo drapes; see
`isGroundSurface`) whose triangles face up (`upwardWinding` > 0.5); the runtime photo drapes were
already single-sided. Road meshes keep their side because they carry the bridge decks, which
must stay visible from below; skirts, buildings, rivers and the sea are untouched, and ground
wound upside down keeps the GLB side instead of turning into holes. Draw calls and triangle
counts are unchanged (culling happens after submission); the GPU skips the fragments of the
LiDAR faces turned away from the camera.

Terrain casts its shadow from back faces only (`castShadowFromBackFaces`, `shadowSide =
BackSide`). Three.js already does that for single-sided materials, but the Atlas LiDAR terrain
(`relief=lidar`) is exported `doubleSided`, so its sunlit faces wrote into the shadow map and
striped every gentle slope (and the roads and photos draped on it) under a low sun. With back
faces only, hills still shade the valleys behind them and the vehicle contact shadow is
unchanged.

`GameRuntimeOptions.shadowBias` / `runtime.setShadowBias(scale)` multiply the tier bias
(0–3, default 1, `shadowBiasRange`) live, without a reload: bias is a receiver uniform. The game
shows it as Ajustes → Calidad → **Sombras: corrección de rayas** (see
[boot-and-splash.md](boot-and-splash.md#standalone-game-page-this-repositorys-game)).
Shadow intensity is full occlusion of direct light; ambient lighting still fills
the shaded areas. Radius-zero PCF retains hardware bilinear comparison without the unstable
screen-pixel-dependent rotated sampling pattern. Cascades blend at their boundaries.

Only the main view refreshes shadow maps. Auxiliary views reuse them and do not
receive independent camera-fitted cascades. Coverage is limited by camera-relative
cascade distance, not geographic altitude: a car on elevated terrain still casts
a shadow. Distant terrain outside cascade reach receives ordinary sun/moon lighting
without doubling the CSM light. Newly streamed surfaces,
road batches and asynchronously loaded assets register their materials. Disposed
materials and shadow render targets are released when zones or quality tiers change.

Automated tests cover quality switching, material lifecycle, origin rebasing and
camera projection changes. Browser checks capture every quality tier and inspect
WebGL shader errors. Software-rendered test results do not establish laptop FPS.

## Map building batches and editable exceptions

Unmodified static OSM buildings now render in 256 m cells, in both Studio and play
mode. A cell uses one shared vertex-colored material; roof and wall colors survive
merging, and the merged mesh casts and receives shadows. Distance/frustum culling
operates on each cell. Streaming rebuilds affected cells only, one per update;
original geometry stays visible until its replacement is ready. Dragging a group
uses the original meshes temporarily, so its preview stays aligned.

Picking still uses original entity meshes, even while their rendering is hidden.
Entity frames remain visible for attached shot marks. This first implementation
retains source geometry for picking and editing and adds merged render buffers:
it reduces draw calls, **not** geometry storage or physics costs. It is not yet a
compact server-side override database or a merged collision representation.

Select an OSM building and press **Crear modificación** to opt it out of batching.
The document records `mapEditable: true` on the same entity, preserving its OSM
provenance and ID. Position, color, geometry editing and duplication then work
normally. There is no second original to overlap it. Undo can restore the batched
state, and scene save/load preserves the exception. Old documents without the
flag render their existing geometry unchanged but require this action to edit it.

The existing streaming fingerprint includes this field: modified zones stay pinned
and survive save/reopen instead of being evicted and replaced with fresh map data.
This currently retains the whole modified zone, not only a minimal per-building
diff; many modified zones can therefore still increase memory and document size.
Public prepared cache artifacts remain unmodified. No preparation format bump or
server-cache regeneration is required for this renderer-only grouping.

A browser fixture with 100 buildings in one cell reduced total scene draw calls
from 102 to 3 (100 building draws to one), with effectively identical pixels.
That isolates draw-call reduction; it is not a claim of a proportional FPS gain
on a real city or a particular GPU. Tests cover colors, rebasing, incremental
replacement, picking, shot-mark visibility, editable opt-in and saved exceptions.
