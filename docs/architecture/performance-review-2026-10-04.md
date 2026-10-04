# Engine performance review — 2026-10-04

## User-observed reference

The user reports sustained play at 60 FPS with 10 km of terrain on an RTX 4090.
This is valuable real-play evidence, distinct from the automated warm-fixture
measurements below. Its exact route, viewport, quality settings, cache state and
P95/P99 were not captured by this benchmark. The engineering target is to preserve
that observed experience during streaming and extend acceptable quality to weaker
hardware, not to infer an engine-wide 32 FPS limit from the automation environment.

## Measured scope

These measurements use a Ryzen 7 9800X3D and headless Chrome reporting an NVIDIA
RTX 5090 through ANGLE/D3D11. They do not represent a weak laptop or phone.
The graphics scene is the warm offline four-Z15 fixture with a parked fleet and
exterior chase camera, 1280 × 800 CSS pixels and device scale factor 1. Each
profile discards 90 warmup frames and measures 180 frames. No new terrain arrives.

| Profile                    | Buffer     | Draw calls/frame | Triangles/frame | Main-thread CPU/frame | Frame P95 |
| -------------------------- | ---------- | ---------------: | --------------: | --------------------: | --------: |
| Browser default (`custom`) | 1280 × 800 |            1,155 |         629,336 |               5.61 ms |   31.6 ms |
| `mobile`                   | 640 × 400  |              183 |         163,415 |               3.79 ms |   31.6 ms |
| `minimal`                  | 448 × 280  |              183 |         163,415 |               3.73 ms |   31.6 ms |

All profiles ran near 32 FPS. A separate blank-page requestAnimationFrame probe
also ran at 31.88 FPS. The environment's callback cadence therefore limits this
FPS comparison; these values are not the engine's maximum attainable frame rate.
The cause of that cadence (browser, display/driver or host policy) was not isolated.

The measured cheap profile removes about 84% of draw calls and 74% of submitted
triangles in this fixture. `minimal` shades a buffer with 87.75% fewer pixels than
the default at DPR 1. CPU submission time falls about one third. This is useful
headroom, but neither draw-call nor pixel reduction is an equivalent FPS multiplier.
`minimal` and `mobile` submit the same geometry; the extra pixel reduction mainly
helps when fragment rendering is the bottleneck.

Physics averaged approximately 0.63–0.68 ms per browser submission here (including
collision preparation and potentially multiple fixed steps). A separate warmed
headless fixed-step CPU benchmark yielded median repeat means of:

| Cars | Before extraction | After extraction |
| ---: | ----------------: | ---------------: |
|    1 |          0.025 ms |         0.030 ms |
|   12 |          0.143 ms |         0.147 ms |
|   40 |          0.409 ms |         0.394 ms |

There are three repeats, 240 warmup steps and 600 measured steps per repeat.
These small differences do not establish a speedup or regression; JIT/GC and
normal scheduling noise remain. No physics time was dropped. The scenes exclude
dense collision arrivals, complex portal traffic and remote terrain. Modularizing
the code primarily improves ownership and the ability to optimize independently.

Raw results are in [benchmarks](../benchmarks/2026-10-04/).

## Changes in this review

- Decomposed simulation into collider construction, map collision scheduling,
  terrain boundaries, fallback floor, road assist, portal geometry/traversal,
  docking and shared contracts while retaining the public API and tick order.
- Empty map queues avoid allocating actor arrays and sorting work. Distance
  ordering no longer allocates an actor array for every candidate.
- Stationary browser cameras avoid redundant projection-matrix recalculation.
- Added `minimal`: 0.35 pixel ratio, no shadows/mirrors/depth of field/buildings,
  conservative mobile terrain budgets. Player controls, monitors and physics
  remain available. This is a usable low-cost preset, not a hardware guarantee.
- Added opt-in `onDiagnostics` with uncapped frame interval, CPU submission,
  physics/install time, all-pass draw counters, buffer size and dropped physics
  time. Counter collection is disabled when the callback is omitted.

## Highest-value remaining work

| Area                                      | Expected benefit                                | Evidence and next measurement                                                                                                                    |
| ----------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shadows and auxiliary views               | High GPU/draw-call savings                      | Large reduction already measured with cheap profiles; measure cockpit mirrors and portal-heavy scenes independently                              |
| GPU upload/collider installation spikes   | Better P95/P99 and fewer driving stalls         | Installation is cooperatively budgeted, but one upload/cook can exceed the budget; record cold urban arrivals and atomic ground handover         |
| Vehicle/scenery LOD and material batching | Fewer draws and vertices at every quality       | Cheap modes still submit 183 draws in a small fixture; profile object/material contributions before merging or simplifying                       |
| Worker preparation and residency          | Smoother high-speed travel and bounded memory   | Measure worker queues, cache misses, upload peaks and unloading during a route; warm flat results do not cover this                              |
| Allocation reduction in hot loops         | Less garbage-collection jitter                  | Profile allocations in scene sync, wheel snapshots, portal envelopes and monitor updates; avoid pools that complicate ownership without evidence |
| Adaptive resolution with hysteresis       | Maintain a chosen frame budget on variable GPUs | Requires distinguishing GPU-bound frames from loading/CPU spikes; do not adapt from an externally capped FPS number                              |
| GPU timing                                | Reliable GPU bottleneck diagnosis               | Current CPU duration is not GPU execution time; add optional disjoint timer queries with unsupported/disjoint handling                           |

For a 60 FPS target, the frame budget is about 16.7 ms; for 30 FPS, 33.3 ms.
Evaluate P95/P99 as well as average FPS. Keep collision coverage and fixed stepping
independent of visual quality. A slower machine still needs a real driving test:
integrated GPU, cold and warm urban routes, cockpit monitors, a moving truck and
trailer, portals, and a sustained memory/thermal run.

## Reproduction

Build the package, then run `node scripts/benchmark-simulation.mjs report.json`.
Build/serve the standalone game and run `node scripts/benchmark-game.mjs report.json`
with `NABLA_BENCH_URL` pointing to the server. Optionally set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to a local Chrome executable. Run benchmarks
without the test suite or other benchmarks competing for CPU/GPU.

Use `?example=flat&quality=mobile` or `quality=minimal` to try cheap profiles.
`&diagnostics=1` makes the demo dispatch `nabla:frame` samples on its canvas for
the benchmark; normal play does not collect these counters. API consumers can
provide `onDiagnostics` directly and choose their own presentation/export policy.
