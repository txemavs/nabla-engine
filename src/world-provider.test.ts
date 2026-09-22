import { expect, it, vi } from 'vitest'
import { overpassFeatures, fetchChecked } from '../playground/world-provider.js'
it('keeps OSM identities and rejects incomplete building footprints', () => {
  const geometry = [
    { lat: 43, lon: -1 },
    { lat: 43, lon: -1.01 },
    { lat: 43.01, lon: -1 },
    { lat: 43, lon: -1 },
  ]
  const result = overpassFeatures([
    { type: 'way', id: 1, tags: { building: 'yes' }, geometry },
    {
      type: 'relation',
      id: 2,
      tags: { building: 'yes' },
      members: [{ type: 'way', ref: 1, role: 'outer', geometry }],
    },
    { type: 'way', id: 3, tags: { building: 'yes' }, geometry: geometry.slice(0, 3) },
    { type: 'way', id: 4, tags: { highway: 'residential' }, geometry: geometry.slice(0, 2) },
    { type: 'node', id: 5, tags: { natural: 'tree' }, lat: 43, lon: -1 },
  ])
  expect(result.map((f) => f.id)).toEqual(['relation/2', 'way/4', 'node/5'])
  expect(result[0].rings[0].coordinates[0]).toEqual([-1, 43])
})

it('retries a transient provider error once and honours cancellation during backoff', async () => {
  vi.useFakeTimers()
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response('busy', { status: 502 }))
    .mockResolvedValueOnce(new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetcher)
  try {
    const result = fetchChecked('https://example.test/osm', new AbortController().signal, {
      method: 'POST',
    })
    await vi.advanceTimersByTimeAsync(60000)
    expect((await result).status).toBe(200)
    expect(fetcher).toHaveBeenCalledTimes(2)
    fetcher.mockResolvedValue(new Response('busy', { status: 503 }))
    const controller = new AbortController()
    const cancelled = fetchChecked('https://example.test/osm', controller.signal, {
      method: 'POST',
    })
    const rejected = expect(cancelled).rejects.toBeDefined()
    await vi.advanceTimersByTimeAsync(1)
    controller.abort()
    await rejected
    expect(fetcher).toHaveBeenCalledTimes(3)
  } finally {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  }
})
