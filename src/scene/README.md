# Scene

The JSON document, its undo history, and the rigid transform graph.

**Owns:** parse/validate, transactions, tile identity, Mercator addressing,
circuit-plan footprints.
**Does not own:** picking, gizmos, or panels.

`mercator.ts` is the canonical `WebMercatorQuad` identifier and zoom plan. The
tile-policy decision lives in
[map zoom streaming](../../docs/architecture/map-zoom-streaming.md).

- Entity schemas: [`src/entity`](../entity/README.md)
- Tests: `test/scene`
