import { describe, expect, it } from 'vitest'
import {
  isCandidateRoadGlbPath,
  planetCollisionChunks,
  planetGlbCacheKey,
  planetRoadRevision,
  planetTileGlbLayers,
  planetTileRevision,
  tagCandidateRoadMesh,
  validatePlanetManifest,
  type PlanetManifest,
  type PlanetMesh,
} from '../../src/planet/index.js'
import {
  PLANET_GEOMETRY_REVISION,
  type PlanetCandidateRoadFile,
} from '../../src/planet/contract.js'
import { mapTileBounds, mapTileId, mapTileSample, type MapTile } from '../../src/scene/mercator.js'

const tile: MapTile = { z: 15, x: 16222, y: 11998 }
const asphaltHash = '1'.repeat(64)
const supportHash = '2'.repeat(64)
const collisionHash = '3'.repeat(64)

function layer(
  path: string,
  sha256: string,
  extra: Partial<PlanetCandidateRoadFile> = {},
): PlanetCandidateRoadFile {
  return { path, download: path, bytes: 4096, sha256, drivable: false, ...extra }
}

function baseManifest(): PlanetManifest {
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
        path: 'terra-15-16222-11998-202610051200.glb',
        download: 'earth-WebMercatorQuad-z15-x16222-y11998-terrain.glb',
        bytes: 2456789,
        sha256: 'a'.repeat(64),
      },
      'buildings-osm': {
        path: 'build-15-16222-11998-202610051200.glb',
        download: 'earth-WebMercatorQuad-z15-x16222-y11998-buildings-osm.glb',
        bytes: 1234567,
        sha256: 'b'.repeat(64),
      },
    },
  }
}

function triangle(category: string, extras: Record<string, unknown> = {}): PlanetMesh {
  return {
    name: category,
    position: new Float32Array([-1, 0, -1, -1, 0, 1, 1, 0, 1]),
    normal: new Float32Array(9),
    tint: '#333333',
    side: 0,
    metadata: { category, ...extras },
  }
}

describe('candidate road contract', () => {
  it('accepts hash-named and evidence-named road GLBs', () => {
    expect(isCandidateRoadGlbPath('asphalt-81c80882fd923967.glb')).toBe(true)
    expect(isCandidateRoadGlbPath('supports-candidate.glb')).toBe(true)
    expect(isCandidateRoadGlbPath('road-collision-candidate.glb')).toBe(true)
    expect(isCandidateRoadGlbPath('roads-asphalt-' + 'c'.repeat(64) + '.glb')).toBe(true)
    expect(isCandidateRoadGlbPath('terrain-ad8550fe0459ce7d.glb')).toBe(false)
    expect(isCandidateRoadGlbPath('../asphalt-candidate.glb')).toBe(false)
  })

  it('leaves a tile without roads unchanged', () => {
    const manifest = validatePlanetManifest(baseManifest(), tile)
    expect(manifest.roads).toBeUndefined()
    expect(planetTileGlbLayers(manifest).map((layer) => layer.kind)).toEqual([
      'terrain',
      'buildings-osm',
    ])
    expect(planetTileRevision(manifest)).toBe('a'.repeat(64) + ':' + 'b'.repeat(64))
  })

  it('loads asphalt and supports, keeps collision inspect-only, and rejects drivable: true', () => {
    const source = baseManifest()
    source.roads = {
      drivable: false,
      revision: 'fb1a685e-d9fe-4e31-9cc2-129bb9dfe8d2',
      recipe: 'asphalt-ground-junction-experiment-10',
      evidenceId: 'fb1a685e-d9fe-4e31-9cc2-129bb9dfe8d2',
      files: {
        asphalt: layer('asphalt-1111111111111111.glb', asphaltHash),
        supports: layer('supports-candidate.glb', supportHash),
        collision: layer('road-collision-candidate.glb', collisionHash),
      },
    }
    const manifest = validatePlanetManifest(source, tile)
    expect(manifest.roads?.drivable).toBe(false)
    expect(planetTileGlbLayers(manifest).map((entry) => entry.kind)).toEqual([
      'terrain',
      'buildings-osm',
      'asphalt',
      'supports',
    ])
    expect(
      planetTileGlbLayers(manifest, { inspectRoadCollision: true }).map((entry) => entry.kind),
    ).toEqual(['terrain', 'buildings-osm', 'asphalt', 'supports', 'collision'])
    expect(planetTileGlbLayers(manifest, { buildings: false }).map((entry) => entry.kind)).toEqual([
      'terrain',
      'asphalt',
      'supports',
    ])
    expect(planetTileRevision(manifest)).toBe(
      'a'.repeat(64) + ':' + 'b'.repeat(64) + ':fb1a685e-d9fe-4e31-9cc2-129bb9dfe8d2',
    )
    source.roads = { ...source.roads, drivable: true as unknown as false }
    expect(() => validatePlanetManifest(source, tile)).toThrow(/cannot be marked drivable/)
  })

  it('lifts files.roads-* and derives revision from layer hashes', () => {
    const source = baseManifest()
    source.files['roads-asphalt'] = layer('asphalt-candidate.glb', asphaltHash)
    source.files['roads-supports'] = layer('supports-2222222222222222.glb', supportHash)
    const manifest = validatePlanetManifest(source, tile)
    expect(manifest.roads).toMatchObject({
      drivable: false,
      files: {
        asphalt: { path: 'asphalt-candidate.glb', sha256: asphaltHash, drivable: false },
        supports: { path: 'supports-2222222222222222.glb', sha256: supportHash },
      },
    })
    expect(planetRoadRevision(manifest.roads!)).toBe(`${asphaltHash}:${supportHash}`)
    expect(planetTileRevision(manifest)).toContain(asphaltHash)
  })

  it('includes the road SHA-256 in the Cache Storage key only for candidate layers', () => {
    const file = layer('asphalt-candidate.glb', asphaltHash)
    expect(planetGlbCacheKey('/z/15/16222/11998/asphalt-candidate.glb', file, 'asphalt')).toBe(
      `/z/15/16222/11998/asphalt-candidate.glb?sha256=${asphaltHash}`,
    )
    expect(planetGlbCacheKey('/z/15/16222/11998/terrain.glb', file, 'terrain')).toBe(
      '/z/15/16222/11998/terrain.glb',
    )
  })
})

describe('candidate road collision', () => {
  it('keeps approved Roads driveable and skips candidate asphalt/supports/collision', () => {
    const approved = triangle('Roads')
    const asphalt = triangle('Roads', tagCandidateRoadMesh({}, 'asphalt'))
    const supports = triangle('Roads', tagCandidateRoadMesh({}, 'supports'))
    const inspect = triangle('Roads', tagCandidateRoadMesh({ category: 'Roads' }, 'collision'))
    const lidar = triangle('Terrain', { drivable: false, nablaTerrainLidar: true })
    expect(inspect.metadata.category).toBe('RoadCollision')
    const chunks = planetCollisionChunks([approved, asphalt, supports, inspect, lidar])
    const vertices = chunks.reduce((n, chunk) => n + chunk.triangles.length, 0)
    expect(vertices).toBe(approved.position.length + lidar.position.length)
  })
})
