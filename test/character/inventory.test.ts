import { describe, expect, it } from 'vitest'
import { CharacterInventory, type InventoryDefs } from '../../src/character/inventory.js'

const defs: InventoryDefs = {
  slots: [
    { id: 'pouch', accepts: ['ammo'] },
    { id: 'holster.left', accepts: ['gun'] },
    { id: 'holster.right', accepts: ['gun'] },
    { id: 'back', accepts: ['bow', 'arrow'] },
  ],
  items: [
    { type: 'gun' },
    { type: 'ammo', stack: 4 },
    { type: 'bow' },
    { type: 'arrow', stack: Infinity },
  ],
}

describe('CharacterInventory', () => {
  it('picks up into the first accepting slot, draws to a hand and stows back', () => {
    const inv = new CharacterInventory('npc-7', defs)
    let changes = 0
    inv.onChange(() => changes++)
    expect(inv.pickup({ type: 'gun', count: 1 })).toEqual({ ok: true, slot: 'holster.left' })
    expect(inv.pickup({ type: 'gun', count: 1 })).toEqual({ ok: true, slot: 'holster.right' })
    expect(inv.pickup({ type: 'gun', count: 1 }).ok).toBe(false)
    expect(inv.draw('holster.left', 'right')).toMatchObject({ ok: true, hand: 'right' })
    expect(inv.stored('holster.left')).toBeNull()
    expect(inv.draw('holster.right', 'right').ok).toBe(false)
    expect(inv.stow('right')).toMatchObject({ ok: true, slot: 'holster.left' })
    expect(inv.inHand('right')).toBeNull()
    expect(changes).toBe(4)
  })

  it('stacks, keeps infinite stacks and round-trips the wire form', () => {
    const inv = new CharacterInventory('player', defs)
    inv.pickup({ type: 'ammo', count: 3 })
    inv.pickup({ type: 'ammo', count: 3 })
    expect(inv.stored('pouch')).toEqual({ type: 'ammo', count: 4 })
    inv.pickup({ type: 'arrow', count: Infinity })
    inv.draw('back', 'right')
    expect(inv.stored('back')!.count).toBe(Infinity)
    inv.draw('pouch', 'left')
    const wire = inv.toWire()
    expect(wire).toEqual({
      i: [
        [0, 2, 3],
        [3, 4, -1],
      ],
      h: [2, 4],
    })
    const copy = new CharacterInventory('remote', defs)
    copy.applyWire(wire)
    expect(copy.stored('back')).toEqual({ type: 'arrow', count: Infinity })
    expect(copy.inHand('left')).toEqual({ type: 'ammo', count: 1 })
    expect(copy.key()).toBe(inv.key())
  })
})
