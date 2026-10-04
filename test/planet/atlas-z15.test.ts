import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  adaptAtlasManifest,
  atlasCompatibilityNotes,
  atlasFile,
  atlasFileUrl,
  atlasPackageRef,
  atlasPackageUrl,
  isAtlasFileName,
  validateAtlasZ15Package,
} from '../../src/planet/atlas-z15.js'
import {
  PLANET_GEOMETRY_REVISION,
  validatePlanetManifest,
  type PlanetManifest,
} from '../../src/planet/contract.js'
import { fetchTileManifest, StaticTileError } from '../../src/render/planet/static-tiles.js'
import type { MapTile } from '../../src/scene/mercator.js'

// Real metadata of the Atlas cell 15/16211/12003 (files stay on the Atlas disk; only JSON is a fixture).
const dir = new URL('./fixtures/atlas-16211-12003/', import.meta.url)
const manifestBytes = readFileSync(new URL('manifest.json', dir))
const packageBytes = readFileSync(new URL('z15-059a2665959db8a9.json', dir))
const tile: MapTile = { z: 15, x: 16211, y: 12003 }
const manifest = () => JSON.parse(manifestBytes.toString()) as PlanetManifest
const pkg = () => JSON.parse(packageBytes.toString())

describe('Atlas Z15 package adapter', () => {
  it('reads the Atlas manifest with the unchanged engine validator, apart from the LiDAR file name', () => {
    const m = manifest()
    // The Atlas manifest is a nabla-planet-tile-v1 document with extra fields.
    expect(m.format).toBe('nabla-planet-tile-v1')
    expect(m.generator).toBe('native-xyz-v2')
    expect(validatePlanetManifest(m, tile).files.terrain.path).toBe('terrain-ad8550fe0459ce7d.glb')
    // ...but it was produced with an older geometry revision than this engine writes.
    expect(m.geometryRevision).toBe('native-surfaces-v2')
    expect(m.geometryRevision).not.toBe(PLANET_GEOMETRY_REVISION)
  })

  it('validates the package against its cell and exposes roles', () => {
    const p = validateAtlasZ15Package(pkg(), tile)
    expect(atlasFile(p, 'engine.terrain')?.path).toBe('terrain-ad8550fe0459ce7d.glb')
    expect(atlasFile(p, 'terrain.lidar')?.path).toBe('terrain-lidar-50074696349a0012.glb')
    expect(atlasFile(p, 'ground.composite')?.sizePx).toBe(4096)
    expect(() => validateAtlasZ15Package(pkg(), { z: 15, x: 16212, y: 12003 })).toThrow(
      /Invalid Atlas Z15 package/,
    )
    expect(() => validateAtlasZ15Package({ ...pkg(), schema: 'other/1' }, tile)).toThrow()
    const unsafe = pkg()
    unsafe.files[0].path = '../manifest.json'
    expect(() => validateAtlasZ15Package(unsafe, tile)).toThrow(/file entry/)
    const duplicate = pkg()
    duplicate.files.push(duplicate.files[0])
    expect(() => validateAtlasZ15Package(duplicate, tile)).toThrow(/file entry/)
  })

  it('validates the package pointer of the manifest', () => {
    expect(atlasPackageRef(manifest())?.file).toBe('z15-059a2665959db8a9.json')
    const plain = manifest()
    delete plain.z15Package
    expect(atlasPackageRef(plain)).toBeUndefined()
    for (const bad of [
      { file: '../z15.json' },
      { file: 'a/b.json' },
      { sha256: 'xyz' },
      { bytes: 1e12 },
      { schema: 'nabla-z15-package/2' },
    ]) {
      const m = manifest()
      m.z15Package = { ...m.z15Package!, ...bad } as never
      expect(() => atlasPackageRef(m)).toThrow(/package reference/)
    }
  })

  it('maps roles to the loader: engine terrain by default, LiDAR on request, photo level', () => {
    const p = validateAtlasZ15Package(pkg(), tile)
    const engine = adaptAtlasManifest(manifest(), p)
    expect(engine.files.terrain.path).toBe('terrain-ad8550fe0459ce7d.glb')
    expect(engine.photo).toMatchObject({
      path: 'ground-84ad1def609c2916.webp',
      sizePx: 4096,
      level: 'full',
      bytes: 847876,
    })
    const lidar = adaptAtlasManifest(manifest(), p, { relief: 'lidar', photo: 'lo' })
    expect(lidar.files.terrain).toMatchObject({
      path: 'terrain-lidar-50074696349a0012.glb',
      bytes: 11119884,
      sha256: '50074696349a001214e09797edb03108c7484c1e439ae2169c5eb24fdd939965',
    })
    expect(lidar.files['buildings-osm'].path).toBe('buildings-osm-8b7a0e12579eb3ab.glb')
    expect(lidar.photo).toMatchObject({ path: 'ground-lo-93fed02bb5c4abd3.webp', level: 'lo' })
    expect(adaptAtlasManifest(manifest(), p, { photo: 'none' }).photo).toBeUndefined()
    // Pure: the input manifest is untouched.
    expect(manifest().files.terrain.path).toBe('terrain-ad8550fe0459ce7d.glb')
  })

  it('rejects a package that belongs to other GLBs or lacks LiDAR', () => {
    const p = validateAtlasZ15Package(pkg(), tile)
    const other = manifest()
    other.files.terrain.sha256 = 'f'.repeat(64)
    expect(() => adaptAtlasManifest(other, p)).toThrow(/engine terrain does not match/)
    const noLidar = pkg()
    noLidar.files = noLidar.files.filter((f: { role: string }) => f.role !== 'terrain.lidar')
    delete noLidar.terrain.lidar
    expect(() =>
      adaptAtlasManifest(manifest(), validateAtlasZ15Package(noLidar, tile), { relief: 'lidar' }),
    ).toThrow(/no LiDAR terrain/)
  })

  it('documents the differences and builds same-directory URLs', () => {
    const p = validateAtlasZ15Package(pkg(), tile)
    const notes = atlasCompatibilityNotes(manifest(), p, PLANET_GEOMETRY_REVISION)
    expect(notes.join('\n')).toMatch(/native-surfaces-v2 is older than native-surfaces-v5/)
    expect(notes.join('\n')).toMatch(/not consumed by the engine: .*classes.*instances/)
    expect(atlasPackageUrl('/terrain/', tile, manifest().z15Package!)).toBe(
      '/terrain/z/15/16211/12003/z15-059a2665959db8a9.json',
    )
    expect(atlasFileUrl('https://h.example/x', tile, 'ground-1.webp')).toBe(
      'https://h.example/x/z/15/16211/12003/ground-1.webp',
    )
    expect(() => atlasFileUrl('/t', tile, '../x')).toThrow()
    expect(isAtlasFileName('Thumbs.db')).toBe(true)
    expect(isAtlasFileName('.hidden')).toBe(false)
  })
})

describe('fetchTileManifest with Atlas packages', () => {
  afterEach(() => vi.unstubAllGlobals())
  const serve = (overrides: Record<string, () => Response> = {}) => {
    const calls: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url)
      const key = Object.keys(overrides).find((k) => url.endsWith(k))
      if (key) return overrides[key]()
      if (url.endsWith('/manifest.json')) return new Response(manifestBytes)
      if (url.endsWith('/z15-059a2665959db8a9.json')) return new Response(packageBytes)
      return new Response('', { status: 404 })
    })
    return calls
  }
  const options = { baseUrl: '/terrain', pageProtocol: 'http:' }

  it('returns the plain manifest when Atlas mode is off', async () => {
    const calls = serve()
    const m = await fetchTileManifest(tile, options)
    expect(m?.photo).toBeUndefined()
    expect(calls).toEqual(['/terrain/z/15/16211/12003/manifest.json'])
  })

  it('fetches, verifies and applies the package', async () => {
    const calls = serve()
    const m = await fetchTileManifest(tile, { ...options, atlas: { relief: 'lidar' } })
    expect(m?.files.terrain.path).toBe('terrain-lidar-50074696349a0012.glb')
    expect(m?.photo?.path).toBe('ground-84ad1def609c2916.webp')
    expect(calls).toEqual([
      '/terrain/z/15/16211/12003/manifest.json',
      '/terrain/z/15/16211/12003/z15-059a2665959db8a9.json',
    ])
  })

  it('refuses a package whose bytes were altered', async () => {
    serve({
      'z15-059a2665959db8a9.json': () =>
        new Response(packageBytes.toString().replace('"x1"', '"x2"')),
    })
    await expect(fetchTileManifest(tile, { ...options, atlas: {} })).rejects.toThrow(
      /size does not match|SHA-256 does not match/,
    )
  })

  it('reports a missing package with its URL', async () => {
    serve({ 'z15-059a2665959db8a9.json': () => new Response('', { status: 404 }) })
    const error = await fetchTileManifest(tile, { ...options, atlas: {} }).catch((e) => e)
    expect(error).toBeInstanceOf(StaticTileError)
    expect(error.message).toMatch(/z15-059a2665959db8a9\.json.*HTTP 404/)
  })
})
