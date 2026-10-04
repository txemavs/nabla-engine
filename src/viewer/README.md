# Viewer

Geographic viewing API used by Atlas. Viewing does not imply driving or physics
acceptance.

**Owns:** local GLB inspection without a play session.
**Does not own:** simulation, vehicles, world-cache, or Studio projects.

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

- Generated reference: [REFERENCE.md](REFERENCE.md)
