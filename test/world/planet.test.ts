/**
 * Planet, in the same order as the module: frame, places, horizon, then collisions.
 */
import { describe, expect, it } from 'vitest'
import { Body, Box, Material, Vec3, World } from '../../src/simulation/physics.js'
import { Vector3 } from 'three'
import { ecef, localFrame, localToGeo } from '../../src/math/geo/sphere.js'
import {
  mapTileAt,
  mapTileBounds,
  mapTileChildren,
  mapTileFilename,
  mapTilePath,
  mapTileSample,
  parseMapTilePath,
} from '../../src/scene/mercator.js'
import {
  coversTile,
  horizonGeometry,
  planetCollisionChunks,
  planetPlaces,
  planetTileFrame,
  PlanetCollisions,
  validPlanetPlaces,
  type PlanetMesh,
  type PlanetTileSource,
} from '../../src/planet/index.js'

describe('frame', () => {
  it('names the same place independently of the scene and rejects aliases', () => {
    const tile = mapTileAt(43.32969, -1.819606, 15)
    expect(parseMapTilePath(mapTilePath(tile))).toEqual(tile)
    expect(mapTileFilename(tile, 'terrain')).toBe(
      `earth-WebMercatorQuad-z15-x${tile.x}-y${tile.y}-terrain.glb`,
    )
    for (const bad of ['0_0', 'z/15/01/2', 'z/15/32768/0', 'z/15/1/-1', 'z/15/1/2/../source'])
      expect(() => parseMapTilePath(bad)).toThrow()
  })
  it('samples adjacent and parent/child boundaries identically', () => {
    const tile = mapTileAt(41.5034, -5.744, 14)
    const east = { ...tile, x: tile.x + 1 }
    const south = { ...tile, y: tile.y + 1 }
    for (let i = 0; i <= 128; i++) {
      expect(mapTileSample(tile, 128, i, 128)).toEqual(mapTileSample(east, 0, i, 128))
      expect(mapTileSample(tile, i, 128, 128)).toEqual(mapTileSample(south, i, 0, 128))
    }
    const child = mapTileChildren(tile)[0]
    for (let i = 0; i <= 64; i++)
      expect(mapTileSample(tile, i, 0, 128)).toEqual(mapTileSample(child, i * 2, 0, 128))
  })
  it('projects shared borders onto the same planet, from different local frames', () => {
    for (const [lat, lon] of [
      [43.3, -1.8],
      [-33.8, 151.2],
      [80, 25],
    ]) {
      const tile = mapTileAt(lat, lon, 13)
      const left = planetTileFrame(tile),
        right = planetTileFrame({ ...tile, x: tile.x + 1 })
      const global = (f: typeof left, x: number, z: number) =>
        new Vector3(...f.local([x, 73, z]))
          .applyQuaternion(localFrame(f.anchor))
          .add(ecef(f.anchor))
      for (const fraction of [-0.5, -0.25, 0, 0.25, 0.5])
        expect(
          global(left, left.width / 2, left.width * fraction).distanceTo(
            global(right, -right.width / 2, right.width * fraction),
          ),
        ).toBeLessThan(1e-7)
    }
  })
  it('uses the exact XYZ bounds rather than a fixed metre size', () => {
    const tile = mapTileAt(43.32969, -1.819606, 15)
    const f = planetTileFrame(tile),
      b = mapTileBounds(tile)
    expect(f.width).not.toBe(1200)
    const nw = f.point([-f.width / 2, 0, -f.width / 2])
    const se = f.point([f.width / 2, 0, f.width / 2])
    expect(nw.longitude).toBeCloseTo(b.west, 12)
    expect(nw.latitude).toBeCloseTo(b.north, 12)
    expect(se.longitude).toBeCloseTo(b.east, 12)
    expect(se.latitude).toBeCloseTo(b.south, 12)
  })
})

it('keeps a complete parent while grandchildren only provide partial child coverage', async () => {
  const { planetReadyCover, mapTileId } = await import('../../src/scene/mercator.js')
  const root = mapTileAt(43, -1, 13),
    children = mapTileChildren(root),
    leaves = children.flatMap(mapTileChildren)
  const plan = {
    roots: [root],
    leaves,
    requests: [root, ...children, ...leaves],
    budgetLimited: false,
  }
  const partial = new Set([
    mapTileId(root),
    ...children.map((c) => mapTileId(mapTileChildren(c)[0])),
  ])
  expect(planetReadyCover(plan, partial)).toEqual([root])
  const full = new Set([mapTileId(root), ...leaves.map(mapTileId)])
  expect(planetReadyCover(plan, full)).toEqual(leaves)
  partial.delete(mapTileId(root))
  expect(planetReadyCover(plan, partial)).toHaveLength(4)
})

describe('places', () => {
  it('preserves named places and terrain height with one tile owner', () => {
    const tile = mapTileAt(43.33, -1.82, 15),
      frame = planetTileFrame(tile)
    const point = [frame.anchor.longitude, frame.anchor.latitude] as [number, number]
    const feature = {
      id: 'node/1',
      tags: { place: 'city', name: 'Irún' },
      rings: [{ role: 'outer' as const, coordinates: [point] }],
    }
    const source: PlanetTileSource = {
      format: 'nabla-planet-source-v1',
      tile,
      retrievedAt: new Date().toISOString(),
      elevation: { segments: 32, heights: Array(33 ** 2).fill(600), provider: 'esri-terrain-3d' },
      features: [feature, feature],
    }
    const places = planetPlaces(source)
    expect(places).toHaveLength(1)
    expect(places[0].text).toBe('Irún')
    expect(localToGeo(frame.anchor, places[0].position).altitude).toBeCloseTo(620, 4)
    expect(planetPlaces({ ...source, tile: { ...tile, x: tile.x + 1 } })).toEqual([])
    expect(validPlanetPlaces([...places, { ...places[0], position: [0, NaN, 0] }])).toEqual(places)
    expect(validPlanetPlaces(undefined)).toEqual([])
  })
})

describe('horizon', () => {
  it('builds real curved relief with independently replaceable XYZ children and collision triangles', () => {
    const tile = mapTileAt(43.32969, -1.819606, 13),
      data = horizonGeometry(tile, Array(33 * 33).fill(120))
    expect(data.uv).toHaveLength(33 * 33 * 2)
    expect(data.uv[1]).toBe(1)
    expect(data.blocks).toHaveLength(16)
    expect(data.blocks.every((b) => coversTile(tile, b.tile))).toBe(true)
    expect(data.blocks.reduce((n, b) => n + b.index.length, 0)).toBe(32 * 32 * 6)
    expect(
      data.blocks.reduce((n, b) => n + b.chunks.reduce((k, c) => k + c.triangles.length / 9, 0), 0),
    ).toBe(32 * 32 * 2)
    const center = planetTileFrame(tile).local([0, 120, 0])
    expect(data.position[(16 * 33 + 16) * 3 + 1]).toBeCloseTo(center[1], 3)
    const removed = data.blocks[5].tile
    const remaining = data.blocks.filter((b) => !coversTile(removed, b.tile))
    expect(remaining).toHaveLength(15)
    expect(
      remaining.every((b) =>
        b.chunks.every((c) => !c.key.startsWith(`WebMercatorQuad/15/${removed.x}/${removed.y}:`)),
      ),
    ).toBe(true)
  })
})

describe('collisions', () => {
  const ground: PlanetMesh = {
    name: 'Ground',
    position: new Float32Array([
      -10, 0, -10, -10, 0, 10, 10, 0, 10, -10, 0, -10, 10, 0, 10, 10, 0, -10,
    ]),
    normal: new Float32Array(18),
    tint: '#888888',
    side: 0,
    metadata: { category: 'Terrain' },
  }
  it('uses each GLB triangle once and supports a vehicle box on the rendered surface', () => {
    const chunks = planetCollisionChunks([ground])
    expect(chunks.reduce((n, c) => n + c.triangles.length, 0)).toBe(ground.position.length)
    const world = new World({ gravity: new Vec3(0, -9.81, 0) })
    const colliders = new PlanetCollisions(world, new Material())
    colliders.setTiles([
      {
        id: 'WebMercatorQuad/15/1/1',
        pose: { position: [0, 4, 0], rotation: [0, 0, 0, 1] },
        chunks,
      },
    ])
    for (let i = 0; i < 20 && !colliders.ready; i++) colliders.update([[0, 5, 0]], true, 100)
    expect(colliders.ready).toBe(true)
    const car = new Body({
      mass: 10,
      position: new Vec3(0, 6, 0),
      shape: new Box(new Vec3(0.5, 0.5, 0.5)),
    })
    world.addBody(car)
    for (let i = 0; i < 240; i++) world.step(1 / 60)
    expect(car.position.y).toBeGreaterThan(4.45)
    expect(car.position.y).toBeLessThan(4.6)
    colliders.dispose()
    expect(world.bodies).toEqual([car])
  })
  it('retains old coverage until replacement collisions are ready and removes them together', () => {
    const world = new World(),
      colliders = new PlanetCollisions(world, new Material())
    const chunks = planetCollisionChunks([ground])
    const pose = {
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
    }
    colliders.setTiles([{ id: 'parent', pose, chunks }])
    colliders.update([[0, 1, 0]], true, 100)
    const old = [...world.bodies]
    colliders.setTiles([{ id: 'child', pose, chunks }])
    colliders.update([[0, 1, 0]], true, 100)
    expect(world.bodies.length).toBe(old.length)
    expect(world.bodies.every((b) => !old.includes(b))).toBe(true)
    colliders.update([[0, 1000, 0]], true)
    expect(world.bodies).toHaveLength(0)
  })
})
