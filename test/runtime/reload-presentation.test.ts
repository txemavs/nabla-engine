import { expect, it } from 'vitest'
import { reloadPresentation } from '../../src/runtime/reload-presentation.js'

const timings = { magazineOut: 350, magazineIn: 1250, slideRelease: 1600 }

it('raises the pistol as the magazine leaves, then seats a fresh one as it comes back down', () => {
  const start = reloadPresentation('magazine-out', 0, timings)
  expect(start.pitch).toBe(0)
  expect(start.travel).toBe(0)
  expect(start.magazineVisible).toBe(true)

  const leaving = reloadPresentation('magazine-out', 350, timings)
  expect(leaving.pitch).toBeGreaterThan(0.5)
  expect(leaving.travel).toBeGreaterThan(0.95)
  expect(leaving.magazineVisible).toBe(true)

  const gap = reloadPresentation('magazine-in', 350 + 100, timings)
  expect(gap.magazineVisible).toBe(false)
  expect(gap.pitch).toBeGreaterThan(0.5)

  const seating = reloadPresentation('magazine-in', 1250, timings)
  expect(seating.magazineVisible).toBe(true)
  expect(seating.travel).toBeLessThan(0.05)
  expect(seating.pitch).toBeLessThan(0.05)

  const done = reloadPresentation('slide-release', 1400, timings)
  expect(done).toEqual({ pitch: 0, travel: 0, magazineVisible: true })
})
