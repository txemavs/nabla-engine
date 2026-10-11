import { expect, it } from 'vitest'
import { MuzzleSmoke } from '../../src/render/entity/muzzle-smoke.js'
it('powder smoke begins at the muzzle, drifts and dissipates between shots with a bounded pool', () => {
  const smoke = new MuzzleSmoke()
  expect(smoke.root.visible).toBe(false)
  smoke.burst(1000, [0, 0, -0.135])
  const geometry = smoke.root.geometry
  const first = geometry.getAttribute('position')
  expect(first.getZ(0)).toBeCloseTo(-0.135)
  smoke.update(1200)
  expect(first.getZ(0)).toBeLessThan(-0.135)
  expect(first.getY(0)).toBeGreaterThan(0)
  smoke.update(1800)
  expect(smoke.root.visible).toBe(false)
  for (let i = 0; i < 100; i++) smoke.burst(2000 + i, [0, 0, -0.135])
  expect(first.count).toBe(32)
  smoke.dispose()
})
