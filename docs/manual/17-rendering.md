# 17. Rendering and the environment

[Manual contents](README.md)

Three.js provides rendering infrastructure. The engine presents scene entities,
streamed terrain, sky, water, lights, shadows, vehicle equipment, and effects.
The browser runtime composes these services; a custom host can compose lower-level
presentation modules when it accepts responsibility for rendering and disposal.

## Backend selection

WebGL is the inspected default. `createRenderBackend` accepts `webgl`, `webgpu`,
or `auto`. WebGPU initialization loads its implementation on demand and falls back
to WebGL when no adapter exists or initialization fails. The result records
`requested`, actual `kind`, and an optional `fallbackReason`.

The reference host accepts `?renderer=webgpu` or `?renderer=auto` as diagnostic or
selection inputs. A requested backend is not proof of the actual backend. Inspect
the result when measuring or reporting compatibility. WebGPU compatibility adapters
and material substitutes exist; do not assume custom GLSL materials transfer unchanged.

## Environment and quality

Scene geography and sky settings determine environmental context. Terrain rendering
combines geometry, imagery, roads, vegetation, and other layers according to the
published contract. Ocean presentation, terrain water, and physical water level
are related but distinct concerns. Disabling a visible sea sheet does not redefine
all physical buoyancy rules.

Shadows, mirrors, postprocessing, and resolution scaling can materially change GPU
cost. FSR 1 is opt-in desktop upscaling; immersive XR bypasses that path. Use quality
presets as a coherent starting point, then measure on the target device before
claiming a particular frame rate.

## Practical debugging

For an invisible object, check its validated entity, resource URL, visibility
layer, transform, bounds, and material/backend support in that order. For shadow
artifacts, compare shadow settings and light topology before changing asset colors.
For a render stall, separate shader compilation and texture upload from network
download. Worker decoding cannot remove every GPU preparation cost.

Use the [browser example](../../examples/manual/browser.ts) for basic mounting;
test backend changes in the reference host with identical scene and quality. Capture
actual backend, resolution, and device with any screenshot comparison.

## Source of truth

- [Backend implementation](../../src/render/backend.ts).
- [Render pipeline](../../src/runtime/render-pipeline.ts).
- [World environment](../../src/render/planet/world-environment.ts).
- [FSR implementation](../../src/render/effects/fsr1.ts).
- [Stock scene presentation](../../src/presentation/scene-view.ts).

## GPU rain

Desktop WebGL rain is an instanced streak effect owned by the runtime render pipeline.
The Weather slider controls the per-instance amount; Off skips rain drawing and its fog
adjustment. It is not a precipitation/roof simulation: XR, WebGPU, roof coverage, impacts
and wet reflections are not supported by this first implementation. See
[the interface chapter](20-interface.md) for saved weather preferences and
[the effect implementation](../../src/render/effects/rain.ts).
