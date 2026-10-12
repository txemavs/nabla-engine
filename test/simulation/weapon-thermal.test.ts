import { expect, it } from 'vitest'
import { WeaponThermal } from '../../src/simulation/weapons/weapon-thermal.js'
it('adds heat only for recorded shots and cools toward ambient independently of frame rate', () => {
  const a = new WeaponThermal(),
    b = new WeaponThermal()
  for (const thermal of [a, b]) {
    thermal.shot(0)
    thermal.shot(100)
    expect(thermal.barrelC).toBeGreaterThan(thermal.slideC)
    expect(thermal.slideC).toBeGreaterThan(20)
  }
  const peak = a.barrelC
  a.step(90100)
  for (let time = 1100; time <= 90100; time += 1000) b.step(time)
  expect(a.barrelC).toBeLessThan(peak)
  expect(a.barrelC).toBeGreaterThan(20)
  expect(a.barrelC).toBeCloseTo(b.barrelC, 10)
})
it('initialising and resetting an exercise does not create hidden heat', () => {
  const thermal = new WeaponThermal()
  thermal.ambientC = 10
  thermal.reset()
  thermal.step(10000)
  expect(thermal.barrelC).toBe(10)
  thermal.shot(10000)
  thermal.reset()
  expect(thermal.slideC).toBe(10)
  expect(thermal.barrelC).toBe(10)
})
