import { afterEach, expect, it, vi } from 'vitest'
import { PlanetHorizon } from '../../src/render/planet/horizon.js'
import { horizonGeometry } from '../../src/planet/tiles.js'
import { mapTileSample } from '../../src/scene/mercator.js'

afterEach(() => vi.unstubAllGlobals())
function fixture(photo: Response) {
  const workers: TestWorker[] = []
  class TestWorker {
    onmessage?: (event: { data: unknown }) => void
    constructor() {
      workers.push(this)
    }
    postMessage() {}
    terminate() {}
  }
  vi.stubGlobal('Worker', TestWorker)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(photo))
  const tile = { z: 13, x: 4054, y: 2998 }
  const origin = mapTileSample(tile, 1, 1, 2)
  const horizon = new PlanetHorizon(origin, () => {}, '/photos')
  horizon.update(origin.latitude, origin.longitude, 1)
  workers[0].onmessage!({ data: { tile, data: horizonGeometry(tile, Array(33 * 33).fill(40)) } })
  return { horizon, tile }
}

it('installs collision and visible relief for empty native coverage without requiring a photo', async () => {
  const { horizon, tile } = fixture(new Response('', { status: 404 }))
  try {
    expect(horizon.collisionTiles).toHaveLength(1)
    expect(horizon.collisionTiles[0].chunks.length).toBeGreaterThan(0)
    horizon.setCoverage([tile])
    expect(horizon.collisionTiles).toHaveLength(0)
    horizon.setCoverage([])
    expect(horizon.collisionTiles).toHaveLength(1)
    await Promise.resolve()
  } finally {
    horizon.dispose()
  }
})

it('retains relief when an optional photo returns undecodable data', async () => {
  const decode = vi.fn().mockRejectedValue(new Error('Invalid image'))
  vi.stubGlobal('createImageBitmap', decode)
  const { horizon } = fixture(new Response('not an image'))
  try {
    await vi.waitFor(() => expect(decode).toHaveBeenCalled())
    expect(horizon.collisionTiles).toHaveLength(1)
  } finally {
    horizon.dispose()
  }
})
