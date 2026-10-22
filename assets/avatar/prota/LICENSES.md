# Licences — "prota" player body

All files in this folder are original work by **Gepeto** for this project (2026-10-22), no
third-party mesh data. Same licence as the rest of the engine's original assets.

| File                    | What                                                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prota.glb`             | Skinned body, 65 `mixamorig` bones (avatar v6 rest convention), 1.70 m. Sockets `HeadSocket`, `WeaponSocket_R`, `BeltSocket`, `BatonSocket`, `HolsterSocket`. Materials carry `extras.nabla_color_slot` (primary / secondary / tertiary / light). |
| `prota.belt.glb`        | Duty belt, hung at `BeltSocket`.                                                                                                                                                                                                                  |
| `prota.holster.glb`     | Holster, hung at `HolsterSocket`; `HolsterGunSocket` seats the pistol.                                                                                                                                                                            |
| `prota.holster-usp.glb` | Gepeto's USP Compact v6 (`/workspace/gepeto/usp/hk-compact-low.glb`), reworked from the engine's own `library/weapons/hk-compact` model; shown in the holster with empty hands.                                                                   |
| `prota.baton.glb`       | Baton, hung at `BatonSocket`.                                                                                                                                                                                                                     |
| `prota.hands.glb`       | First-person / AR hands (skinned, mixamorig hand bones). Shipped, not wired yet.                                                                                                                                                                  |

Built with Gepeto's Blender pipeline (`build.py`, `pipe2.sh`) from an original base mesh made for
this project. Animations are not included: the body uses `../avatar.anims.glb` (Quaternius
UAL, CC0, see `../LICENSES.md`).
