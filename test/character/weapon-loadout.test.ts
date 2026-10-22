import { describe, expect, it } from 'vitest'
import { bodySlotDefs } from '../../src/character/body-slots.js'
import type { InventoryDefs } from '../../src/character/inventory.js'
import type { AuthorityItem, GameAuthority, HealthChange, ItemChange } from '../../src/net/authority.js'
import { LocalAuthority, type AuthorityRequest } from '../../src/net/authority.js'
import { WeaponLoadout, type WeaponDef } from '../../src/character/weapon-loadout.js'

const DEFS: InventoryDefs = {
  slots: bodySlotDefs(),
  items: [{ type: 'pistol' }, { type: 'magazine', stack: 4 }, { type: 'bow' }],
}
const WEAPONS: WeaponDef[] = [
  { type: 'pistol', slot: 1, hand: 'right', magazine: 3, ammo: 'magazine' },
  { type: 'bow', slot: 4, hand: 'left' },
]
const O: [number, number, number] = [0, 0, 0]
const F: [number, number, number] = [0, 0, -1]
const make = (authority: GameAuthority) => new WeaponLoadout({ inventory: DEFS, weapons: WEAPONS, authority })
const place = (authority: LocalAuthority, item: string, count: number, position: [number, number, number]) => {
  authority.request({ type: 'drop', item, count, position })
  return lastItem(authority)
}
const lastItem = (authority: LocalAuthority) => {
  let id = ''
  authority.onItems((c) => c.type === 'added' && (id = c.item.id))()
  return id
}

/** Two players in one room: one shared ground, the first pickup request wins (as the relay). */
class Room {
  readonly items = new Map<string, AuthorityItem>()
  private readonly seats = new Set<{ items: (c: ItemChange) => void; health: (c: HealthChange) => void }>()
  private next = 0
  join(self: string): GameAuthority {
    const room = this
    const seat = { items: (_: ItemChange) => {}, health: (_: HealthChange) => {} }
    this.seats.add(seat)
    return {
      self,
      request(r: AuthorityRequest): boolean {
        if (r.type === 'pickup') {
          if (!room.items.delete(r.item)) return true // sent; the relay just never grants it
          room.emit({ type: 'removed', id: r.item, by: self })
        } else if (r.type === 'drop') {
          const item = { id: `${self}.${++room.next}`, item: r.item, count: r.count, position: r.position }
          room.items.set(item.id, item)
          room.emit({ type: 'added', item })
        }
        return true
      },
      onItems(fn) {
        seat.items = fn
        for (const item of room.items.values()) fn({ type: 'added', item })
        return () => {}
      },
      onClaims: () => () => {},
      onHealth(fn) {
        seat.health = fn
        return () => {}
      },
      update() {},
      dispose() {},
    }
  }
  emit(change: ItemChange): void {
    for (const seat of this.seats) seat.items(change)
  }
  health(change: HealthChange): void {
    for (const seat of this.seats) seat.health(change)
  }
}

describe('WeaponLoadout', () => {
  it('spawns unarmed, picks up the pistol, draws it and fires', () => {
    const authority = new LocalAuthority()
    const me = make(authority)
    expect(me.canFire()).toEqual({ ok: false, reason: 'unarmed' })
    expect(me.toggleSlot(1).ok).toBe(false)
    const id = place(authority, 'pistol', 1, [1, 0, -1])
    expect(me.nearest([0, 0, 0])?.id).toBe(id)
    expect(me.pickup(id)).toBe(true)
    // Auto-drawn on pickup.
    expect(me.drawn).toBe('pistol')
    expect(me.fire(O, F).ok).toBe(true)
    expect(me.roundsOf('pistol')).toBe(2)
    // Key 1 holsters, key 1 again draws, fire works again.
    expect(me.toggleSlot(1).ok).toBe(true)
    expect(me.canFire()).toEqual({ ok: false, reason: 'holstered' })
    expect(me.fire(O, F)).toEqual({ ok: false, reason: 'holstered' })
    expect(me.lastRefusal).toBe('holstered')
    expect(me.toggleSlot(1).ok).toBe(true)
    expect(me.fire(O, F).ok).toBe(true)
    expect(me.lastRefusal).toBeNull()
  })

  it('drops the pistol; another player picks it up and fires', () => {
    const room = new Room()
    const a = make(room.join('a'))
    const b = make(room.join('b'))
    room.join('scene').request({ type: 'drop', item: 'pistol', count: 1, position: O })
    a.pickup(a.nearest(O)!.id)
    expect(a.drawn).toBe('pistol')
    expect(a.drop([0.5, 0, 0]).ok).toBe(true)
    expect(a.carries(1)).toBe(false)
    expect(a.canFire()).toEqual({ ok: false, reason: 'unarmed' })
    const dropped = b.nearest(O)!
    expect(dropped.item).toBe('pistol')
    // Both ask; the authority gives it to the first; the second is never granted.
    b.pickup(dropped.id)
    a.pickup(dropped.id)
    expect(a.carries(1)).toBe(false)
    expect(b.drawn).toBe('pistol')
    expect(b.fire(O, F).ok).toBe(true)
    expect(a.ground).toHaveLength(0)
  })

  it('reloads with R from a carried magazine', () => {
    const authority = new LocalAuthority()
    const me = make(authority)
    me.pickup(place(authority, 'pistol', 1, O))
    for (let i = 0; i < 3; i++) expect(me.fire(O, F).ok).toBe(true)
    expect(me.fire(O, F)).toEqual({ ok: false, reason: 'empty' })
    expect(me.reload()).toEqual({ ok: false, reason: 'no magazine' })
    me.pickup(place(authority, 'magazine', 2, O))
    expect(me.reload().ok).toBe(true)
    expect(me.roundsOf('pistol')).toBe(3)
    expect(me.inventory.storedSlots().find(([, s]) => s.type === 'magazine')?.[1].count).toBe(1)
    expect(me.drawn).toBe('pistol')
    expect(me.fire(O, F).ok).toBe(true)
  })

  it('refuses fire while dead and fires again after respawn', () => {
    const room = new Room()
    const me = make(room.join('p1'))
    me.grant({ type: 'pistol', count: 1 }, 'holster.right')
    expect(me.carries(1)).toBe(true)
    expect(me.toggleHolster().ok).toBe(true)
    room.health({ type: 'death', target: 'p1' })
    expect(me.fire(O, F)).toEqual({ ok: false, reason: 'dead' })
    room.health({ type: 'respawn', target: 'p1', health: 100 })
    expect(me.fire(O, F).ok).toBe(true)
  })
})
