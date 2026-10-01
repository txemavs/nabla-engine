import { expect, it } from 'vitest'
import { weaponPreset, weaponPresets } from '../../src/catalog/weapons/library.js'

it('loads the compact 9mm as data', () => {
  expect(weaponPresets().map((preset) => preset.id)).toContain('hk-compact')
  const pistol = weaponPreset('hk-compact')
  expect(pistol.name).toBe('HK Compact 9mm')
  expect(pistol.intervalMs).toBe(220)
  expect(pistol.range).toBe(150)
  expect(pistol.impulse).toBe(12)
  expect(pistol.body).toBe('/studio/weapons/hk-compact/hk-compact.body.glb')
  expect(pistol.slide).toBe('/studio/weapons/hk-compact/hk-compact.slide.glb')
})
