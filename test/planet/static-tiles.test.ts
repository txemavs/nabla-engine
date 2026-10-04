import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  DEFAULT_TILES_BASE_URL,
  StaticTileError,
  TileLoadTracker,
  assertSecureTileBase,
  fetchTileManifest,
  fetchTileManifestsRobust,
  isManifestCurrent,
  logTileLoadSummary,
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

  describe('tileManifestUrl and defaults', () => {
    it('builds the Euskadi manifest URL from the default base', () => {
      expect(DEFAULT_TILES_BASE_URL).toBe('https://atlas.chained.world/euskadi')
      expect(tileManifestUrl(tile, DEFAULT_TILES_BASE_URL)).toBe(
        'https://atlas.chained.world/euskadi/z/15/16224/11998/manifest.json',
      )
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
    const opts = { baseUrl: DEFAULT_TILES_BASE_URL, pageProtocol: 'https:' }
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
      expect(url).toBe('https://atlas.chained.world/euskadi/z/15/16224/11998/manifest.json')
      expect(url).not.toContain('/z/z/')
      expect(init).toMatchObject({ method: 'GET', mode: 'cors' })
    })

    it('returns undefined for 404 (not published)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })))
      expect(await fetchTileManifest(tile, opts)).toBeUndefined()
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

    it('returns undefined for SPA fallback (HTML 200) instead of throwing', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            new Response('<html/>', { status: 200, headers: { 'content-type': 'text/html' } }),
          ),
      )
      const manifest = await fetchTileManifest(tile, opts)
      expect(manifest).toBeUndefined()
    })

    it('returns undefined for HTML response with charset', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response('<!DOCTYPE html>', {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          }),
        ),
      )
      expect(await fetchTileManifest(tile, opts)).toBeUndefined()
    })

    it('reports non-HTML invalid JSON as an error', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            new Response('not json', { status: 200, headers: { 'content-type': 'text/plain' } }),
          ),
      )
      const error = await failure(fetchTileManifest(tile, opts))
      expect(error.kind).toBe('invalid')
      expect(error.message).toContain('not valid JSON')
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

  describe('TileLoadTracker', () => {
    it('allows initial requests for unknown tiles', () => {
      const tracker = new TileLoadTracker()
      expect(tracker.shouldRequest('tile-1')).toBe(true)
      expect(tracker.getState('tile-1')).toBeUndefined()
    })

    it('blocks requests for absent tiles', () => {
      const tracker = new TileLoadTracker()
      tracker.markAbsent('tile-1')
      expect(tracker.shouldRequest('tile-1')).toBe(false)
      expect(tracker.getState('tile-1')).toBe('absent')
      expect(tracker.getAbsent()).toContain('tile-1')
    })

    it('blocks requests for failed tiles', () => {
      const tracker = new TileLoadTracker()
      tracker.markFailed('tile-1', 'network error')
      expect(tracker.shouldRequest('tile-1')).toBe(false)
      expect(tracker.getState('tile-1')).toBe('failed')
      expect(tracker.getFailed().get('tile-1')).toBe('network error')
    })

    it('allows retries up to maxRetries', () => {
      const tracker = new TileLoadTracker(3, 10)
      expect(tracker.recordRetry('tile-1')).toBe(true)
      expect(tracker.recordRetry('tile-1')).toBe(true)
      expect(tracker.recordRetry('tile-1')).toBe(false)
      expect(tracker.getState('tile-1')).toBe('pending')
    })

    it('respects backoff delay before allowing retry', async () => {
      const tracker = new TileLoadTracker(3, 50)
      tracker.recordRetry('tile-1')
      expect(tracker.shouldRequest('tile-1')).toBe(false)
      await new Promise((r) => setTimeout(r, 120))
      expect(tracker.shouldRequest('tile-1')).toBe(true)
    })

    it('clears tracking for specific tile', () => {
      const tracker = new TileLoadTracker()
      tracker.markAbsent('tile-1')
      tracker.markFailed('tile-2', 'error')
      tracker.clear('tile-1')
      expect(tracker.shouldRequest('tile-1')).toBe(true)
      expect(tracker.shouldRequest('tile-2')).toBe(false)
    })

    it('clears all tracking', () => {
      const tracker = new TileLoadTracker()
      tracker.markAbsent('tile-1')
      tracker.markFailed('tile-2', 'error')
      tracker.clear()
      expect(tracker.shouldRequest('tile-1')).toBe(true)
      expect(tracker.shouldRequest('tile-2')).toBe(true)
    })
  })

  describe('fetchTileManifestsRobust', () => {
    const opts = { baseUrl: DEFAULT_TILES_BASE_URL, pageProtocol: 'https:' }

    const createTile = (x: number): MapTile => ({ z: 15, x, y: 11998 })
    const createManifestFor = (t: MapTile): PlanetManifest => {
      const bounds = mapTileBounds(t)
      const anchor = mapTileSample(t, 1, 1, 2)
      return {
        format: 'nabla-planet-tile-v1',
        generator: 'native-xyz-v2',
        geometryRevision: PLANET_GEOMETRY_REVISION,
        id: mapTileId(t),
        tile: t,
        anchor,
        bounds,
        files: {
          terrain: {
            path: `terra-15-${t.x}-${t.y}-202609151200.glb`,
            download: `earth-WebMercatorQuad-z15-x${t.x}-y${t.y}-terrain.glb`,
            bytes: 2456789,
            sha256: 'a'.repeat(64),
          },
          'buildings-osm': {
            path: `build-15-${t.x}-${t.y}-202609151200.glb`,
            download: `earth-WebMercatorQuad-z15-x${t.x}-y${t.y}-buildings-osm.glb`,
            bytes: 1234567,
            sha256: 'b'.repeat(64),
          },
        },
      }
    }

    it('fetches multiple tiles independently', async () => {
      const tile1 = createTile(16224)
      const tile2 = createTile(16225)
      const manifest1 = createManifestFor(tile1)
      const manifest2 = createManifestFor(tile2)

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (url.includes('/16224/')) {
            return Promise.resolve(
              new Response(JSON.stringify(manifest1), {
                status: 200,
                headers: { 'content-type': 'application/json' },
              }),
            )
          }
          if (url.includes('/16225/')) {
            return Promise.resolve(
              new Response(JSON.stringify(manifest2), {
                status: 200,
                headers: { 'content-type': 'application/json' },
              }),
            )
          }
          return Promise.resolve(new Response('', { status: 404 }))
        }),
      )

      const tracker = new TileLoadTracker()
      const result = await fetchTileManifestsRobust([tile1, tile2], opts, tracker)

      expect(result.manifests.size).toBe(2)
      expect(result.manifests.get(mapTileId(tile1))).toEqual(manifest1)
      expect(result.manifests.get(mapTileId(tile2))).toEqual(manifest2)
      expect(result.absent).toHaveLength(0)
      expect(result.failed.size).toBe(0)
    })

    it('marks 404 tiles as absent without blocking others', async () => {
      const tile1 = createTile(16224)
      const tile2 = createTile(16225)
      const manifest1 = createManifestFor(tile1)

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (url.includes('/16224/')) {
            return Promise.resolve(
              new Response(JSON.stringify(manifest1), {
                status: 200,
                headers: { 'content-type': 'application/json' },
              }),
            )
          }
          return Promise.resolve(new Response('', { status: 404 }))
        }),
      )

      const tracker = new TileLoadTracker()
      const result = await fetchTileManifestsRobust([tile1, tile2], opts, tracker)

      expect(result.manifests.size).toBe(1)
      expect(result.manifests.has(mapTileId(tile1))).toBe(true)
      expect(result.absent).toContain(mapTileId(tile2))
      expect(tracker.shouldRequest(mapTileId(tile2))).toBe(false)
    })

    it('treats SPA fallback (HTML 200) as absent', async () => {
      const tile1 = createTile(16224)
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response('<!DOCTYPE html><html></html>', {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          }),
        ),
      )

      const tracker = new TileLoadTracker()
      const result = await fetchTileManifestsRobust([tile1], opts, tracker)

      expect(result.manifests.size).toBe(0)
      expect(result.absent).toContain(mapTileId(tile1))
    })

    it('treats 403 as absent (S3 missing key without CORS)', async () => {
      const tile1 = createTile(16224)
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('<Error>AccessDenied</Error>', { status: 403 })),
      )

      const tracker = new TileLoadTracker()
      const result = await fetchTileManifestsRobust([tile1], opts, tracker)

      expect(result.manifests.size).toBe(0)
      expect(result.absent).toContain(mapTileId(tile1))
    })

    it('treats CORS/network error as absent (S3 403 without CORS headers)', async () => {
      const tile1 = createTile(16224)
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

      const tracker = new TileLoadTracker()
      const result = await fetchTileManifestsRobust([tile1], opts, tracker)

      expect(result.manifests.size).toBe(0)
      expect(result.absent).toContain(mapTileId(tile1))
    })

    it('retries timeout errors with backoff then fails', async () => {
      const tile1 = createTile(16224)
      const timeout = new DOMException('The operation timed out.', 'TimeoutError')
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout))

      const tracker = new TileLoadTracker(2, 10)

      const result1 = await fetchTileManifestsRobust([tile1], opts, tracker)
      expect(result1.manifests.size).toBe(0)
      expect(result1.newlyFailed).toHaveLength(0)
      expect(tracker.getState(mapTileId(tile1))).toBe('pending')

      await new Promise((r) => setTimeout(r, 30))
      const result2 = await fetchTileManifestsRobust([tile1], opts, tracker)
      expect(result2.newlyFailed).toContain(mapTileId(tile1))
      expect(tracker.getState(mapTileId(tile1))).toBe('failed')
    })

    it('does not re-request absent tiles', async () => {
      const tile1 = createTile(16224)
      const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 404 }))
      vi.stubGlobal('fetch', fetchMock)

      const tracker = new TileLoadTracker()
      await fetchTileManifestsRobust([tile1], opts, tracker)
      expect(fetchMock).toHaveBeenCalledTimes(1)

      await fetchTileManifestsRobust([tile1], opts, tracker)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('does not re-request failed tiles', async () => {
      const tile1 = createTile(16224)
      const fetchMock = vi
        .fn()
        .mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError'))
      vi.stubGlobal('fetch', fetchMock)

      const tracker = new TileLoadTracker(1, 0)
      await fetchTileManifestsRobust([tile1], opts, tracker)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(tracker.getState(mapTileId(tile1))).toBe('failed')

      await fetchTileManifestsRobust([tile1], opts, tracker)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('handles mixed success, absent, and failure in one batch', async () => {
      const tileSuccess = createTile(16224)
      const tileAbsent = createTile(16225)
      const tileFail = createTile(16226)
      const manifestSuccess = createManifestFor(tileSuccess)

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (url.includes('/16224/')) {
            return Promise.resolve(
              new Response(JSON.stringify(manifestSuccess), {
                status: 200,
                headers: { 'content-type': 'application/json' },
              }),
            )
          }
          if (url.includes('/16225/')) {
            return Promise.resolve(new Response('', { status: 404 }))
          }
          if (url.includes('/16226/')) {
            return Promise.reject(new DOMException('The operation timed out.', 'TimeoutError'))
          }
          return Promise.resolve(new Response('', { status: 404 }))
        }),
      )

      const tracker = new TileLoadTracker(1, 0)
      const result = await fetchTileManifestsRobust(
        [tileSuccess, tileAbsent, tileFail],
        opts,
        tracker,
      )

      expect(result.manifests.size).toBe(1)
      expect(result.manifests.has(mapTileId(tileSuccess))).toBe(true)
      expect(result.absent).toContain(mapTileId(tileAbsent))
      expect(result.failed.has(mapTileId(tileFail))).toBe(true)
      expect(result.newlyFailed).toContain(mapTileId(tileFail))
    })
  })

  describe('logTileLoadSummary', () => {
    it('logs nothing when all tiles loaded successfully', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      logTileLoadSummary(5, [], new Map())
      expect(logSpy).not.toHaveBeenCalled()
      logSpy.mockRestore()
    })

    it('logs summary with absent tiles', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      logTileLoadSummary(3, ['tile-1', 'tile-2'], new Map())
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('3 loaded'))
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('2 absent'))
      logSpy.mockRestore()
    })

    it('logs summary with failed tiles', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      logTileLoadSummary(3, [], new Map([['tile-1', 'timeout']]))
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('1 failed'))
      logSpy.mockRestore()
    })
  })
})
