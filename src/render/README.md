# Render

Turns a `SceneDocument` into a frame. Studio is a client of this folder: gizmos, panels, and the playable editor live in the separate `nabla-studio` repository. A game imports the presenter from here (also re-exported on `src/index.ts`) and does not need Studio.

Nothing in `src/` imports `studio/`.

## Modules

| Path              | Job                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `planet/`         | Stream published tiles, distant relief, sky, sun, flare, sea, and inland water.                |
| `entity/`         | Authored entities, stock trees and lamps, and how driving and flight look.                     |
| `portal/`         | Draw a portal and the place it opens onto. Crossing stays in `simulation/`.                    |
| `shadows.ts`      | Cascaded shadows; per-cascade bias from texel size times a live factor. Studio stores the key. |
| `shadow-tiers.ts` | CSM cascade size and texel bias per quality step.                                              |

The editor host in `studio/main.ts` still wires the canvas, input, and project. That session object moves with Studio when the editor becomes its own repo.
