import { describe, expect, it } from 'vitest'
import { weaponPresets } from '../../src/catalog/weapons/library.js'
import { parseHeldWeaponPreset } from '../../src/catalog/weapons/held-library.js'
import { buildWeaponSlots } from '../../src/catalog/weapons/slots.js'
import { keyboardAction, keyLabel } from '../../src/config/input-bindings.js'

const katana = parseHeldWeaponPreset({
  id: 'katana',
  name: 'Katana',
  kind: 'melee',
  slot: 3,
  model: '/library/weapons/katana/katana.glb',
  view: { position: [0.2, -0.3, -0.4], rotation: [0.9, 0, 0] },
  melee: { reachM: 1.6, impulse: 6, swingMs: 380, arc: [-1.6, 0.5, 0] },
})

describe('weapon slots', () => {
  it('puts the pistol on 1 from its preset data', () => {
    expect(weaponPresets().find((p) => p.id === 'hk-compact')?.slot).toBe(1)
  })
  it('merges firearm and held presets by slot, first wins', () => {
    const spare = parseHeldWeaponPreset({
      id: 'other',
      name: 'Other',
      kind: 'placeholder',
      slot: 3,
      order: 99,
    })
    const slots = buildWeaponSlots(weaponPresets(), [katana, spare])
    expect(slots.map((s) => [s.slot, s.id, s.kind])).toEqual([
      [1, 'hk-compact', 'firearm'],
      [3, 'katana', 'melee'],
    ])
  })
  it('rejects a melee preset without melee data or a model', () => {
    expect(() =>
      parseHeldWeaponPreset({
        id: 'x',
        name: 'X',
        kind: 'melee',
        slot: 3,
        model: '/a.glb',
        view: { position: [0, 0, 0], rotation: [0, 0, 0] },
      }),
    ).toThrow()
    expect(() => parseHeldWeaponPreset({ id: 'x', name: 'X', kind: 'bow', slot: 4 })).toThrow()
  })
  it('binds Digit1-5 on foot only', () => {
    expect(keyboardAction('Digit3', { mode: 'walk' })).toBe('weapon.slot3')
    expect(keyboardAction('Digit3', { mode: 'road' })).toBeUndefined()
    expect(keyLabel('Digit5')).toBe('5')
  })
})

describe('select-fire presets', () => {
  it('keep their own magazine and rate in automatic', async () => {
    const { specForMode } = await import('../../src/simulation/weapons/machine-pistol.js')
    const base = {
      magazineCapacity: 30,
      chamber: 1,
      cycleMs: 75,
      reloadMs: { magazineOut: 1, magazineIn: 2, slideRelease: 3 },
    }
    expect(specForMode(base, 'burst30', 800)).toMatchObject({ magazineCapacity: 30, cycleMs: 75 })
    expect(specForMode({ ...base, magazineCapacity: 13, cycleMs: 100 }, 'burst30')).toMatchObject({
      magazineCapacity: 30,
      cycleMs: 100 * 0 + 60000 / 900,
    })
  })
})
