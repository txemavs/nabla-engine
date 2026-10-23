import { describe, expect, it } from 'vitest'
import { contextualAction, keyboardAction } from '../../src/config/input-bindings.js'

const vehicleModes = ['road', 'bike', 'forklift', 'flight'] as const

describe('vehicle input routing with a weapon owned', () => {
  for (const mode of vehicleModes) {
    it(`Y recovers and never reloads in ${mode}`, () => {
      const context = { mode, weapon: true }
      expect(keyboardAction('KeyY', context)).toBe('recover')
      expect(contextualAction('recover', context)).toBe('recover')
    })
    it(`no key resolves to a weapon action in ${mode}`, () => {
      const context = { mode, weapon: true, aiming: true }
      for (const code of ['KeyR', 'KeyY', 'KeyT', 'KeyQ', 'KeyE', 'KeyG', 'KeyL', 'KeyB', 'KeyV', 'KeyF'])
        expect(keyboardAction(code, context) ?? '').not.toMatch(/^weapon\./)
    })
  }
  it('R is the horn in a car', () => {
    expect(keyboardAction('KeyR', { mode: 'road', weapon: true })).toBe('horn')
  })
  it('on foot Y recovers and R handles the magazine', () => {
    expect(keyboardAction('KeyY', { mode: 'walk', weapon: true })).toBe('recover')
    expect(contextualAction('recover', { mode: 'walk', weapon: true })).toBe('recover')
    expect(keyboardAction('KeyR', { mode: 'walk', weapon: true })).toBe('weapon.magazine')
  })
})
