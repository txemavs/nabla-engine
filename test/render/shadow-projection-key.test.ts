import { expect, test } from 'vitest'
import { cascadeCutsForView, shadowProjectionKey } from '../../src/render/shadows.js'

test('a view blend does not change the shadow projection key every fraction of a degree', () => {
  const camera = { fov: 70, aspect: 16 / 9, near: 0.1, far: 12000, zoom: 1 }
  const a = shadowProjectionKey(camera, 4000)
  const b = shadowProjectionKey({ ...camera, fov: 70.4 }, 4000)
  expect(a).toBe(b)
  expect(shadowProjectionKey({ ...camera, fov: 48 }, 4000)).not.toBe(a)
  // Far beyond the tier is the same key; a one-metre step inside the tier is not a new key.
  expect(shadowProjectionKey({ ...camera, far: 80000 }, 4000)).toBe(
    shadowProjectionKey({ ...camera, far: 4000.2 }, 4000),
  )
  expect(shadowProjectionKey({ ...camera, far: 3900 }, 4000)).not.toBe(a)
})

test('a steep overhead view keeps the vehicle in the first cascade', () => {
  expect(cascadeCutsForView(3, 45, -0.9)).toEqual([140, 500])
  expect(cascadeCutsForView(3, 400, -0.2)).toEqual([140, 500])
  const cuts = cascadeCutsForView(3, 400, -0.9)
  // The truck is ~400 m from a nadir camera; cascade 0 must extend past it.
  expect(cuts[0]).toBeGreaterThan(400)
  expect(cuts[1]).toBeGreaterThan(cuts[0])
  expect(cascadeCutsForView(4, 500, -1)[0]).toBeGreaterThan(500)
})
