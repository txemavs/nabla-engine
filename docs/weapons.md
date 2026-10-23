# Weapons: one owner

`character/weapon-loadout.ts` (`WeaponLoadout`) is the only place that decides what a character
carries, which weapon is drawn, whether it may fire, its rounds and reloads, and pickup / drop.
Everything else reads its state or calls its actions.

```
            pickup (claim granted)           key / holster
  UNARMED ──────────────────────► DRAWN ◄──────────────► HOLSTERED
     ▲                              │  │                     │
     │        drop (0)              │  │ fire: canFire()     │ drop of the last
     └──────────────────────────────┘  │ R: reload()         │ weapon carried
     └─────────────────────────────────┼─────────────────────┘
                                       ▼
                            refused: unarmed | holstered | empty | dead | refused
```

## Rules

1. **One owner.** `WeaponLoadout` holds the `CharacterInventory` (slots, hands), the drawn weapon,
   rounds and the dead flag. No other module keeps a copy; the runtime's sidearm / held weapon
   views follow `onChange` (`GameRuntime.setWeaponLoadout`).
2. **Requests, not calls.** The loadout never talks to a relay. It sends requests through one
   `GameAuthority` (`src/net/authority.ts`, see docs/net.md): `request({type: 'pickup' | 'drop' |
'fire' | 'reload', ...})`, and applies what `onItems` / `onHealth` announce.
3. **The authority decides shared state.** A ground item becomes ours only when `onItems` says it
   was `removed` `by` our `authority.self`; asking is not owning. A drop leaves the hand at once and
   comes back to everyone as `added`. Death / respawn come from `onHealth`. Fire and reload are
   announced (presentation); the loadout's own checks decide whether a shot leaves.
4. **Pickup draws.** A weapon claimed while nothing is drawn goes straight to its hand.
5. **Keys are input only.** Number keys call `toggleSlot`, the holster key `toggleHolster`, the
   drop key the host's `drop`, R on foot (`weapon.magazine`) `reload`, the trigger `fire`. In a
   vehicle R is the horn and weapon keys are off (`contextualAction` overrides apply in walk mode only). A key for a weapon not carried is
   refused with a reason; no key grants a weapon.
6. **Every refusal has a reason.** `fire` logs `[weapon] fire refused: <reason>` once per new
   reason; the runtime also logs `no input focus` and sets `canvas.dataset.fireRefused`.
7. **Rounds.** A weapon with `magazine` counts rounds here (full when first owned); `ammo` names
   the item a reload spends. Without `magazine` the engine sidearm's own chamber simulation counts.
8. **Single player** uses an in-process authority (the engine `LocalAuthority`, or a game's own like
   Euskadi's `KitAuthority`); multiplayer plugs in `RelayAuthority` (or the game's adapter over its shared entities). The loadout is the same.
9. **No loadout set** (test pages): the runtime keeps its free number-key loadout.
