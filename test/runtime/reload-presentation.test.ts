import { expect, it } from 'vitest'
import { reloadPresentation } from '../../src/runtime/reload-presentation.js'

const timings = { magazineOut: 350, magazineIn: 1250, slideRelease: 1600 }

it('raises and tilts the pistol through magazine exchange, then lowers it after seating', () => {
  const start = reloadPresentation('magazine-out', 0, timings)
  expect(start.pitch).toBe(0)
  expect(start.travel).toBe(0)
  expect(start.magazineVisible).toBe(true)

  const leaving = reloadPresentation('magazine-out', 350, timings)
  expect(leaving.pitch).toBeGreaterThan(0.5)
  expect(leaving.travel).toBeGreaterThan(0.95)
  expect(leaving.magazineVisible).toBe(true)
  expect(leaving.lift).toBeGreaterThan(0.08)
  expect(Math.abs(leaving.roll)).toBeGreaterThan(0.4)
  expect(Math.abs(leaving.yaw)).toBeGreaterThan(0.2)

  const gap = reloadPresentation('magazine-in', 350 + 100, timings)
  expect(gap.magazineVisible).toBe(false)
  expect(gap.pitch).toBeGreaterThan(0.5)

  const seating = reloadPresentation('magazine-in', 1250, timings)
  expect(seating.magazineVisible).toBe(true)
  expect(seating.travel).toBeLessThan(0.05)
  expect(seating.pitch).toBe(leaving.pitch)
  expect(seating.lift).toBe(leaving.lift)
  expect(reloadPresentation('slide-release', 1250, timings)).toEqual(seating)

  const done = reloadPresentation('slide-release', 1400, timings)
  expect(done.lift).toBeLessThan(seating.lift)
  expect(done.lift).toBeGreaterThan(0)
  expect(reloadPresentation('slide-release', 1600, timings)).toEqual({
    pitch: 0,
    lift: 0,
    roll: -0,
    yaw: -0,
    travel: 0,
    magazineVisible: true,
  })
})
