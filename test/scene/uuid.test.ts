import { afterEach, expect, it, vi } from 'vitest'
import { randomUUID } from '../../src/util/uuid.js'

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
afterEach(() => vi.unstubAllGlobals())

it('uses crypto.randomUUID when it is available', () => {
  vi.stubGlobal('crypto', { randomUUID: () => 'native-id' })
  expect(randomUUID()).toBe('native-id')
})

it('builds a v4 UUID from getRandomValues in insecure contexts', () => {
  vi.stubGlobal('crypto', {
    getRandomValues: (a: Uint8Array) => {
      a.fill(0xff)
      return a
    },
  })
  const id = randomUUID()
  expect(id).toMatch(V4)
  expect(id).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff')
})

it('falls back to Math.random when crypto is missing', () => {
  vi.stubGlobal('crypto', undefined)
  const ids = new Set(Array.from({ length: 50 }, () => randomUUID()))
  expect(ids.size).toBe(50)
  for (const id of ids) expect(id).toMatch(V4)
})

it('produces valid unique ids with the real runtime crypto', () => {
  const a = randomUUID()
  expect(a).toMatch(V4)
  expect(randomUUID()).not.toBe(a)
})
