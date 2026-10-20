import { expect, it } from 'vitest'
import { MuzzleSmoke } from '../../src/render/entity/muzzle-smoke.js'
it('powder smoke begins at the muzzle, drifts and dissipates between shots with a bounded pool', () => {
  const smoke = new MuzzleSmoke()
  expect(smoke.root.visible).toBe(false)
  smoke.burst(1000, [0, 0, -0.135])
  expect(smoke.particles(1000).positions[2]).toBeCloseTo(-0.135)
  smoke.update(1200)
  const drifted = smoke.particles(1200).positions
  expect(drifted[2]).toBeLessThan(-0.135)
  expect(drifted[1]).toBeGreaterThan(0)
  smoke.update(1800)
  expect(smoke.root.visible).toBe(false)
  for (let i = 0; i < 100; i++) smoke.burst(2000 + i, [0, 0, -0.135])
  expect(smoke.root.geometry.getAttribute('position').count).toBe(32)
  smoke.dispose()
})
