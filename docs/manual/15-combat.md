# 15. Weapons and combat

[Manual contents](README.md)

Weapon behavior combines a loadout, a weapon state machine, physical queries or
projectile motion, damage decisions, and audiovisual effects. Keep these separate:
a muzzle flash does not establish a hit, and receiving a remote fire event does
not grant authority to change another player's health locally.

`WeaponLoadout` decides whether the character has drawn an eligible weapon and can
fire. Its refusal reasons include being unarmed, holstered, empty, dead, or holding
something that is not a firearm. Firearm modules handle magazine/cadence-related
state; bow and arrow modules have their own draw and flight behavior.

## Data and control flow

1. A logical action reaches the loadout/runtime.
2. The weapon state determines whether an action can occur.
3. The appropriate simulation query or projectile path resolves interaction.
4. Shared outcomes go through authority where applicable.
5. Presentation displays recoil, muzzle effects, casings, marks, and sound.

This sequence is conceptual; inspect the selected weapon's runtime path before
changing exact ordering. Ammunition and remote presentation do not all have the
same authority boundary. The network chapter explains current relay limitations.

## Adding or tuning a weapon

Start with a catalog definition from the same family and inspect its loadout slot,
magazine/ammunition rules, held pose, model, sound, and fire behavior. Tune camera
and pose offsets separately from ballistic or damage values. The engine's
[gameplay tuning](../../src/config/gameplay-tuning.ts) centralizes shared presentation
and behavior settings; avoid scattering copies across HUD and XR handlers.

Run focused regressions, for example:

```sh
npx vitest run test/simulation/recoil.test.ts test/simulation/machine-pistol.test.ts test/weapons/bow.test.ts
```

Then exercise the browser interaction: draw, fire, empty, reload, holster, switch
input context, and drop/pick up. Confirm that effects stop on disposal and that
remote events do not apply damage twice. Bow drawing and arrow flight require
their own verification rather than reusing firearm assumptions.

## Source of truth

- [Loadout state](../../src/character/weapon-loadout.ts).
- [Firearm](../../src/simulation/weapons/firearm.ts) and [magazine](../../src/simulation/weapons/magazine.ts).
- [Ballistics](../../src/simulation/weapons/ballistics.ts).
- [Bow](../../src/simulation/weapons/bow.ts) and [arrow flight](../../src/simulation/weapons/arrow-flight.ts).
- [Damage ledger](../../src/simulation/combat/damage.ts).
- [Runtime shooting](../../src/runtime/shooting.ts).
