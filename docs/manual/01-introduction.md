# 1. What Nabla Engine is

[Manual contents](README.md)

Nabla Engine is a TypeScript foundation for interactive 3D applications. Its main
pieces are validated scene data, Rapier physics, Three.js presentation, geographic
terrain streaming, and browser runtime composition. Applications can use the full
browser runtime or select individual public modules.

The engine can represent a local test floor, a geographically anchored scene, or
a streamed world. Implemented systems include walking and vehicle interaction,
wheeled and two-wheeled vehicles, boats and flight, equipment and monitors,
weapons, portals, spatial audio, XR adapters, and multiplayer building blocks.
Those systems have different maturity and integration requirements. Their presence
does not imply a production service, identical device support, or a measured frame rate.

## The surrounding projects

| Component               | Responsibility                                                       |
| ----------------------- | -------------------------------------------------------------------- |
| Engine, `src/`          | Reusable contracts, simulation, presentation, and runtime            |
| Reference game, `game/` | Browser entries, source selection, menus, and host bindings          |
| Atlas                   | Produces and publishes terrain consumed by the engine                |
| Studio                  | Separate editor application consuming engine modules                 |
| Euskadi Online          | Separate application with its own content, branding, and integration |
| `services/`             | Supporting cache/generation, gateway, and relay implementations      |

For example, adding a new car's physics definition belongs in engine-compatible
content; deciding that it is parked at a particular Euskadi street belongs in the
application host. A reusable setting belongs with engine configuration; a product's
opening credits belong with its host.

## Choosing a starting point

Use `/?example=flat` for a first local browser run. Use `PlaySession` for simulation
without a renderer. Use `@nabla/engine/vehicles/wheeled` when you intentionally own
the physics world and stepping yourself. These are distinct integration levels:
the lower level gives you more responsibility for lifecycle and composition.

The drone adapter under `experimental/betaflight` is explicitly experimental.
The WebGPU backend is opt-in and has fallback behavior. Network authority currently
covers selected shared decisions; it is not a complete server-side physics simulator.
Terrain publication compatibility needs the explicit checks in chapter 10.

## Source of truth

- [Package and exports](../../package.json).
- [Browser runtime](../../src/runtime/browser.ts).
- [Headless session](../../src/runtime/session.ts).
- [Experimental drone module](../../src/experimental/betaflight/index.ts).

Next: [installation](02-development.md).
