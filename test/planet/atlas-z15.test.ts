import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  adaptAtlasManifest,
  atlasCompatibilityNotes,
  atlasFile,
  atlasFileUrl,
  atlasPhotoFor,
  atlasPackageRef,
  atlasPackageUrl,
  isAtlasFileName,
  validateAtlasZ15Package,
} from '../../src/planet/atlas-z15.js'
import {
  PLANET_GEOMETRY_REVISION,
  planetCellVersion,
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
      path: 'ground-lots-ec58b341916d2b55.webp',
      sizePx: 4096,
      level: 'full',
      bytes: 520676,
    })
    expect(engine.roofPhoto).toMatchObject({
      path: 'roof-0474668251b791ff.webp',
      sizePx: 5120,
      level: 'full',
    })
    const lidar = adaptAtlasManifest(manifest(), p, { relief: 'lidar', photo: 'lo' })
    expect(lidar.files.terrain).toMatchObject({
      path: 'terrain-lidar-50074696349a0012.glb',
      bytes: 11119884,
      sha256: '50074696349a001214e09797edb03108c7484c1e439ae2169c5eb24fdd939965',
    })
    expect(lidar.files['buildings-osm'].path).toBe('buildings-osm-8b7a0e12579eb3ab.glb')
    expect(lidar.photo).toMatchObject({ path: 'ground-lots-lo-ee41398d57296b08.webp', level: 'lo' })
    expect(lidar.roofPhoto).toMatchObject({ path: 'roof-lo-6059293a7ebd97a3.webp', level: 'lo' })
    expect(adaptAtlasManifest(manifest(), p, { photo: 'none' }).photo).toBeUndefined()
    expect(engine.osmSnapshot).toMatchObject({
      path: 'osm-3f3939c12c359aab.json.gz',
      bytes: 43942,
      sha256: '3f3939c12c359aab03c1320740958aa4335f46034585bad36923c635540c0894',
    })
    // Pure: the input manifest is untouched.
    expect(manifest().files.terrain.path).toBe('terrain-ad8550fe0459ce7d.glb')
    expect(adaptAtlasManifest(manifest(), p).roads).toBeUndefined()
  })

  it('maps package road roles onto manifest.roads without enabling driving', () => {
    const packaged = pkg()
    packaged.roads = {
      revision: 'evidence-rev-1',
      recipe: 'asphalt-ground-junction-experiment-10',
      evidenceId: 'fb1a685e-d9fe-4e31-9cc2-129bb9dfe8d2',
    }
    packaged.files.push(
      {
        path: 'asphalt-1111111111111111.glb',
        role: 'roads.asphalt',
        bytes: 597856,
        sha256: '1'.repeat(64),
      },
      {
        path: 'supports-candidate.glb',
        role: 'roads.supports',
        bytes: 23916,
        sha256: '2'.repeat(64),
      },
      {
        path: 'road-collision-candidate.glb',
        role: 'roads.collision',
        bytes: 597864,
        sha256: '3'.repeat(64),
      },
    )
    const adapted = adaptAtlasManifest(manifest(), validateAtlasZ15Package(packaged, tile))
    expect(adapted.roads).toMatchObject({
      drivable: false,
      revision: 'evidence-rev-1',
      recipe: 'asphalt-ground-junction-experiment-10',
      files: {
        asphalt: { path: 'asphalt-1111111111111111.glb', sha256: '1'.repeat(64), drivable: false },
        supports: { path: 'supports-candidate.glb' },
        collision: { path: 'road-collision-candidate.glb' },
      },
    })
    expect(adapted.files.terrain.path).toBe('terrain-ad8550fe0459ce7d.glb')
    expect(adapted.files['buildings-osm'].path).toBe('buildings-osm-8b7a0e12579eb3ab.glb')
  })

  it('maps Atlas #49 package roles and manifest.roadCandidates without a roads block', () => {
    const published = manifest()
    published.roadCandidates = {
      schema: 'nabla-road-candidates/1',
      drivable: false,
      engineLoad: { asphalt: 'immediate', supports: 'immediate', collision: 'opt-in' },
      evidenceSha256: 'e'.repeat(64),
      recipe: 'asphalt-ground-junction-experiment-10',
      layers: {
        asphalt: {
          path: 'asphalt-candidate-1111111111111111.glb',
          download: 'asphalt-candidate-1111111111111111.glb',
          bytes: 597856,
          sha256: '1'.repeat(64),
          role: 'road.asphalt.candidate',
          engineLoad: 'immediate',
          drivable: false,
        },
        supports: {
          path: 'supports-candidate-2222222222222222.glb',
          download: 'supports-candidate-2222222222222222.glb',
          bytes: 23916,
          sha256: '2'.repeat(64),
          role: 'road.supports.candidate',
          engineLoad: 'immediate',
          drivable: false,
        },
      },
    }
    expect(validatePlanetManifest(published, tile).roads?.files.asphalt?.path).toBe(
      'asphalt-candidate-1111111111111111.glb',
    )
    const packaged = pkg()
    packaged.files.push(
      {
        path: 'asphalt-candidate-1111111111111111.glb',
        role: 'road.asphalt.candidate',
        bytes: 597856,
        sha256: '1'.repeat(64),
      },
      {
        path: 'supports-candidate-2222222222222222.glb',
        role: 'road.supports.candidate',
        bytes: 23916,
        sha256: '2'.repeat(64),
      },
      {
        path: 'road-collision-candidate-3333333333333333.glb',
        role: 'road.collision.candidate',
        bytes: 597864,
        sha256: '3'.repeat(64),
      },
    )
    const adapted = adaptAtlasManifest(published, validateAtlasZ15Package(packaged, tile))
    expect(adapted.roads).toMatchObject({
      drivable: false,
      evidenceSha256: 'e'.repeat(64),
      files: {
        asphalt: { path: 'asphalt-candidate-1111111111111111.glb', sha256: '1'.repeat(64) },
        supports: { path: 'supports-candidate-2222222222222222.glb' },
        collision: { path: 'road-collision-candidate-3333333333333333.glb' },
      },
    })
    expect(adapted.files.terrain.path).toBe('terrain-ad8550fe0459ce7d.glb')
  })

  it('falls back per layer when the package and manifest.json disagree on a road file', () => {
    const published = manifest()
    published.roadCandidates = {
      schema: 'nabla-road-candidates/1',
      drivable: false,
      layers: {
        supports: {
          path: 'supports-candidate-2222222222222222.glb',
          bytes: 23916,
          sha256: '2'.repeat(64),
          role: 'road.supports.candidate',
          drivable: false,
        },
      },
    }
    const packaged = pkg()
    packaged.files.push(
      {
        path: 'asphalt-candidate-1111111111111111.glb',
        role: 'road.asphalt.candidate',
        bytes: 597856,
        sha256: '1'.repeat(64),
      },
      {
        path: 'supports-candidate-4444444444444444.glb',
        role: 'road.supports.candidate',
        bytes: 20000,
        sha256: '4'.repeat(64),
      },
    )
    const adapted = adaptAtlasManifest(published, validateAtlasZ15Package(packaged, tile))
    const supports = adapted.roads?.files.supports
    expect(supports?.path).toBe('supports-candidate-2222222222222222.glb')
    expect(supports?.fallback).toMatchObject({
      path: 'supports-candidate-4444444444444444.glb',
      sha256: '4'.repeat(64),
    })
    // A layer only the package lists is kept: the mismatch never drops the cell's roads.
    expect(adapted.roads?.files.asphalt?.path).toBe('asphalt-candidate-1111111111111111.glb')
    expect(adapted.roads?.warnings?.join(' ')).toMatch(/roads\.supports differs/)
    expect(adapted.files.terrain.path).toBe('terrain-ad8550fe0459ce7d.glb')
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
    expect(m?.photo?.path).toBe('ground-lots-ec58b341916d2b55.webp')
    expect(m?.roofPhoto?.path).toBe('roof-0474668251b791ff.webp')
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

describe('atlasPhotoFor', () => {
  const focus = { z: 15, x: 100, y: 200 }
  it('keeps the wanted photo near the player and drops far cells to lo', () => {
    expect(atlasPhotoFor('full', { z: 15, x: 101, y: 199 }, focus)).toBe('full')
    expect(atlasPhotoFor('full', { z: 15, x: 102, y: 200 }, focus)).toBe('lo')
    expect(atlasPhotoFor('full', { z: 15, x: 102, y: 200 }, focus, 2)).toBe('full')
  })
  it('never upgrades lo or none, and waits for a focus', () => {
    expect(atlasPhotoFor('lo', focus, focus)).toBe('lo')
    expect(atlasPhotoFor('none', focus, focus)).toBe('none')
    expect(atlasPhotoFor('full', { z: 15, x: 900, y: 900 }, undefined)).toBe('full')
  })
})

describe('cell versions', () => {
  const v2 = () => {
    const m = manifest()
    m.cellVersion = 2
    const p = pkg()
    p.cellVersion = 2
    return { m, p }
  }

  it('reads a manifest without cellVersion as version 1 and renders it as before', () => {
    const m = validatePlanetManifest(manifest(), tile)
    expect(planetCellVersion(m)).toBe(1)
    const p = validateAtlasZ15Package(pkg(), tile)
    expect(adaptAtlasManifest(manifest(), p).files.terrain.path).toBe(
      'terrain-ad8550fe0459ce7d.glb',
    )
    expect(adaptAtlasManifest(manifest(), p, { relief: 'lidar' }).files.terrain.path).toBe(
      'terrain-lidar-50074696349a0012.glb',
    )
  })

  it('renders a version 2 cell from its unified terrain (terrain.lidar) whatever relief asks', () => {
    for (const relief of [undefined, 'engine', 'lidar'] as const) {
      const { m, p } = v2()
      const adapted = adaptAtlasManifest(m, validateAtlasZ15Package(p, tile), { relief })
      expect(planetCellVersion(adapted)).toBe(2)
      expect(adapted.files.terrain.path).toBe('terrain-lidar-50074696349a0012.glb')
    }
    const { m, p } = v2()
    p.files = p.files.filter((f: { role: string }) => f.role !== 'terrain.lidar')
    delete p.terrain.lidar
    expect(() => adaptAtlasManifest(m, validateAtlasZ15Package(p, tile))).toThrow(
      /version 2\+ has no unified terrain/,
    )
  })

  it('refuses a package whose cell version disagrees with the manifest', () => {
    const { m } = v2()
    expect(() => adaptAtlasManifest(m, validateAtlasZ15Package(pkg(), tile))).toThrow(
      /cell version 1 does not match manifest.json \(2\)/,
    )
  })

  it('refuses cell versions this engine does not know', () => {
    for (const bad of [4, 0, '2', 1.5]) {
      const m = manifest()
      ;(m as unknown as { cellVersion: unknown }).cellVersion = bad
      expect(() => validatePlanetManifest(m, tile)).toThrow(/Unsupported cell version/)
    }
  })
})
