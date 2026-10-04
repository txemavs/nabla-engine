# Planetary addresses

A scene's geographic origin is a **working frame**, not the address of the world
and not a constraint on which destinations a project may contain. Rendering and
physics need nearby coordinates; persistence and identity need planet-wide ones.

Engine implementation: [WorldPose, reframing and portal atmospheres](../src/planet/planetary-world.md).
Numeric frame: [`src/math/geo`](../src/math/geo/README.md). Studio persistence:
[named projects](studio-projects.md).

## What remains before an Australia portal is playable

The runtime still runs one active local scene. World poses are a persistence and
coordinate foundation, not a completed planet-wide streaming runtime.

1. Make working sets spatial caches selected around observers and open portal
   destinations, rather than the ownership boundary for authored objects.
2. Implemented for remote windows: resolve endpoints by global root UUID plus child/entity reference.
3. Implemented for retained destination scenes: wait for assets before showing the window.
   Additional destination streaming and loading feedback remain to be added.
4. Implemented for rendering: map the observer into a separate destination frame,
   scene and atmosphere with a bounded draw distance. Remote collision remains unimplemented.
5. Transfer a player or vehicle hierarchy, orientation and velocities atomically;
   remove its old runtime body without changing its global identity or duplicating it.
6. Keep a ship's orbital frame alive while its pilot is on Earth. Avoid serializing
   physics motion into authored edit history unless explicitly requested.

Do not feed Sydney coordinates into Madrid's physics scene as multi-million-metre
floats. Full world-object transfer is not yet wired into Studio. Named remote-window
routing is available; see [the portal registry](studio-projects.md#named-portal-registry-and-remote-windows).
