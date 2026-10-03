import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isManifestCurrent,
  tileGlbUrl,
  verifyGlbHash,
} from '../../src/render/planet/static-tiles.js'
import {
  PLANET_GEOMETRY_REVISION,
  type PlanetManifest,
  validatePlanetManifest,
} from '../../src/planet/contract.js'
import {
  mapTileId,
  mapTilePath,
  mapTileSample,
  mapTileBounds,
  type MapTile,
} from '../../src/scene/mercator.js'

describe('static-tiles', () => {
  const tile: MapTile = { z: 15, x: 16224, y: 11998 }

  const createMockManifest = (): PlanetManifest => {
    const bounds = mapTileBounds(tile)
    const anchor = mapTileSample(tile, 1, 1, 2)
    return {
      format: 'nabla-planet-tile-v1',
      generator: 'native-xyz-v2',
      geometryRevision: PLANET_GEOMETRY_REVISION,
      id: mapTileId(tile),
      tile,
      anchor,
      bounds,
      files: {
        terrain: {
          path: 'terra-15-16224-11998-202609151200.glb',
          download: 'earth-WebMercatorQuad-z15-x16224-y11998-terrain.glb',
          bytes: 2456789,
          sha256: 'a'.repeat(64),
        },
        'buildings-osm': {
          path: 'build-15-16224-11998-202609151200.glb',
          download: 'earth-WebMercatorQuad-z15-x16224-y11998-buildings-osm.glb',
          bytes: 1234567,
          sha256: 'b'.repeat(64),
        },
      },
    }
  }

  const mockManifest = createMockManifest()

  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('tile URL building', () => {
    it('builds correct manifest URL', () => {
      const baseUrl = 'https://example.com'
      const path = mapTilePath(tile)
      const url = `${baseUrl}/${path}/manifest.json`
      expect(url).toBe('https://example.com/z/15/16224/11998/manifest.json')
    })

    it('handles trailing slash in baseUrl', () => {
      const baseUrl = 'https://example.com/'
      const path = mapTilePath(tile)
      const url = `${baseUrl.replace(/\/$/, '')}/${path}/manifest.json`
      expect(url).toBe('https://example.com/z/15/16224/11998/manifest.json')
    })
  })

  describe('manifest validation', () => {
    it('validates a correct manifest', () => {
      const validated = validatePlanetManifest(mockManifest, tile)
      expect(validated).toEqual(mockManifest)
    })

    it('rejects manifest with wrong tile id', () => {
      const wrongTile = { ...mockManifest, id: 'WebMercatorQuad/15/16225/11998' }
      expect(() => validatePlanetManifest(wrongTile, tile)).toThrow()
    })

    it('rejects manifest with invalid format', () => {
      const wrongFormat = { ...mockManifest, format: 'wrong-format' }
      expect(() => validatePlanetManifest(wrongFormat, tile)).toThrow()
    })
  })

  describe('isManifestCurrent', () => {
    it('returns true for current geometry revision', () => {
      expect(isManifestCurrent(mockManifest)).toBe(true)
    })

    it('returns false for outdated geometry revision', () => {
      const oldManifest = { ...mockManifest, geometryRevision: 'old-revision' }
      expect(isManifestCurrent(oldManifest as PlanetManifest)).toBe(false)
    })

    it('returns false for missing geometry revision', () => {
      const noRevision = { ...mockManifest }
      delete (noRevision as any).geometryRevision
      expect(isManifestCurrent(noRevision as PlanetManifest)).toBe(false)
    })
  })

  describe('tileGlbUrl', () => {
    it('builds correct URL for terrain layer', () => {
      const url = tileGlbUrl('https://example.com', tile, 'terrain', mockManifest)
      expect(url).toBe('https://example.com/z/15/16224/11998/terra-15-16224-11998-202609151200.glb')
    })

    it('builds correct URL for buildings layer', () => {
      const url = tileGlbUrl('https://example.com', tile, 'buildings-osm', mockManifest)
      expect(url).toBe('https://example.com/z/15/16224/11998/build-15-16224-11998-202609151200.glb')
    })

    it('handles trailing slash in baseUrl', () => {
      const url = tileGlbUrl('https://example.com/', tile, 'terrain', mockManifest)
      expect(url).toBe('https://example.com/z/15/16224/11998/terra-15-16224-11998-202609151200.glb')
    })
  })

  describe('verifyGlbHash', () => {
    it('verifies correct hash', async () => {
      const data = new TextEncoder().encode('test data')
      const hash = await crypto.subtle.digest('SHA-256', data)
      const hashHex = Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

      const result = await verifyGlbHash(data.buffer, hashHex)
      expect(result).toBe(true)
    })

    it('rejects incorrect hash', async () => {
      const data = new TextEncoder().encode('test data')
      const wrongHash = 'a'.repeat(64)

      const result = await verifyGlbHash(data.buffer, wrongHash)
      expect(result).toBe(false)
    })
  })
})
