# Render

Turns a `SceneDocument` into a frame. Studio is a client of this folder: gizmos, panels, and the playable editor stay in `studio/`, which will leave this repo. A game imports the presenter from here (also re-exported on `src/index.ts`) and does not need Studio.

Nothing in `src/` imports `studio/`.

## Modules

| Path                        | Job                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `planet/`                   | Stream published tiles, distant relief, sky, sun, flare, sea, and inland water.           |
| `entity/`                   | Authored entities, stock trees and lamps, and how driving and flight look.                |
| `portal/`                   | Draw a portal and the place it opens onto. Crossing stays in `simulation/`.               |
| `monitors/`                 | Layered GPU displays and keyboard menus.                                                  |
| `vehicle-presentation/`     | Mounts, retractable supports, instruments, lights, mirrors and cameras.                   |
| `effects/`                  | Reusable post-process and tyre marks/smoke.                                               |
| `shadows.ts`                | Cascaded shadows. The quality keys live in `shadow-tiers.ts`; Studio only stores the key. |
| `shadow-tiers.ts`           | CSM cascade size per quality step.                                                        |
| `capture.ts` / photo-export | Tiled PNG export. Studio owns the button.                                                 |

The editor host lives in the separate Studio repo. That session object is not
an Engine owner.

- Sea: [sea surface](planet/sea-surface.md)
- Photos: [photo export](photo-export.md)
- Monitors: [library](monitors/README.md) · [editing](monitors/editing.md)
- Portals: [portal rendering](portal/README.md)
- Equipment: [vehicle presentation](vehicle-presentation/README.md)
- Tests: `test/render`
