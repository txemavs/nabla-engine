/**
 * Muzzle rise: each shot lifts the aim and the grip brings only part of it back, so several fast
 * shots climb and the shooter has to recover the rest.
 */
import { expect, it } from 'vitest'
import { weaponPreset } from '../../src/catalog/weapons/library.js'
import { MuzzleRise, riseAfter } from '../../src/simulation/weapons/recoil.js'

const spec = () => weaponPreset('hk-compact').recoil!

it('climbs on the shot and settles above where it started', () => {
  const recoil = spec()
  expect(riseAfter(recoil, 0)).toBe(0)
  const peak = riseAfter(recoil, recoil.climbMs * 2)
  const settled = riseAfter(recoil, 5000)
  expect(peak).toBeGreaterThan((recoil.riseDeg * Math.PI) / 180 / 2)
  expect(settled).toBeGreaterThan(0)
  expect(settled).toBeLessThan(peak)
  // The part the shooter has to bring back down is the rest of the rise.
  expect(settled).toBeLessThan(peak * (1 - recoil.naturalReturn + 0.25))
})

it('adds up over a string of shots and reports the change per step', () => {
  const rise = new MuzzleRise(spec())
  for (let i = 0; i < 5; i++) rise.shot(i * 120)
  const steps = []
  for (let t = 0; t <= 600; t += 16) steps.push(rise.step(t))
  const up = steps.filter((s) => s > 0).reduce((a, b) => a + b, 0)
  const down = steps.filter((s) => s < 0).reduce((a, b) => a + b, 0)
  expect(up).toBeGreaterThan(0.01)
  // It comes back part of the way on its own, never all of it.
  expect(-down).toBeGreaterThan(0)
  expect(-down).toBeLessThan(up)
  expect(rise.total(5000)).toBeGreaterThan(0)
  rise.reset()
  expect(rise.step(9000)).toBe(0)
})
