# WebGPU backend (experimental)

`?renderer=webgpu` (or `?renderer=auto`) creates a `three/webgpu` `WebGPURenderer` through
`src/render/backend.ts`, awaits `init()`, and falls back to `WebGLRenderer` when the browser has no
WebGPU adapter. Without the parameter (or with `?renderer=webgl`) the game creates the same
`WebGLRenderer` as before; the WebGL path is unchanged.

The active backend is on `canvas.dataset.renderer`, in the console (`Nabla renderer: …`) and in
diagnostics samples (`backend`, `webgpuSkipped`).

## Known gaps under WebGPU

GLSL `ShaderMaterial`s cannot compile on the node backend. Under WebGPU the renderer hides every
object that uses one (in frames, mirror captures and warmups) unless a TSL twin is registered with
`setWebGPUSubstitute` (`src/render/webgpu-substitutes.ts`), and the pipeline skips GLSL passes.

The sky scene renders in display space into an 8-bit target and is composited through the inverse
of the ACES + sRGB output transform, so it blends exactly like WebGL. Parity is checked by
`test/browser/e2e/webgpu-sky-parity.spec.ts` (screenshots with `NABLA_PARITY_SHOTS=<dir>`).

| Feature                                   | Under WebGPU                    |
| ----------------------------------------- | ------------------------------- |
| Sky dome, atmosphere, sun disc, night sky | TSL port (`sky-nodes.ts`)       |
| Clouds (volumetric and artistic)          | TSL port (`cloud-nodes.ts`)     |
| Lens flare                                | Not drawn                       |
| Ocean sheet, river, sea                   | TSL twins (`surface-nodes.ts`)  |
| Portals (remote views)                    | Not drawn                       |
| Car mirrors (`Reflector` addon)           | TSL twin (`mirror-nodes.ts`)    |
| Depth of field, FSR 1 upscaling           | Disabled                        |
| Exhaust, tyre, muzzle smoke, tyre marks   | TSL twins (`particle-nodes.ts`) |
| Shot laser                                | Not drawn                       |
| GPU timer queries (benchmark)             | WebGL only                      |

Cascaded shadows use three's `CSMShadowNode` on one shadow-casting sun (`ShadowManager` with
`nodeKit`): same cuts, margin, radius, fade, per-texel bias and bound padding as the WebGL CSM addon.
The WebGL-only chunk tweaks (frozen PCF kernel, widened seam fade, projected shadow depth) are not
ported; `webgpu-shadow-parity.spec.ts` measures the remaining edge differences.

WebGPU tone-maps the whole frame in its output pass; WebGL tone-maps per material and clears to the
background colour as is. For on-screen frames `WebGPUCompatibility` draws `toneMapped: false`
materials (lamps, instruments, screens) through a node twin whose output passes the inverse tone
curve, and gives a background colour the same inverse as its `backgroundNode`, so both come out as
under WebGL (`webgpu-tone-parity.spec.ts`). Render targets get no output pass in either backend.

Car mirrors keep the `Reflector` capture schedule (`CarMirrors`); under WebGPU the capture runs
through `reflectWebGPU` (same mirrored camera, oblique near plane for [0, 1] clip depth) and the
glass draws a node twin of the Reflector shader, with the sky pass painted into each capture.
Substitutes inside a capture (smoke, tyre marks) blend as raw colours there, as under WebGL
(`webgpu-mirror-parity.spec.ts`).

Tyre, exhaust and muzzle smoke draw as instanced node sprites (`particle-nodes.ts`) that blend in
display space against the frame below the draw (a dense plume core comes out slightly dimmer);
tyre marks use a node material on the same ring-buffer mesh; the A3 masked lenses get TSL masks
(`a3-lamps.ts`). `webgpu-vehicle-parity.spec.ts` covers them.

Built-in materials patched with `onBeforeCompile` register a TSL twin with
`addWebGPUMaterialNodes` (`surface-nodes.ts`): asphalt contrast, river and ocean-sheet waves, the
sea's shadowed flat colour and glint (a small lighting model), and the tree crowns (an object
substitute, which also adds a per-instance `treeHeight` attribute because node positions run after
instancing). The ground cloud shadow multiplies the sun's shadow factor on Lambert and Toon
materials, the only programs the GLSL patch matches. `webgpu-surface-parity.spec.ts` covers them.

Materials patched with `onBeforeCompile` draw as their base three.js material (the patch is
ignored): ground/terrain blend, water, vegetation wind, CSM shadow tweaks, avatar, billboard,
vehicle lamps, destruction fire. They render, but without the custom look.

Next step: port each of these to TSL, one at a time, each with its own measurement.
