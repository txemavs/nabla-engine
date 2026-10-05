import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  StaticTileError,
  assertSecureTileBase,
  fetchTileManifest,
  isManifestCurrent,
  normalizeTilesBase,
  tileGlbUrl,
  tileManifestUrl,
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

const TEST_TILES_BASE = 'https://tiles.example.org/world'

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
    vi.unstubAllGlobals()
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

  describe('tileManifestUrl', () => {
    it('builds a manifest URL from an application-owned base', () => {
      expect(tileManifestUrl(tile, TEST_TILES_BASE)).toBe(
        'https://tiles.example.org/world/z/15/16224/11998/manifest.json',
      )
    })

    it('rejects an omitted source without making a request', async () => {
      const request = vi.fn()
      vi.stubGlobal('fetch', request)
      await expect(fetchTileManifest(tile, {} as any)).rejects.toThrow(/Terrain source missing/)
      expect(request).not.toHaveBeenCalled()
    })

    it('normalizes trailing slashes and whitespace', () => {
      expect(normalizeTilesBase(' https://a.example/b// ')).toBe('https://a.example/b')
      expect(tileManifestUrl(tile, '/')).toBe('/z/15/16224/11998/manifest.json')
    })
  })

  describe('assertSecureTileBase', () => {
    it('rejects an http: tile host from an https: page with an explicit message', () => {
      expect(() => assertSecureTileBase('http://tiles.example.org/x', 'https:')).toThrow(/HTTPS/)
    })

    it('allows https hosts, localhost over http, relative bases and http pages', () => {
      expect(() => assertSecureTileBase('https://tiles.example.org', 'https:')).not.toThrow()
      expect(() => assertSecureTileBase('http://localhost:5174', 'https:')).not.toThrow()
      expect(() => assertSecureTileBase('http://127.0.0.1:8080', 'https:')).not.toThrow()
      expect(() => assertSecureTileBase('/z/15/1/2/manifest.json', 'https:')).not.toThrow()
      expect(() => assertSecureTileBase('http://tiles.example.org', 'http:')).not.toThrow()
    })
  })

  describe('fetchTileManifest', () => {
    const opts = { baseUrl: TEST_TILES_BASE, pageProtocol: 'https:' }
    const json = (body: unknown, init: ResponseInit = {}) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
        ...init,
      })
    const failure = async (promise: Promise<unknown>): Promise<StaticTileError> => {
      try {
        await promise
      } catch (error) {
        expect(error).toBeInstanceOf(StaticTileError)
        return error as StaticTileError
      }
      throw new Error('expected a StaticTileError')
    }

    it('requests the Euskadi manifest URL with GET and CORS', async () => {
      const fetchMock = vi.fn().mockResolvedValue(json(mockManifest))
      vi.stubGlobal('fetch', fetchMock)

      const manifest = await fetchTileManifest(tile, opts)

      expect(manifest).toEqual(mockManifest)
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('https://tiles.example.org/world/z/15/16224/11998/manifest.json')
      expect(url).not.toContain('/z/z/')
      expect(init).toMatchObject({ method: 'GET', mode: 'cors' })
    })

    it('returns undefined for 404 (not published)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })))
      expect(await fetchTileManifest(tile, opts)).toBeUndefined()
    })

    it('treats the listed statuses as holes and reports them, 403 included on S3-style hosts', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<Error/>', { status: 403 })))
      const seen: number[] = []
      const manifest = await fetchTileManifest(tile, {
        ...opts,
        missingStatuses: [403, 404],
        onMissing: (status) => seen.push(status),
      })
      expect(manifest).toBeUndefined()
      expect(seen).toEqual([403])
      // A 500 is still an error, never a hole.
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })))
      const error = await failure(
        fetchTileManifest(tile, {
          ...opts,
          missingStatuses: [403, 404],
          onMissing: () => seen.push(0),
        }),
      )
      expect(error.kind).toBe('http')
      expect(seen).toEqual([403])
    })

    it('reports HTTP 403 with the URL and the S3/CloudFront hint', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<Error/>', { status: 403 })))
      const error = await failure(fetchTileManifest(tile, opts))
      expect(error.kind).toBe('http')
      expect(error.status).toBe(403)
      expect(error.message).toContain('HTTP 403')
      expect(error.message).toContain('not uploaded yet')
      expect(error.message).toContain('/z/15/16224/11998/manifest.json')
    })

    it('reports HTTP 500 as a host error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })))
      const error = await failure(fetchTileManifest(tile, opts))
      expect(error.status).toBe(500)
      expect(error.message).toContain('tile host error')
    })

    it('reports network/CORS failures instead of hiding them', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
      const error = await failure(fetchTileManifest(tile, opts))
      expect(error.kind).toBe('network')
      expect(error.message).toContain('network or CORS error')
      expect(error.message).toContain('Failed to fetch')
    })

    it('reports a timeout', async () => {
      const timeout = new DOMException('The operation timed out.', 'TimeoutError')
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout))
      const error = await failure(fetchTileManifest(tile, opts))
      expect(error.kind).toBe('timeout')
    })

    it('rethrows the caller abort as is', async () => {
      const controller = new AbortController()
      controller.abort()
      const abort = new DOMException('aborted', 'AbortError')
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort))
      await expect(fetchTileManifest(tile, { ...opts, signal: controller.signal })).rejects.toBe(
        abort,
      )
    })

    it('reports a body that is not JSON', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            new Response('<html/>', { status: 200, headers: { 'content-type': 'text/html' } }),
          ),
      )
      const error = await failure(fetchTileManifest(tile, opts))
      expect(error.kind).toBe('invalid')
      expect(error.message).toContain('not valid JSON (text/html)')
    })

    it('reports an invalid manifest with the validation cause', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ ...mockManifest, format: 'x' })))
      const error = await failure(fetchTileManifest(tile, opts))
      expect(error.kind).toBe('invalid')
      expect(error.message).toContain('invalid manifest')
    })

    it('refuses an http: base from an https: page before any request', async () => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      const error = await failure(
        fetchTileManifest(tile, { baseUrl: 'http://tiles.example.org', pageProtocol: 'https:' }),
      )
      expect(error.kind).toBe('insecure')
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})
