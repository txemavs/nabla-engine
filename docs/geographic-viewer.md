# Geographic GLB viewer

`@nabla/engine/viewer` is a browser-only, framework-independent viewer for local geographic GLBs. It uses Engine's GeographicView and spherical frame (radius 6371000 m), without Studio, world-cache, workers or online imagery.

```ts
import { createGeographicViewer } from '@nabla/engine/viewer'
const viewer = createGeographicViewer(container, {
  origin: { latitude: 43.34, longitude: -1.76, altitude: 0 },
  onCameraChange: (camera) => updateMapMarker(camera),
})
await viewer.loadGlb({ id: 'tile', url: '/tiles/tile.glb', origin: tileOrigin })
viewer.frame()
viewer.setEnvironment({ at: '2026-06-21T12:00:00Z', clouds: true, cloudAmount: 0.35 })
// When a dock tab becomes hidden:
viewer.setActive(false)
// On teardown:
viewer.dispose()
```

Assets are metres in their own east/up/south frame: +X east, +Y up, -Z north. Supply each asset's geographic origin explicitly. Placement rotates neighboring frames consistently; embedded metadata is not automatically interpreted. No geoid conversion is performed, so producers must use a consistent height datum.

`getCamera`/`setCamera` use latitude, longitude, absolute altitude, heading clockwise from north, and pitch in degrees (negative downward). `frame(ids?)` fits visible assets, optionally restricted by ID. `setVisible`, `removeGlb`, and `resize` manage asset and host lifecycle; ResizeObserver handles normal panel resizing. `setActive(false)` suspends rendering. Loading the same ID replaces the previous asset; removal or disposal cancels its pending request. Errors reject the load promise. GLBs with embedded buffers/textures are recommended; meshopt compression is supported, Draco/KTX2 are not configured.

Environment controls are sky, sun, clouds, cloudAmount (0..1), and at (ISO timestamp; omit for live clock). Studio and this viewer consume the same WorldEnvironment adapter: curved OceanSheet sea out to the horizon, solar/lunar key light, ambient fill, fog and sky update. The renderer uses logarithmic depth. The packaged water normal is resolved relative to the Engine module; Earth/Moon image URLs remain disabled in the embedded viewer. It provides illumination, not terrain-cast shadow maps. It is an inspection viewer: assets load on caller request, with no automatic spatial streaming, collision, flight controller, or animation playback. Keep the origin near the viewed region; floating-origin rebasing is not implemented.

Environment additionally accepts sea (default true), seaLevel (-5..50 metres, default 0), and viewDistance (100..1000000 metres, default 80000) for fog. No geographic terrain is requested by the viewer; GLBs are supplied by the host. A camera pitch around -7 degrees at 300 m provides a horizon view. Canvas data-sea is sheet/off and data-sky-phase is day/night/twilight for host diagnostics.

## Swapping and editing loaded assets

These calls are additive: `loadGlb`, `removeGlb`, `setVisible`, `setSurfaceImage(id, image)` and the rest behave exactly as before. None of them does any work per frame; each runs once when called. All are silent no-ops (return `false`, `0` or `[]`) for an id that is not loaded, except that invalid arguments throw like the existing calls.

```ts
// Replace a model without a blank frame: the old one stays until the new one is parsed.
const controller = new AbortController()
await viewer.replaceGlb(
  { id: 'terrain', url: '/cells/b/terrain.glb', origin },
  { signal: controller.signal },
)

viewer.hasAsset('terrain') // true while the swap is still downloading (the old asset)
viewer.listAssets() // [{ id: 'terrain', visible: true, opacity: 1 }]

// Look inside a GLB, hide a part of it, fade it, or drape an image over one part.
viewer.getNodes('terrain') // [{ name: 'Roads', path: 'Terrain/Roads', kind: 'group', ... }, ...]
viewer.setNodeVisible('terrain', 'Roads', false) // returns how many nodes matched
viewer.setNodeSurfaceImage('terrain', /^Surfaces$/, canvas, { flipY: false }) // returns meshes changed
viewer.setSurfaceImage('terrain', canvas, 'Grass') // optional selector: only those meshes
viewer.setAssetOpacity('terrain', 0.5) // 0..1
```

### `replaceGlb(asset, options?)`

Same arguments as `loadGlb`, plus `options.signal`. The download and parse happen off-scene; only when the new GLB is ready does the viewer put it in the scene and dispose the old one, in the same call, so no frame is drawn with neither. If the request or parse fails, the returned promise rejects and the old asset stays. If the signal aborts (or a later `loadGlb`, `replaceGlb` or `removeGlb` of the same id supersedes it), the promise resolves without error and the old asset stays. With nothing loaded under the id it behaves like `loadGlb`.

What carries over to the new asset: `visible` (unless `asset.visible` is given) and the `setAssetOpacity` value. What does not: node visibility and surface images, because the new model may have different nodes. Re-apply them right after `await viewer.replaceGlb(...)`: the continuation runs before the next frame is drawn, so the swap shows no flash.

### Nodes and selectors

`getNodes(id)` lists the descendants of the glTF scene, parents before children, as `{ name, sourceName?, path, kind: 'mesh' | 'group', visible, depth, children, hasUv?, vertices?, triangles?, extras? }`. `path` joins node names with `/` and starts below the glTF scene root. `name` is what three.js's GLTFLoader exposes (spaces become `_`); `sourceName` is the original spelling when it differs, and selectors match either. `extras` is the node's glTF `extras`.

A selector is one of:

- a `string`: exact node name;
- a `RegExp`: tested against the name;
- `{ name?, path?, kind?, extras? }`: all given criteria must match (`name` and `path` take a string or RegExp, `extras` requires strict equality of each listed key); an empty object is rejected because it would match everything;
- a function `(node: ViewerNodeInfo) => boolean`.

`setNodeVisible` matches nodes themselves. A hidden node hides its whole subtree, and keyboard navigation ignores hidden parts (collision and ground checks skip them). `setNodeSurfaceImage` and the `selector` form of `setSurfaceImage` act on the meshes at or under the matched nodes, and skip meshes with no UVs. Image overrides clone materials and never edit the loaded ones, so passing `null` restores them. Overrides on different meshes are independent; on the same mesh the latest call wins. Without a selector, `setSurfaceImage` replaces or restores the whole asset as before. `setNodeSurfaceImage` options: `flipY` (default `false`, glTF UVs start at the top), `colorSpace` (`'srgb'` default or `'linear'`), `anisotropy` (default 8, capped by the GPU). The caller owns the canvas.

### Opacity

`setAssetOpacity(id, opacity)` multiplies each material's own opacity. Below 1 a material becomes transparent with depth writes off, so overlapping translucent surfaces of the same asset can sort imperfectly; 1 restores the loaded state exactly. It may cost some GPU fill rate while below 1 and nothing at 1.

### Known limits

`frame()` still fits the bounds of whole assets, including nodes hidden with `setNodeVisible`. Node and surface calls need the asset to be loaded: a call made while `loadGlb` is still downloading returns 0.
