# 24. Performance and diagnostics

[Manual contents](README.md)

Measure a defined workload before optimizing it. Record the source world, vehicle
count, build mode, browser/device, actual renderer backend, resolution, quality,
worker mode, and cache state. A flat scene, an authored model, and a streamed city
are different workloads even if they use the same engine version.

## Startup and steady state

Startup includes module loading, terrain requests, decoding, physics initialization,
asset loading, scene installation, shader compilation, texture upload, and host
reveal gates. A stalled tile counter during GPU preparation does not prove a
network stall. Conversely, a corrected progress label does not prove faster startup.

Steady-state costs include physics, main-thread update work, draw calls, GPU passes,
mirrors, shadows, effects, and incoming streaming work. Lowering resolution helps
some GPU workloads but does not eliminate expensive JavaScript or collider creation.
Workers move work and introduce synchronization; they do not make it free.

## Reproducible investigation

1. Reproduce on the same scene and quality in a production build and development.
2. Record cold and warm HTTP/IndexedDB runs separately.
3. Enable the existing host diagnostics: `?diagnostics=1`, `?perfLog=1`, or
   `?performanceLog=1` according to the measurement needed.
4. Inspect canvas loading detail/milestones and boot timings for startup.
5. Compare a single variable, such as `physicsWorker=0` or `loadingWorkers=0`,
   keeping scene and settings constant.
6. Re-run the original workload after the change and report comparable numbers.

The diagnostics flag exposes `window.nablaRuntime` in the reference host; do not
design production integration around that debugging global. `onDiagnostics` is
an explicit browser-runtime hook for frame samples. GPU timing depends on backend
and device support; missing measurements are not zero cost.

## Budgets and correctness

Streaming, visibility, collision cooking, particle limits, and shadow tiers have
separate controls. Reducing a collision budget may improve frame time but affect
how quickly a safe surface becomes available. Preserve functional behavior while
measuring performance. Do not disable features silently to make a benchmark look
better.

## Source of truth

- [Frame samples](../../src/diagnostics/runtime-frame.ts).
- [GPU timing](../../src/diagnostics/gpu-timing.ts).
- [Performance settings](../../src/runtime/performance.ts).
- [Resolution adaptation](../../src/runtime/resolution-scale.ts).
- [Startup diagnostics](../game-runtime.md).
- [Recorded benchmarks](../benchmarks/README.md).
