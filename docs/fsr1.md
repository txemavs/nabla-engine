# FSR 1 desktop upscaling

Engine owns the reusable `Fsr1` render effect. `GameRuntimeOptions.fsr`,
`runtime.setFsr({ mode, sharpness })` and `runtime.fsrSettings` expose it to hosts.
It defaults to `off`. Modes are `ultra-quality`, `quality`, `balanced` and
`performance`, using per-axis scale factors 1/1.3, 1/1.5, 1/1.7 and 1/2.
Sharpness is 0..1 (zero disables the sharpening contribution, not upscaling).

Desktop settings expose the selector and sharpness under graphics quality.
The host persists choices and restores them before preload. URL overrides:
`fsr=quality&fsrSharpness=50`. QLTY continues to control the output drawing buffer;
FSR reduces the world render target relative to that buffer. HTML menus and the
separate foreground weapon pass are not downscaled. Mirrors and portal views keep
their independent budgets. Immersive XR bypasses this effect; an XR-aware version
needs separate per-eye integration and validation.

The pipeline renders linear HDR at the reduced resolution, optionally applies
existing depth of field at that same size, uses Three's OutputPass for tone mapping
and display encoding, then applies AMD EASU and RCAS. No second display conversion
is applied. Alpha is retained for HTML monitor apertures. The fixed frame geometry,
materials and shader uniforms are reused; render targets resize on demand and are
disposed when the feature is disabled. Viewport/scissor/target state is restored
on completion or exceptions.

The GLSL implementation adapts AMD's FSR 1 FP32 kernels (v1.20210629):
https://github.com/GPUOpen-Effects/FidelityFX-FSR/blob/master/ffx-fsr/ffx_fsr1.h

The AMD MIT notice is retained in `src/render/effects/fsr1-shaders.ts`. WebGL2 does
not expose textureGather, so EASU uses twelve RGB texelFetch samples with clamped
edges, replacing gather/channel callback packing. Reciprocal approximations use
full-precision guarded arithmetic. RCAS is the non-denoising variant; its lobe
strength is exposed directly as the sharpness slider.

This adds render targets and fullscreen passes. It can help pixel-bound scenes;
it does not reduce geometry, physics, streaming, shadow or mirror work. It is not
DLSS, temporal reconstruction or frame generation. The first activation can
compile the new render path; changing between active modes does not create new
shader defines. Compare distant road markings and foliage in motion on the actual
GPU before deciding whether the quality/performance tradeoff is worthwhile.
