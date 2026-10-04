# Planet rendering

Stream published tiles, distant relief, sky, sun, flare, sea and inland water.

**Owns:** tile workers, ocean cap, water materials, horizon, night sky, debug overlay.
**Does not own:** OSM assembly, the publisher, or quality preference persistence.

- Sea contract: [sea surface](sea-surface.md)
- Assembly: [`src/planet`](../../planet/README.md)
- Diagnostics overlay: [`src/diagnostics`](../../diagnostics/README.md)
- Tests: `test/render`, `test/world`
