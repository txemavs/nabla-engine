import { expect, test } from 'vitest'
import { shadowProjectionKey } from '../../src/render/shadows.js'

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
