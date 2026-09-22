# A3 finish comparison — 2026-09-22

Both GLBs contain the assembled vehicle body, four wheels and steering wheel, with
embedded textures. They were exported from the runtime SceneView at rest.

- `a3-rejected-finish-2026-09-22.glb`: snapshot before rollback, including matte cabin,
  paint roughness 0.2 and polished chrome roughness 0.12.
- `a3-original-finish-2026-09-22.glb`: original source-asset material parameters,
  before either runtime finish adjustment. This is the restored finish used in the app.

Scene environment lighting, cascaded shadows, live mirrors and interactive displays
are application features, not embedded lighting in these GLBs. A viewer will use its
own environment; use the same lighting for both files when comparing materials.

The original source body, wheel and steering GLBs remain unchanged. These snapshots
are inspection artifacts and are not loaded by gameplay.
