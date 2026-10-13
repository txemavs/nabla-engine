import { expect, it } from 'vitest'
import {
  normalizeWeaponWheel,
  stepWeaponWheel,
  weaponWheelOffset,
  weaponWheelTunnel,
} from '../../src/runtime/weapon-wheel.js'
it('traverses exactly twelve hand positions and clamps at both ends', () => {
  let value = normalizeWeaponWheel()
  const positions = [value.hand]
  for (let i = 0; i < 11; i++) {
    value = stepWeaponWheel(value, false, 100)
    positions.push(value.hand)
  }
  expect(new Set(positions).size).toBe(12)
  expect(stepWeaponWheel(value, false, 100).hand).toBe(11)
  expect(stepWeaponWheel(normalizeWeaponWheel(), false, -100).hand).toBe(0)
})
it('keeps distance and hand independent, including zero wheel events', () => {
  const value = { hand: 7, distance: 0.5 }
  expect(stepWeaponWheel(value, true, 100)).toEqual({ hand: 7, distance: 0.55 })
  expect(stepWeaponWheel(value, false, -100)).toEqual({ hand: 6, distance: 0.5 })
  expect(stepWeaponWheel(value, true, 0)).toEqual(value)
  expect(value).toEqual({ hand: 7, distance: 0.5 })
})
it('returns to the sight line when aiming and reduces tunnel with arm extension', () => {
  expect(weaponWheelOffset({ hand: 11, distance: 1 }, 1)).toEqual({ x: -0, z: -0.3 })
  expect(weaponWheelOffset({ hand: 11, distance: 1 }, 0)).toEqual({ x: -0.2, z: -0 })
  expect(weaponWheelTunnel(0)).toBeGreaterThan(weaponWheelTunnel(1))
  expect(normalizeWeaponWheel({ hand: NaN, distance: Infinity })).toEqual({ hand: 0, distance: 0 })
})

it('hands distance control to the slide animation and restores it without changing preferences', () => {
  const settings = { hand: 7, distance: 1 }
  expect(weaponWheelOffset(settings, 1, 1).z).toBe(-0)
  expect(weaponWheelOffset(settings, 1, 0.5).z).toBeCloseTo(-0.15)
  expect(weaponWheelOffset(settings, 1, 0).z).toBeCloseTo(-0.3)
  expect(weaponWheelOffset(settings, 0, 1).x).toBe(weaponWheelOffset(settings, 0, 0).x)
  expect(settings).toEqual({ hand: 7, distance: 1 })
})
