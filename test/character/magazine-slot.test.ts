import { describe, expect, it } from 'vitest'
import { keyboardAction } from '../../src/config/input-bindings.js'
import {
  bodySlotForAction,
  bodySlotsAt,
  MAGAZINE_ACTION,
  MAGAZINE_SLOT,
  magazineActionFor,
} from '../../src/character/body-slots.js'

describe('magazine pocket', () => {
  it('is one action: R on foot, drawn or not, and the right chest pocket', () => {
    expect(MAGAZINE_SLOT.id).toBe('chest.right')
    expect(MAGAZINE_ACTION).toBe('weapon.slotR')
    expect(bodySlotForAction(MAGAZINE_ACTION)).toBe(MAGAZINE_SLOT)
    expect(bodySlotsAt('chest')[0]).toBe(MAGAZINE_SLOT)
    expect(keyboardAction('KeyR', { mode: 'walk' })).toBe(MAGAZINE_ACTION)
    expect(keyboardAction('KeyR', { mode: 'walk', weapon: true })).toBe(MAGAZINE_ACTION)
  })
  it('drops, inserts or takes depending on the pistol', () => {
    expect(magazineActionFor({ drawn: true, seated: true })).toBe('drop')
    expect(magazineActionFor({ drawn: true, seated: false })).toBe('insert')
    expect(magazineActionFor({ drawn: false, seated: true })).toBe('take')
  })
})
