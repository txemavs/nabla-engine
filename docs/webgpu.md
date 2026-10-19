# WebGPU backend (experimental)

`?renderer=webgpu` (or `?renderer=auto`) creates a `three/webgpu` `WebGPURenderer` through
`src/render/backend.ts`, awaits `init()`, and falls back to `WebGLRenderer` when the browser has no
WebGPU adapter. Without the parameter (or with `?renderer=webgl`) the game creates the same
`WebGLRenderer` as before; the WebGL path is unchanged.

The active backend is on `canvas.dataset.renderer`, in the console (`Nabla renderer: …`) and in
diagnostics samples (`backend`, `webgpuSkipped`).

## Known gaps under WebGPU

GLSL `ShaderMaterial`s cannot compile on the node backend. Under WebGPU the renderer hides every
object that uses one (in frames, mirror captures and warmups), and the pipeline skips GLSL passes:

| Feature                                             | Under WebGPU                        |
| --------------------------------------------------- | ----------------------------------- |
| Sky dome, atmosphere, sun disc, night sky           | Not drawn; flat fog-colour backdrop |
| Clouds (volumetric and artistic)                    | Not drawn                           |
| Lens flare                                          | Not drawn                           |
| Ocean sheet                                         | Not drawn                           |
| Portals (remote views)                              | Not drawn                           |
| Car mirrors (`Reflector` addon)                     | Authored glass, no live reflection  |
| Depth of field, FSR 1 upscaling                     | Disabled                            |
| Exhaust, tyre, muzzle smoke, tyre marks, shot laser | Not drawn                           |
| GPU timer queries (benchmark)                       | WebGL only                          |

Materials patched with `onBeforeCompile` draw as their base three.js material (the patch is
ignored): ground/terrain blend, water, vegetation wind, CSM shadow tweaks, avatar, billboard,
vehicle lamps, destruction fire. They render, but without the custom look.

Next step: port each of these to TSL, one at a time, each with its own measurement.
