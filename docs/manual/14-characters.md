# 14. Characters and interaction

[Manual contents](README.md)

Character behavior spans physical movement, visible avatar animation, inventory,
and interaction. Keep those state owners distinct. A visible hand is not the source
of truth for whether an item is held; an inventory slot is not itself a physical
pickup lying on the ground.

`CharacterInventory` models carried items and body slots. `WeaponLoadout` coordinates
the selected weapon, ammunition, pickup/drop, and firing eligibility. It delegates
contested world decisions to `GameAuthority`. The renderer and HUD read state
rather than maintaining parallel inventories.

## Movement and vehicles

The simulation owns physical player motion and support interaction. The runtime
maps input into walking, jumping, driving, and other contexts. Entering a vehicle
and leaving it are simulation transitions, not merely moving the camera into or
out of a model. Safe exits need a usable destination and collision clearance.

Avatar representation follows movement and equipment state. Driver pose and rider
animation are presentation concerns with physical input where the vehicle model
explicitly supports it. Changing an animation must not inadvertently change the
logical ownership of a seat or item.

## Practical interaction design

For a new pickup, define its item type, world representation, and inventory rules.
Route the request through the authority, then apply the resulting item event.
Test two requests for the same object: only the accepted outcome should grant it.
The [contracts example](../../examples/manual/contracts.mjs) demonstrates this with
`LocalAuthority`, including listener cleanup.

For another control source, call the existing logical action rather than directly
mutating inventory fields. Keyboard, XR grab, touch, and an agent-controlled actor
should agree on the same rules. When changing body slots, inspect both inventory
definitions and visible attachment mappings so that a carried item is represented
in the correct place.

Test interaction while on foot, seated, paused, and after disposal or reconnection.
State-dependent failures should have a reason that the host can display; repeatedly
trying an unavailable action must not duplicate objects or subscriptions.

## Source of truth

- [Character public module](../../src/character/index.ts).
- [Inventory](../../src/character/inventory.ts) and [body slots](../../src/character/body-slots.ts).
- [Loadout](../../src/character/weapon-loadout.ts).
- [Player simulation](../../src/simulation/simulation.ts).
- [Avatar presentation](../../src/render/entity/avatar.ts).
