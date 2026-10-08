import { describe, expect, it } from 'vitest'
import {
  BRIDGE_DECK_ROLE,
  castsPlanetShadow,
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
  ROAD_CANDIDATES_SCHEMA,
  type PlanetCandidateRoadFile,
  type PlanetRoadCandidates,
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

function atlasRoadCandidates(): PlanetRoadCandidates {
  return {
    schema: ROAD_CANDIDATES_SCHEMA,
    review: 'unreviewed',
    drivable: false,
    engineLoad: { asphalt: 'immediate', supports: 'immediate', collision: 'opt-in' },
    recipe: 'asphalt-ground-junction-experiment-10',
    evidenceId: 'fb1a685e-d9fe-4e31-9cc2-129bb9dfe8d2',
    evidenceSha256: 'e'.repeat(64),
    layers: {
      asphalt: {
        path: 'asphalt-candidate-1111111111111111.glb',
        bytes: 597856,
        sha256: asphaltHash,
        role: 'road.asphalt.candidate',
        engineLoad: 'immediate',
        drivable: false,
      },
      supports: {
        path: 'supports-candidate-2222222222222222.glb',
        bytes: 23916,
        sha256: supportHash,
        role: 'road.supports.candidate',
        engineLoad: 'immediate',
        drivable: false,
      },
      collision: {
        path: 'road-collision-candidate-3333333333333333.glb',
        bytes: 597864,
        sha256: collisionHash,
        role: 'road.collision.candidate',
        engineLoad: 'opt-in',
        drivable: false,
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
    expect(isCandidateRoadGlbPath('asphalt-candidate-81c80882fd923967.glb')).toBe(true)
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

  it('loads asphalt and supports even when marked drivable: false', () => {
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
    source.roads = { ...source.roads, drivable: true }
    expect(validatePlanetManifest(source, tile).roads?.drivable).toBe(true)
    expect(
      planetTileGlbLayers(validatePlanetManifest(source, tile)).map((entry) => entry.kind),
    ).toEqual(['terrain', 'buildings-osm', 'asphalt', 'supports'])
  })

  it('lifts files.roads-* and derives revision from layer hashes', () => {
    const source = baseManifest()
    source.files['roads-asphalt'] = layer('asphalt-candidate.glb', asphaltHash)
    source.files['roads-supports'] = layer('supports-2222222222222222.glb', supportHash)
    const manifest = validatePlanetManifest(source, tile)
    expect(manifest.roads).toMatchObject({
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

  it('maps Atlas #49 roadCandidates.layers onto the same load set as roads.files', () => {
    const source = baseManifest()
    source.roadCandidates = atlasRoadCandidates()
    const manifest = validatePlanetManifest(source, tile)
    expect(manifest.roads).toMatchObject({
      drivable: false,
      recipe: 'asphalt-ground-junction-experiment-10',
      evidenceId: 'fb1a685e-d9fe-4e31-9cc2-129bb9dfe8d2',
      evidenceSha256: 'e'.repeat(64),
      engineLoad: { asphalt: 'immediate', supports: 'immediate', collision: 'opt-in' },
      files: {
        asphalt: { path: 'asphalt-candidate-1111111111111111.glb', sha256: asphaltHash },
        supports: { path: 'supports-candidate-2222222222222222.glb', sha256: supportHash },
        collision: { path: 'road-collision-candidate-3333333333333333.glb', sha256: collisionHash },
      },
    })
    expect(planetTileGlbLayers(manifest).map((entry) => entry.kind)).toEqual([
      'terrain',
      'buildings-osm',
      'asphalt',
      'supports',
    ])
    expect(
      planetTileGlbLayers(manifest, { inspectRoadCollision: true }).map((entry) => entry.kind),
    ).toEqual(['terrain', 'buildings-osm', 'asphalt', 'supports', 'collision'])
    expect(planetTileRevision(manifest)).toBe(
      'a'.repeat(64) + ':' + 'b'.repeat(64) + ':' + 'e'.repeat(64),
    )
    expect(Object.keys(source.files)).toEqual(['terrain', 'buildings-osm'])
    expect(manifest.roadCandidates?.schema).toBe(ROAD_CANDIDATES_SCHEMA)
  })

  it('does not treat drivable: false or engineLoad as skip gates for asphalt/supports', () => {
    const source = baseManifest()
    const candidates = atlasRoadCandidates()
    candidates.engineLoad = { asphalt: 'opt-in', supports: 'opt-in', collision: 'opt-in' }
    candidates.layers.asphalt = {
      ...candidates.layers.asphalt!,
      engineLoad: 'opt-in',
      drivable: false,
    }
    candidates.layers.supports = {
      ...candidates.layers.supports!,
      engineLoad: 'opt-in',
      drivable: false,
    }
    source.roadCandidates = candidates
    const manifest = validatePlanetManifest(source, tile)
    expect(planetTileGlbLayers(manifest).map((entry) => entry.kind)).toEqual([
      'terrain',
      'buildings-osm',
      'asphalt',
      'supports',
    ])
    expect(manifest.roads?.engineLoad?.asphalt).toBe('opt-in')
  })

  it('keeps both published shapes when they name the same files', () => {
    const source = baseManifest()
    source.roads = {
      drivable: false,
      files: {
        asphalt: layer('asphalt-candidate-1111111111111111.glb', asphaltHash),
        supports: layer('supports-candidate-2222222222222222.glb', supportHash),
      },
    }
    source.roadCandidates = atlasRoadCandidates()
    delete source.roadCandidates.layers.collision
    const manifest = validatePlanetManifest(source, tile)
    expect(planetTileGlbLayers(manifest).map((entry) => entry.kind)).toEqual([
      'terrain',
      'buildings-osm',
      'asphalt',
      'supports',
    ])
  })

  it('keeps the current publication and a disagreeing pointer as that layer fallback', () => {
    const source = baseManifest()
    source.roads = {
      files: { asphalt: layer('asphalt-candidate.glb', '4'.repeat(64)) },
    }
    source.roadCandidates = atlasRoadCandidates()
    const manifest = validatePlanetManifest(source, tile)
    const asphalt = manifest.roads?.files.asphalt
    expect(asphalt?.path).toBe('asphalt-candidate-1111111111111111.glb')
    expect(asphalt?.fallback?.path).toBe('asphalt-candidate.glb')
    expect(manifest.roads?.files.supports?.path).toBe('supports-candidate-2222222222222222.glb')
    expect(manifest.roads?.warnings?.[0]).toMatch(/roads\.files\.asphalt.*fallback/)
    const layers = planetTileGlbLayers(manifest)
    expect(layers.find((entry) => entry.kind === 'asphalt')?.fallback?.path).toBe(
      'asphalt-candidate.glb',
    )
    expect(layers.find((entry) => entry.kind === 'supports')?.fallback).toBeUndefined()
    // Revalidating (the Atlas adapter does) keeps the fallback.
    expect(validatePlanetManifest(manifest, tile).roads?.files.asphalt?.fallback?.path).toBe(
      'asphalt-candidate.glb',
    )
  })

  it('ignores one invalid road entry and keeps the other layers, bridges included', () => {
    const source = baseManifest()
    const candidates = atlasRoadCandidates()
    candidates.layers.asphalt = { ...candidates.layers.asphalt!, sha256: 'not-a-hash' }
    source.roadCandidates = candidates
    const manifest = validatePlanetManifest(source, tile)
    expect(manifest.roads?.files.asphalt).toBeUndefined()
    expect(manifest.roads?.files.supports?.path).toBe('supports-candidate-2222222222222222.glb')
    expect(manifest.roads?.warnings).toEqual([
      'roadCandidates.layers.asphalt: invalid entry ignored',
    ])
    expect(planetTileGlbLayers(manifest).map((entry) => entry.kind)).toEqual([
      'terrain',
      'buildings-osm',
      'supports',
    ])
  })

  it('loads the tile without roads when no road entry is usable', () => {
    const source = baseManifest()
    source.roads = { files: { asphalt: layer('../asphalt.glb', asphaltHash) } }
    const manifest = validatePlanetManifest(source, tile)
    expect(manifest.roads).toBeUndefined()
    expect(planetTileGlbLayers(manifest).map((entry) => entry.kind)).toEqual([
      'terrain',
      'buildings-osm',
    ])
  })

  it('always lists published bridge supports, whatever drivable or engineLoad say', () => {
    const source = baseManifest()
    const candidates = atlasRoadCandidates()
    candidates.drivable = false
    candidates.engineLoad = { asphalt: 'opt-in', supports: 'opt-in', collision: 'opt-in' }
    candidates.layers.supports = { ...candidates.layers.supports!, engineLoad: 'opt-in' }
    source.roadCandidates = candidates
    const kinds = planetTileGlbLayers(validatePlanetManifest(source, tile), {
      buildings: false,
    }).map((entry) => entry.kind)
    expect(kinds).toContain('supports')
  })

  it('rejects an unknown roadCandidates schema', () => {
    const source = baseManifest()
    source.roadCandidates = { ...atlasRoadCandidates(), schema: 'nabla-road-candidates/2' as never }
    expect(() => validatePlanetManifest(source, tile)).toThrow(/Invalid planet road layers/)
  })
})

describe('candidate road collision', () => {
  it('uses candidate asphalt/supports in driving collision and skips only the inspect GLB', () => {
    const approved = triangle('Roads')
    const asphalt = triangle('Roads', tagCandidateRoadMesh({ drivable: false }, 'asphalt'))
    const supports = triangle('Roads', tagCandidateRoadMesh({ drivable: false }, 'supports'))
    const inspect = triangle('Roads', tagCandidateRoadMesh({ category: 'Roads' }, 'collision'))
    const lidar = triangle('Terrain', { drivable: false, nablaTerrainLidar: true })
    expect(inspect.metadata.category).toBe('RoadCollision')
    const chunks = planetCollisionChunks([approved, asphalt, supports, inspect, lidar])
    const vertices = chunks.reduce((n, chunk) => n + chunk.triangles.length, 0)
    expect(vertices).toBe(
      approved.position.length +
        asphalt.position.length +
        supports.position.length +
        lidar.position.length,
    )
  })
})

describe('bridge shadow casters', () => {
  it('casts from terrain, buildings, supports and bridge-deck asphalt only', () => {
    expect(castsPlanetShadow({ category: 'Terrain' })).toBe(true)
    expect(castsPlanetShadow({ category: 'Buildings' })).toBe(true)
    expect(castsPlanetShadow({ category: 'Terrain', skirt: true })).toBe(false)
    const supports = tagCandidateRoadMesh({}, 'supports')
    expect(castsPlanetShadow(supports)).toBe(true)
    const deck = tagCandidateRoadMesh({ atlasSurfaceRole: BRIDGE_DECK_ROLE }, 'asphalt')
    expect(castsPlanetShadow(deck)).toBe(true)
    const ground = tagCandidateRoadMesh({ atlasSurfaceRole: 'ground-road' }, 'asphalt')
    expect(castsPlanetShadow(ground)).toBe(false)
    expect(castsPlanetShadow(tagCandidateRoadMesh({}, 'asphalt'))).toBe(false)
    expect(castsPlanetShadow(tagCandidateRoadMesh({}, 'collision'))).toBe(false)
    expect(castsPlanetShadow({ category: 'Roads' })).toBe(false)
  })
})
