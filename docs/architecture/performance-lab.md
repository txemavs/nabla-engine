# Streaming and performance laboratory

Studio now lives in the independent `nabla-studio` repository. In that application, open project options and use
**Calidad** for presets, internal pixel ratio (including 0.35 and 0.5), shadow
quality, stable/full car shading, mirrors and depth of field. A first visit with a
coarse pointer chooses the conservative mobile preset. Saved preferences win.
Compact screens use a separate tabbed workspace layout and bounded settings window.
The mobile preset disables shadows, mirrors, depth of field and buildings; it is
a starting point for testing ordinary midrange phones, not a measured device guarantee.

**Diagnóstico** contains the streaming mode, tile overlay, labels, HUD, reset and
CSV export. Ground mode retains Z15 city geometry. Flight/model modes request
Z13 roots and refine nearby regions through Z14 to Z15 according to distance,
height and tile budget. Ancestors remain available until their children are ready.
Model mode pauses simulation, but does not destroy bodies or reclaim all physics
memory. Use the editor orbit camera to inspect large models. Z12 currently denotes
satellite imagery, not a new city mesh level. The displayed requested radius can
exceed coverage when the tile budget or missing publications limit it.

Colours by zoom: Z12 purple, Z13 blue, Z14 green, Z15 orange. State colours:
planned grey, downloading yellow, installing purple, resident blue, visible green,
retry red. Labels distinguish mesh, relief and photo, with at most 48 nearest
labels. The overlay leaves real materials and geometry intact and costs additional
work: disable it for comparative performance measurements.

## Ownership and timing

- `src/scene/mercator.ts`: coverage planning and ready-parent fallback.
- `src/render/planet/world.ts`: requests, worker backpressure, resident lifetime,
  cooperative installation and physical coverage.
- `src/render/planet/debug.ts`: optional diagnostics only.
- `src/config/performance.ts`: shared quality defaults; Studio owns preference persistence.
- `src/diagnostics/performance-monitor.ts`: bounded 1,800-sample CSV and recent 240-frame
  mean/p95/p99. CPU is main-thread elapsed time, not GPU timing. Suspension gaps
  over one second are excluded. A stationary editor need not draw each animation
  callback; do not compare its callback rate to active gameplay.
- `src/runtime/touch-driving.ts`: captured multi-pointer driving inputs; cancellation,
  blur and visibility changes clear pressed controls.
- `src/render/shadows.ts`: shared CSM material registration, current Three lighting
  compatibility and a dedicated near cascade for vehicle contact shadows.

Completed worker payloads are installed between frames with a 1 ms mobile / 1.5 ms
normal cooperative budget. Individual mesh creation, GPU upload, support geometry
and collision preparation can still exceed that budget; the installation peak is
reported. This is not a hard real-time scheduler. Resident memory is an estimate
of city CPU/GPU geometry and texture storage. The retention budget is not a hard
ceiling on browser/process/physics/horizon memory, and wanted tiles remain pinned.

Stable car shading disables receiving shadows on car meshes while preserving their
cast shadows. Buildings, aircraft and other shadow receivers keep their behavior.
This trades car self-shadow/contact detail for cleaner paint. Near cascade splits
reserve the first 40 metres; farther shadow coverage still depends on quality.

## Offline geometry LOD

`services/world-cache/planet/lod.ts` composes four complete child publications in
the parent's geographic frame, checking their GLB hashes. Z14 targets 35% of child
triangles with a 1 m local error bound; Z13 targets 18% with a 4 m local bound.
Meshoptimizer locks open boundaries and compacts all vertex attributes. These
are targets, not guaranteed ratios: boundaries or disconnected buildings may
prevent much reduction. Z15 is unchanged. Texture drapes/skirts are omitted from
coarse geometry, and textures are not decoded during composition.

The manifest records actual input/output triangle counts, cumulative geometric
error and source hashes under `lod.revision = mesh-lod-v1`. If four children are
not published, the existing native source path generates the parent and then
simplifies it. Parent generation is on demand, not an automatic full-store rebuild.
Existing unsimplified parents are refreshed when requested. Coarse tiles may still
supply fallback collision geometry in flight; ground driving deliberately uses Z15.
Visual LOD is not yet an independent high-detail collision bubble for all actors.

## Validation and remaining work

Compare the same location, route, camera, viewport and preset, after warming the
cache. Reset, drive/fly for a repeatable interval, export CSV, then compare p95/p99
and installation peaks, not only mean FPS. Repeat once with a cold cache. Real
mobile hardware and Quest require separate measurement; no 60/72/90 Hz guarantee
is implied. This change does not implement WebXR, stereo cameras, XR controllers,
foveated rendering or Quest-specific quality selection.

Validation on 2026-09-28: the whole unit suite had 21 failures/306 passes compared
with 23 failures/299 passes at original HEAD 029ba4c; every remaining failing test
was also failing there. Existing failures cover Rapier portals, carrier/terrain
contacts, shooting, tunnel rendering, flight presentation and project filename
expectations. These are not a clean physics release baseline. The dedicated LOD,
coverage, CSM and telemetry suites (12 tests) and the generator's 54 Python tests pass.
Browser checks cover shadow quality, settings/CSV, touch cancellation and planetary
stream installation, collision support and picking (five passing journeys). A sixth journey verifies the full-width layout,
settings bounds and automatic mobile preset at 390 × 844 with touch input. An
isolated offline publication check verifies 16 Z15 → 4 Z14 → 1 Z13 with hashes and
triangle reduction; reproduce it without changing published data:

```sh
docker run --rm --network none \
  -v "$PWD/services/world-cache/planet/smoke-lod.py:/tmp/smoke.py:ro" \
  nabla-development-world-cache python3 /tmp/smoke.py
```

Before changing these areas, preserve source and published data. This turn's
source snapshot is `/home/txema/backups/nabla-performance-20260928/source.tgz`;
the earlier generator migration and original volumes are documented in
[the publisher architecture](unified-planet-publisher.md).
