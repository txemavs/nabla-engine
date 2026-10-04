# Native planetary tiles

Game, editor, remote portal views, and the zoom viewer share `PlanetWorld`.
Generated context is addressed as `WebMercatorQuad/{z}/{x}/{y}`, stored at
`z/{z}/{x}/{y}/`. Supported zooms are 13, 14 and 15.

The publisher pipeline, on-disk layout, hashes and prepare/publish queue live in
[native generation](../../services/world-cache/native-generation.md). Runtime
owners: [`src/planet`](../../src/planet/README.md) for contracts and assembly,
[`src/render/planet`](../../src/render/planet/sea-surface.md) for streamed tiles
and sea, [`src/scene/mercator`](../../src/scene/README.md) for addressing.

The engine uses a mean-radius Earth sphere. This is not a WGS84 ellipsoid or a
conversion between geoidal and ellipsoidal heights. Accurate geodetic/vertical
datum conversion remains future work.

Local-grid and earlier BIN/JSON loaders are historical. Do not use them to
populate the active world.
