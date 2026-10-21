# Arco

The engine's default bow: held on foot (weapon slot 4) and the two-hand XR bow.

- `arco.glb` (28 KB): nodes `Arco` > `Bow`, `Bow_String`, `Arrow`, identity transforms. Grip at the
  origin, +Y up, -Z toward the target, string at +Z, metres. One material with a 512 px WebP
  atlas; EXT_meshopt_compression, KHR_mesh_quantization (normals), EXT_texture_webp.
- Bound in `src/runtime/bow-model.ts` (`arcoBow`, the `defaultBow`). `Bow_String` is not drawn:
  the engine draws its own dynamic string.

## License

Original model made for the Nabla engine / Euskadi Online (Gepeto, 2026). Same license as the
engine repository; no third-party credit required.
