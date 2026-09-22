import { afterEach, expect, it, vi } from 'vitest'
import { revalidateBaked, validBakedExtract } from '../playground/baked-world.js'
import type { WorldExtract } from './real-world.js'
const origin = { latitude: 43.32969, longitude: -1.819606, altitude: 28.253 }
const extract = (): WorldExtract => ({
  name: 'Test',
  origin,
  terrain: { columns: 121, rows: 121, spacing: 10, heights: Array(14641).fill(0) },
  features: [],
  source: { retrievedAt: '2026-09-22', baked: true, bakeVersion: 2, tileKey: '0_0' },
})
afterEach(() => {
  vi.unstubAllGlobals()
})
it('validates version, origin and zone before using a bake', () => {
  const d = extract()
  expect(validBakedExtract(d, origin, '0_0')).toBe(true)
  expect(validBakedExtract(d, origin, '1_0')).toBe(false)
  expect(
    validBakedExtract({ ...d, source: { ...d.source, bakeVersion: 999 } }, origin, '0_0'),
  ).toBe(false)
})
it('checks the server even with a warm cache and keeps elevation on 304', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 304 }))
  vi.stubGlobal('fetch', fetch)
  const cached = extract(),
    heights = vi.fn()
  const result = await revalidateBaked(
    '/cache',
    origin,
    '0_0',
    new AbortController().signal,
    cached,
    '"first"',
    heights,
  )
  expect(result.extract).toBe(cached)
  expect(result.changed).toBe(false)
  expect(heights).not.toHaveBeenCalled()
  expect(fetch.mock.calls[0][1].headers).toEqual({ 'If-None-Match': '"first"' })
})
it('replaces a cached version with a new bake and real elevations', async () => {
  const d = extract()
  d.name = 'Updated'
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json(d, { headers: { etag: '"new"' } })),
  )
  const values = Array(14641).fill(12)
  const result = await revalidateBaked(
    '/cache',
    origin,
    '0_0',
    new AbortController().signal,
    extract(),
    '"old"',
    async () => values,
  )
  expect(result.extract?.name).toBe('Updated')
  expect(result.extract?.terrain.heights).toBe(values)
  expect(result.etag).toBe('"new"')
  expect(result.changed).toBe(true)
})
it('keeps cached terrain offline but propagates cancellation', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Error('offline')))
  const cached = extract(),
    controller = new AbortController()
  expect(
    (
      await revalidateBaked(
        '/cache',
        origin,
        '0_0',
        controller.signal,
        cached,
        undefined,
        async () => [],
      )
    ).extract,
  ).toBe(cached)
  controller.abort()
  await expect(
    revalidateBaked('/cache', origin, '0_0', controller.signal, cached, undefined, async () => []),
  ).rejects.toThrow()
})
