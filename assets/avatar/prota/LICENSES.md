# Licences — "prota" player body

All files in this folder are work by **Gepeto** for this project (2026-10-22). Same licence as the
rest of the engine's original assets. Note: the prota base mesh (all versions) started from a
**Tripo** (AI 3D generation) conversion that Gepeto then rebuilt; check Tripo's terms for the plan
it was made with before any redistribution outside this project.

## v4 low (current default, 2026-10-23)

Gepeto's v4 rebuild of the low body and hands, same sockets and colour slots as v3.

| File                     | What                                                               |
| ------------------------ | ------------------------------------------------------------------ |
| `prota.v4.low.glb`       | **Default body** (solid materials with `extras.nabla_color_slot`). |
| `prota.hands.v4.low.glb` | First-person / AR hands for the red (default) actor.               |

## v3 (2026-10-22)

Built with Gepeto's Blender pipeline (`build_v3.py`, `pipe_v3.sh`) from the prota FBX (19,772 tris,
not decimated), with finger weight split. Sockets identical to v2 (0.0 mm difference).

| File                                                | What                                                                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `prota.v3.low.glb`                                  | Previous default body. 16,343 tris, 4 draw calls, solid materials with `extras.nabla_color_slot` (actor colours). |
| `prota.v3.glb`                                      | Textured variant: one material `Prota_Tex`, 2048 px WebP base colour, 1 draw call. Shipped, not wired.            |
| `prota.hands.v3.low.glb` / `prota.hands.v3.glb`     | First-person / AR hands (solid / textured). Shipped, not wired yet.                                               |
| `prota.belt.v3.low.glb` / `prota.belt.v3.glb`       | Duty belt at `BeltSocket` (low is used).                                                                          |
| `prota.holster.v4.low.glb` / `prota.holster.v4.glb` | Holster at `HolsterSocket`; `HolsterGunSocket` seats the pistol (low is used).                                    |
| `prota.baton.v3.low.glb` / `prota.baton.v3.glb`     | Baton at `BatonSocket` (low is used).                                                                             |
| `prota.holster-usp.glb`                             | Gepeto's USP Compact v6, reworked from the engine's own `library/weapons/hk-compact` model; unchanged.            |

## v2 (previous, kept alongside)

`prota.glb`, `prota.belt.glb`, `prota.holster.glb`, `prota.baton.glb`, `prota.hands.glb`: 65
`mixamorig` bones (avatar v6 rest convention), 1.70 m, built with `build.py` / `pipe2.sh`.

Animations are not included: the body uses `../avatar.anims.glb` (Quaternius UAL, CC0, see
`../LICENSES.md`).
