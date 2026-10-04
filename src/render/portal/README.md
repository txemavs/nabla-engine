# Portal rendering

Draws a mouth and the place it opens onto. Crossing stays in `simulation/`.

**Owns:** remote projection, clipping, destination sky/environment.
**Does not own:** physical traversal, authored links, or Studio's registry.

Each remote pass evaluates the destination camera's atmosphere, stars, fog and
light intensities, renders the view, then restores the main context. Local paired
portals reuse the main globe. Cross-location windows use a separate destination
scene, capped at two. This is not a remote shadow-cascade implementation.

Altitude is measured against the planet surface. Moving a frame into orbit must
not turn that frame's origin into sea level.

- Entity contract: [`src/entity/portal`](../../entity/portal/README.md)
- World poses: [planetary-world](../../planet/planetary-world.md)
- Play contract: [portals](../../../docs/portals.md)
- Tests: `test/portal`, `test/world`
