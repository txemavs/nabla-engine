# Compressed planet tiles (meshopt + KTX2)

The planet tile worker (`src/render/planet/worker.ts`) can load Atlas tile GLBs that use:

- `EXT_meshopt_compression` with `KHR_mesh_quantization` (geometry), decoded by
  `meshoptimizer`'s `MeshoptDecoder` in the worker;
- `KHR_texture_basisu` (KTX2, ETC1S or UASTC), transcoded in the worker by the Basis Universal
  transcoder to a GPU format the renderer samples.

Plain GLBs (float32 geometry, PNG/JPEG textures) take exactly the same path as before: the
decoders only run when a GLB declares those extensions. No manifest change is needed; a
compressed file is recognised from its own `extensionsRequired`.

## Data flow

1. Main thread: `detectCompressedTextureSupport(renderer)` (WebGL2 extensions or WebGPU
   features, with KTX2Loader's Linux/Mesa emulated-format filter) is stored as
   `PlanetWorld.textureSupport` and sent with every tile request.
2. Worker: `configureTileLoader` wires `MeshoptDecoder` and a `KTX2Loader` (own loading manager,
   so the "self-contained GLB" URL guard still applies to tiles) into the tile `GLTFLoader`.
   Basis targets, in KTX2Loader's order: ASTC / BC7 (UASTC) or ETC1/BC1/ETC2 (ETC1S), and RGBA8
   when the renderer reports no compressed format.
3. `convertPlanetGlbMesh` dequantizes geometry to float32 tile metres (as for plain GLBs) and
   copies the transcoded mips into `PlanetMesh.compressedMap` (one owned buffer per level).
   The buffers are transferred to the main thread, never copied or decoded there.
4. Main thread: `install` wraps `compressedMap` in a `THREE.CompressedTexture`; `prepareGpu`
   uploads it with `initTexture` one texture per step, as with photo textures. Mips come from the
   file, so the GPU does not generate them.

## Serving the transcoder

`assets/basis/basis_transcoder.js` and `.wasm` (copied from three r186) are served at `/basis/`
by the engine's Vite configs. Applications that serve them elsewhere set
`tiles.basisTranscoderPath`. Only compressed tiles download them.

## Limits

- Geometry is still expanded to float32 for rendering and collision: meshopt saves download and
  cache bytes, not geometry VRAM.
- Texture VRAM drops about 4× with BC7/ASTC/ETC2 versus RGBA8.
- Neighbouring cells quantized on different grids can differ by about 1 cm at the seam; Atlas
  should quantize on a fixed per-cell grid.

## Planned manifest flag (not implemented)

Atlas may later publish compressed variants next to the current files and declare them per
layer, for example `"compression": "meshopt+ktx2"` (optionally `"lod": "far"` for an ETC1S
light variant). The engine must ship these decoders before any manifest points to such files.
