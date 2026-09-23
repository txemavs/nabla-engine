import { expect, it, describe, vi } from 'vitest'
import { overpassFeatures, fetchChecked } from '../playground/world-provider.js'

describe('overpassFeatures', () => {
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

  it('assembles multipolygon from split ways that share endpoints', () => {
    const result = overpassFeatures([
      {
        type: 'relation',
        id: 100,
        tags: { type: 'multipolygon', natural: 'water', water: 'river' },
        members: [
          {
            type: 'way',
            ref: 1,
            role: 'outer',
            geometry: [
              { lat: 0, lon: 0 },
              { lat: 0, lon: 5 },
              { lat: 5, lon: 5 },
            ],
          },
          {
            type: 'way',
            ref: 2,
            role: 'outer',
            geometry: [
              { lat: 5, lon: 5 },
              { lat: 5, lon: 0 },
              { lat: 0, lon: 0 },
            ],
          },
        ],
      },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('relation/100')
    expect(result[0].rings).toHaveLength(1)
    expect(result[0].rings[0].role).toBe('outer')
    expect(result[0].rings[0].coordinates.length).toBeGreaterThanOrEqual(4)
    const first = result[0].rings[0].coordinates[0]
    const last = result[0].rings[0].coordinates.at(-1)
    expect(first).toEqual(last)
  })

  it('assembles multipolygon with inner ring (hole)', () => {
    const outerClosed = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 10 },
      { lat: 10, lon: 10 },
      { lat: 10, lon: 0 },
      { lat: 0, lon: 0 },
    ]
    const innerClosed = [
      { lat: 2, lon: 2 },
      { lat: 2, lon: 4 },
      { lat: 4, lon: 4 },
      { lat: 4, lon: 2 },
      { lat: 2, lon: 2 },
    ]
    const result = overpassFeatures([
      {
        type: 'relation',
        id: 200,
        tags: { type: 'multipolygon', natural: 'water' },
        members: [
          { type: 'way', ref: 1, role: 'outer', geometry: outerClosed },
          { type: 'way', ref: 2, role: 'inner', geometry: innerClosed },
        ],
      },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].rings.filter((r) => r.role === 'outer')).toHaveLength(1)
    expect(result[0].rings.filter((r) => r.role === 'inner')).toHaveLength(1)
  })

  it('salvages complete rings when some ways cannot be joined', () => {
    const result = overpassFeatures([
      {
        type: 'relation',
        id: 300,
        tags: { type: 'multipolygon', natural: 'water' },
        members: [
          {
            type: 'way',
            ref: 1,
            role: 'outer',
            geometry: [
              { lat: 0, lon: 0 },
              { lat: 0, lon: 5 },
              { lat: 5, lon: 5 },
              { lat: 5, lon: 0 },
              { lat: 0, lon: 0 },
            ],
          },
          {
            type: 'way',
            ref: 2,
            role: 'outer',
            geometry: [
              { lat: 100, lon: 100 },
              { lat: 100, lon: 101 },
            ],
          },
        ],
      },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].rings).toHaveLength(1)
    expect(result[0].rings[0].role).toBe('outer')
  })
})

describe('landcover extraction', () => {
  it('extracts landcover features (landuse, leisure, natural water/wood)', () => {
    const geometry = [
      { lat: 43, lon: -1 },
      { lat: 43, lon: -1.01 },
      { lat: 43.01, lon: -1 },
      { lat: 43, lon: -1 },
    ]
    const result = overpassFeatures([
      { type: 'way', id: 10, tags: { landuse: 'grass' }, geometry },
      { type: 'way', id: 11, tags: { leisure: 'park' }, geometry },
      { type: 'way', id: 12, tags: { natural: 'water' }, geometry },
      { type: 'way', id: 13, tags: { natural: 'wood' }, geometry },
      { type: 'way', id: 14, tags: { water: 'lake' }, geometry },
    ])
    expect(result.map((f) => f.id)).toEqual(['way/10', 'way/11', 'way/12', 'way/13', 'way/14'])
    expect(result[0].tags.landuse).toBe('grass')
    expect(result[2].tags.natural).toBe('water')
  })

  it('extracts waterway centerlines as linear features', () => {
    const geometry = [
      { lat: 43, lon: -1 },
      { lat: 43.01, lon: -1.01 },
      { lat: 43.02, lon: -1 },
    ]
    const result = overpassFeatures([
      { type: 'way', id: 20, tags: { waterway: 'river', name: 'Bidasoa' }, geometry },
      { type: 'way', id: 21, tags: { waterway: 'stream' }, geometry },
    ])
    expect(result.map((f) => f.id)).toEqual(['way/20', 'way/21'])
    expect(result[0].tags.waterway).toBe('river')
  })
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
