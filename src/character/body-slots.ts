/**
 * The body's carry slots: one table for every input. Web keys (`weapon.slot<key>` actions in
 * the input bindings), VR/AR grabs ({@link XRLoadout} places its holsters and pockets at
 * {@link BodySlot.xr}) and the game's inventory ({@link bodySlotDefs}) all read it.
 *
 * Item types are generic names the game defines ({@link InventoryDefs}); chest and belt pockets
 * take any of the {@link SMALL_ITEMS}.
 */
import type { Hand, SlotDef } from './inventory.js'

export type BodySlotKey = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'R' | 'M'

export interface BodySlot {
  /** Inventory slot id, e.g. `holster.right`. */
  id: string
  /** Key label; the physical key lives in the input bindings under {@link BodySlot.action}. */
  key: BodySlotKey
  action: `weapon.slot${BodySlotKey}`
  place: 'holster' | 'back' | 'chest' | 'belt'
  side: 'left' | 'right' | 'center'
  /** Item types the slot takes; the first is what it is made for. */
  accepts: readonly string[]
  /** Hand an item drawn from here goes to. */
  hand: Hand
  /** Socket on the actor model that shows the stored item, when the model has one. */
  socket: string | null
  /** VR/AR anchor in body space (metres from the head-tracked body origin; +X right, −Z forward). */
  xr: readonly [number, number, number]
}

const slot = (
  key: BodySlotKey,
  id: string,
  place: BodySlot['place'],
  side: BodySlot['side'],
  accepts: string[],
  hand: Hand,
  socket: string | null,
  xr: [number, number, number],
): BodySlot => ({ id, key, action: `weapon.slot${key}`, place, side, accepts, hand, socket, xr })

/** Small items the chest and belt pockets take. */
export const SMALL_ITEMS = ['magazine', 'flashlight', 'handcuffs', 'knife'] as const

export const BODY_SLOTS: readonly BodySlot[] = [
  slot('1', 'holster.right', 'holster', 'right', ['pistol'], 'right', 'HolsterGunSocket', [0.25, -0.57, -0.08]),
  slot('2', 'holster.left', 'holster', 'left', ['baton', 'pistol'], 'right', 'BatonSocket', [-0.25, -0.57, -0.08]),
  slot('3', 'back.right', 'back', 'right', ['arrows'], 'right', null, [0.15, -0.15, 0.15]),
  slot('4', 'back.left', 'back', 'left', ['bow'], 'left', null, [-0.15, -0.15, 0.15]),
  slot('R', 'chest.right', 'chest', 'right', [...SMALL_ITEMS], 'left', null, [0.14, -0.3, -0.24]),
  slot('M', 'chest.left', 'chest', 'left', [...SMALL_ITEMS], 'left', null, [-0.14, -0.3, -0.24]),
  ...(['5', '6', '7', '8', '9'] as const).map((key, i) =>
    slot(key, `belt.${i + 1}`, 'belt', 'center', [...SMALL_ITEMS], 'left', i === 2 ? 'BeltSocket' : null, [
      (i - 2) * 0.1,
      -0.55,
      i === 2 ? -0.14 : -0.1,
    ]),
  ),
]

/** Action that drops what is in hand to the ground (key 0). */
export const DROP_ACTION = 'item.drop'

export function bodySlot(id: string): BodySlot | undefined {
  return BODY_SLOTS.find((s) => s.id === id)
}
export function bodySlotForAction(action: string): BodySlot | undefined {
  return BODY_SLOTS.find((s) => s.action === action)
}
/** Slots that take `type`, in table order (the first is its home). */
export function bodySlotsFor(type: string): BodySlot[] {
  return BODY_SLOTS.filter((s) => s.accepts.includes(type))
}
/** Slots of one place (e.g. the holsters) for VR/AR anchors, in table order. */
export function bodySlotsAt(place: BodySlot['place']): BodySlot[] {
  return BODY_SLOTS.filter((s) => s.place === place)
}
/** The table as inventory slot definitions. */
export function bodySlotDefs(): SlotDef[] {
  return BODY_SLOTS.map((s) => ({ id: s.id, accepts: [...s.accepts] }))
}
