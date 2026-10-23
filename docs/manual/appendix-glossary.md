# Appendix F. Glossary and source map

[Manual contents](README.md)

| Term                 | Meaning in this repository                                                |
| -------------------- | ------------------------------------------------------------------------- |
| Authored state       | Scene data intended to persist independently of play                      |
| Runtime state        | Mutable poses, controls, constraints, and other live state                |
| Host                 | Application composing engine services and product-specific content        |
| Session              | Owner of one simulation lifetime                                          |
| Browser runtime      | Full composition with renderer, listeners, and scheduling                 |
| Coordinator          | Lower-level shared gameplay runtime without that full browser composition |
| Entity               | Validated scene record with identity, transform, and permitted payloads   |
| Preset               | Reusable concrete content definition/factory                              |
| Presentation adapter | Maps equipment/model conventions to visible behavior                      |
| Rig                  | Authored/generated information about model parts and mounts               |
| Snapshot             | Sample of live simulation/network state for consumption                   |
| Authority            | Owner that decides a contested shared outcome                             |
| Tile/cell            | Geographic content unit identified by zoom and grid coordinates           |
| Manifest             | Metadata describing a particular content format; not one universal schema |
| Cell version         | Terrain content compatibility version                                     |
| Geometry revision    | Identifier for generated geometric representation expectations            |
| Reveal               | Transition from preparation/loading to visible gameplay                   |
| Headless             | Execution without browser rendering or UI                                 |
| XR                   | Immersive VR/AR-related session and input integration                     |

## Find the owner

| Question                              | Source starting point                                                  |
| ------------------------------------- | ---------------------------------------------------------------------- |
| Is this an installable API?           | [package.json](../../package.json), then [appendix A](appendix-api.md) |
| Is this scene valid?                  | [scene/document.ts](../../src/scene/document.ts)                       |
| What can an entity contain?           | [entity/schema.ts](../../src/entity/schema.ts)                         |
| Who owns play/stop?                   | [runtime/session.ts](../../src/runtime/session.ts)                     |
| Who schedules the browser game?       | [runtime/browser.ts](../../src/runtime/browser.ts)                     |
| How does physics advance?             | [simulation.ts](../../src/simulation/simulation.ts)                    |
| How is terrain requested?             | [static-tiles.ts](../../src/render/planet/static-tiles.ts)             |
| How is the world streamed?            | [world.ts](../../src/render/planet/world.ts)                           |
| Who selects vehicle equipment?        | [road-vehicles.ts](../../src/catalog/presentation/road-vehicles.ts)    |
| Who owns a carried weapon?            | [weapon-loadout.ts](../../src/character/weapon-loadout.ts)             |
| Who grants a shared pickup?           | [authority.ts](../../src/net/authority.ts)                             |
| Where do keys come from?              | [input-bindings.ts](../../src/config/input-bindings.ts)                |
| What does the relay enforce?          | [server.mjs](../../services/relay/server.mjs)                          |
| Where is the reference page composed? | [game/main.ts](../../game/main.ts)                                     |

Use `rg` to find a symbol's definition and callers before changing it. A generated
reference page is useful navigation, but the implementation, public export, and
tests establish different kinds of evidence. Read all three for a contract change.
