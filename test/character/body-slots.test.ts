import { describe, expect, it } from 'vitest'
import { BODY_SLOTS, bodySlotDefs, bodySlotForAction, bodySlotsAt, bodySlotsFor, DROP_ACTION } from '../../src/character/body-slots.js'
import { CharacterInventory } from '../../src/character/inventory.js'
import { inputBindings } from '../../src/config/input-bindings.js'

describe('body slots', () => {
  it('is the agreed key table', () => {
    expect(BODY_SLOTS.map((s) => `${s.key} ${s.id} ${s.accepts[0]}`)).toEqual([
      '1 holster.right pistol',
      '2 holster.left baton',
      '3 back.right arrows',
      '4 back.left bow',
      'R chest.right magazine',
      'M chest.left magazine',
      '5 belt.1 magazine',
      '6 belt.2 magazine',
      '7 belt.3 magazine',
      '8 belt.4 magazine',
      '9 belt.5 magazine',
    ])
    expect(new Set(BODY_SLOTS.map((s) => s.key)).size).toBe(BODY_SLOTS.length)
  })
  it('binds every slot and the drop key on foot', () => {
    const bindings = inputBindings as unknown as Record<string, { keys: readonly string[]; scopes: readonly string[] }>
    const keyOf = (k: string) => (/^\d$/.test(k) ? `Digit${k}` : `Key${k}`)
    for (const s of BODY_SLOTS) {
      expect(bindings[s.action]?.keys).toEqual([keyOf(s.key)])
      expect(bindings[s.action]?.scopes).toEqual(['walk'])
      expect(bodySlotForAction(s.action)).toBe(s)
    }
    expect(bindings[DROP_ACTION]?.keys).toEqual(['Digit0'])
  })
  it('puts the first pistol in the right holster and feeds VR anchors and the inventory', () => {
    expect(bodySlotsFor('pistol').map((s) => s.id)).toEqual(['holster.right', 'holster.left'])
    expect(bodySlotsFor('pistol')[0].xr[0]).toBeGreaterThan(0)
    expect(bodySlotsAt('chest').map((s) => s.key)).toEqual(['R', 'M'])
    const inventory = new CharacterInventory('p', { slots: bodySlotDefs(), items: [{ type: 'pistol' }, { type: 'knife' }] })
    expect(inventory.pickup({ type: 'pistol', count: 1 })).toMatchObject({ ok: true, slot: 'holster.right' })
    expect(inventory.pickup({ type: 'knife', count: 1 })).toMatchObject({ ok: true, slot: 'chest.right' })
  })
})
