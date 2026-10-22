/**
 * What a character carries: items stored in named attachment slots (holster, pouch, back…)
 * and items in its hands. A character is any body the game simulates (a player, an NPC); the
 * inventory belongs to the character, not to a connection or an input device. Actions are plain
 * calls (pickup, draw, stow) so keyboard, VR grabs and AI drive the same code.
 *
 * Slots and item types are game data ({@link InventoryDefs}); the engine knows no item names.
 * The wire form ({@link CharacterInventory.toWire}) uses indices into those tables.
 */

export type Hand = 'left' | 'right'
export const HANDS: readonly Hand[] = ['left', 'right']

/** An attachment point on the body that holds one stack of the item types it accepts. */
export interface SlotDef {
  id: string
  accepts: readonly string[]
}

/** An item type: `stack` is how many fit in one slot (default 1; Infinity for unlimited). */
export interface ItemDef {
  type: string
  stack?: number
}

export interface InventoryDefs {
  slots: readonly SlotDef[]
  items: readonly ItemDef[]
}

/** A number of items of one type; `count` may be Infinity (e.g. an endless quiver). */
export interface ItemStack {
  type: string
  count: number
}

export type ActionResult = { ok: true; slot?: string; hand?: Hand } | { ok: false; reason: string }

/**
 * Wire form: `i` stored stacks as [slot index, item index, count] (count -1 = infinite) and
 * `h` the item index in each hand [left, right], 0 = empty (item indices are 1-based).
 */
export interface InventoryWire {
  i: [number, number, number][]
  h: [number, number]
}

export const WIRE_MAX_STACKS = 32
export const WIRE_MAX_COUNT = 9999

export class CharacterInventory {
  private readonly slots = new Map<string, ItemStack>()
  private readonly held: Record<Hand, ItemStack | null> = { left: null, right: null }
  private readonly listeners = new Set<(inventory: CharacterInventory) => void>()

  constructor(
    /** The character this belongs to (player, NPC…), as the game names it. */
    readonly characterId: string,
    readonly defs: InventoryDefs,
  ) {}

  /** The stack in `slot`, or null. */
  stored(slot: string): ItemStack | null {
    const stack = this.slots.get(slot)
    return stack ? { ...stack } : null
  }

  /** Every stored stack by slot id. */
  storedSlots(): [string, ItemStack][] {
    return [...this.slots].map(([slot, stack]) => [slot, { ...stack }])
  }

  /** The item in `hand`, or null. */
  inHand(hand: Hand): ItemStack | null {
    const stack = this.held[hand]
    return stack ? { ...stack } : null
  }

  /** Called after every change (local actions and {@link applyWire}). Returns an unsubscribe. */
  onChange(listener: (inventory: CharacterInventory) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Store an item from the ground (or anywhere) in `slot`, or the first slot that takes it. */
  pickup(item: ItemStack, slot?: string): ActionResult {
    const target = slot ?? this.freeSlotFor(item.type)
    if (!target) return { ok: false, reason: `no slot for ${item.type}` }
    const added = this.addTo(target, item)
    if (!added.ok) return added
    this.changed()
    return { ok: true, slot: target }
  }

  /** Take one item out of `slot` into `hand` (the hand must be empty). */
  draw(slot: string, hand: Hand = 'right'): ActionResult {
    const stack = this.slots.get(slot)
    if (!stack) return { ok: false, reason: `${slot} is empty` }
    if (this.held[hand]) return { ok: false, reason: `${hand} hand is full` }
    this.held[hand] = { type: stack.type, count: 1 }
    if (Number.isFinite(stack.count)) {
      stack.count -= 1
      if (stack.count <= 0) this.slots.delete(slot)
    }
    this.changed()
    return { ok: true, slot, hand }
  }

  /** Put what `hand` holds back into `slot`, or the first slot that takes it. */
  stow(hand: Hand = 'right', slot?: string): ActionResult {
    const item = this.held[hand]
    if (!item) return { ok: false, reason: `${hand} hand is empty` }
    const target = slot ?? this.freeSlotFor(item.type)
    if (!target) return { ok: false, reason: `no slot for ${item.type}` }
    const added = this.addTo(target, item)
    if (!added.ok) return added
    this.held[hand] = null
    this.changed()
    return { ok: true, slot: target, hand }
  }

  /** Drop what `hand` holds (e.g. on the ground); returns it. */
  release(hand: Hand = 'right'): ItemStack | null {
    const item = this.held[hand]
    if (!item) return null
    this.held[hand] = null
    this.changed()
    return item
  }

  /** The first slot that accepts `type` and has room (same type, below its stack size). */
  freeSlotFor(type: string): string | null {
    for (const def of this.defs.slots) {
      if (!def.accepts.includes(type)) continue
      const stack = this.slots.get(def.id)
      if (!stack) return def.id
      if (stack.type === type && stack.count < this.stackSize(type)) return def.id
    }
    return null
  }

  toWire(): InventoryWire {
    const slotIndex = (id: string) => this.defs.slots.findIndex((s) => s.id === id)
    const itemIndex = (type: string) => this.defs.items.findIndex((i) => i.type === type) + 1
    const i: [number, number, number][] = []
    for (const [slot, stack] of this.slots) {
      const s = slotIndex(slot)
      const t = itemIndex(stack.type)
      if (s < 0 || t <= 0 || i.length >= WIRE_MAX_STACKS) continue
      const count = Number.isFinite(stack.count) ? Math.min(WIRE_MAX_COUNT, stack.count) : -1
      i.push([s, t, count])
    }
    const hand = (h: Hand) => (this.held[h] ? itemIndex(this.held[h]!.type) : 0)
    return { i, h: [hand('left'), hand('right')] }
  }

  /** Replace the state with a received wire form (remote characters); unknown indices are skipped. */
  applyWire(wire: InventoryWire): void {
    this.slots.clear()
    for (const [s, t, count] of wire.i) {
      const slot = this.defs.slots[s]
      const item = this.defs.items[t - 1]
      if (!slot || !item) continue
      this.slots.set(slot.id, { type: item.type, count: count < 0 ? Infinity : count })
    }
    HANDS.forEach((hand, k) => {
      const item = this.defs.items[wire.h[k] - 1]
      this.held[hand] = item ? { type: item.type, count: 1 } : null
    })
    this.changed()
  }

  /** Compact key of the state: equal keys mean nothing visible changed. */
  key(): string {
    return JSON.stringify(this.toWire())
  }

  private stackSize(type: string): number {
    return this.defs.items.find((i) => i.type === type)?.stack ?? 1
  }

  private addTo(slot: string, item: ItemStack): ActionResult {
    const def = this.defs.slots.find((s) => s.id === slot)
    if (!def) return { ok: false, reason: `no slot ${slot}` }
    if (!def.accepts.includes(item.type)) return { ok: false, reason: `${slot} does not take ${item.type}` }
    const stack = this.slots.get(slot)
    if (stack && stack.type !== item.type) return { ok: false, reason: `${slot} holds ${stack.type}` }
    const size = this.stackSize(item.type)
    const count = Math.min(size, (stack?.count ?? 0) + item.count)
    if (stack && stack.count >= size) return { ok: false, reason: `${slot} is full` }
    this.slots.set(slot, { type: item.type, count })
    return { ok: true, slot }
  }

  private changed(): void {
    for (const listener of this.listeners) listener(this)
  }
}
