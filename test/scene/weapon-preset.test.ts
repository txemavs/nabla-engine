import { expect, it } from 'vitest'
import { weaponPreset, weaponPresets } from '../../src/catalog/weapons/library.js'

it('loads the compact 9mm as data', () => {
  expect(weaponPresets().map((preset) => preset.id)).toContain('hk-compact')
  const pistol = weaponPreset('hk-compact')
  expect(pistol.name).toBe('HK USP Compact 9mm')
  expect(pistol.model).toBe('/library/weapons/hk-compact/hk-compact.glb')
  expect(pistol.firearm!.magazineCapacity).toBe(13)
  expect(pistol.ammunition!.muzzleVelocityMs).toBeCloseTo(350.5, 1)
  expect(pistol.unverified!.every((line) => line.startsWith('TODO(unverified)'))).toBe(true)
})
