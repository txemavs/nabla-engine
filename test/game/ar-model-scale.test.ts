import { expect, it } from 'vitest'
import { ARRC } from '../../src/runtime/ar/vehicles.js'
const allowed = (kind: string, scale: number) =>
  ARRC.prototype.scaleAllowed.call({} as ARRC, kind, scale)
it('accepts the requested airplane, forklift and car scales', () => {
  for (const scale of [200, 500]) expect(allowed('f14', scale)).toBe(true)
  for (const kind of ['forklift', 's3'])
    for (const scale of [2, 4]) expect(allowed(kind, scale)).toBe(true)
})
it('rejects models below 2 cm or above 5 m including the trailer', () => {
  expect(allowed('s3', 500)).toBe(false)
  expect(allowed('f14', 1)).toBe(false)
  expect(allowed('truck', 2)).toBe(false)
  expect(allowed('truck', 100)).toBe(true)
  for (const scale of [NaN, Infinity, 0, -1]) expect(allowed('s3', scale)).toBe(false)
})
