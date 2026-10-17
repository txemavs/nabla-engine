import { afterEach, expect, it, vi } from 'vitest'
import { PlanetWorld } from '../../src/render/planet/world.js'
import { mapTileAt, mapTileId } from '../../src/scene/mercator.js'

const origin = { latitude: 43.34, longitude: -1.76, altitude: 50 }
afterEach(() => vi.unstubAllGlobals())
function world(meshMinZoom?: 12 | 13 | 14 | 15, meshMaxZoom?: 15 | 16) {
  class Worker {
    onmessage?: unknown
    postMessage() {}
    terminate() {}
  }
  vi.stubGlobal('Worker', Worker)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })))
  return new PlanetWorld(
    origin,
    () => {},
    () => {},
    'https://tiles.example',
    '/prepare',
    'static',
    { horizon: false, meshMinZoom, meshMaxZoom },
  )
}
it('startup requests only usable spawn terrain, then restores the existing coverage budget', () => {
  const w = world()
  try {
    w.setStartupMode(true)
    w.update([0, 0, 0], [277.78, 0, 0], [[5000, 0, 5000]])
    expect(w.diagnostics.tiles.map((t) => mapTileId(t.tile))).toEqual([
      mapTileId(mapTileAt(origin.latitude, origin.longitude, 15)),
    ])
    w.setStartupMode(false)
    w.update([0, 0, 0], [0, 0, 0])
    expect(w.diagnostics.tiles.length).toBeGreaterThan(1)
    expect(w.diagnostics.tiles.length).toBeLessThanOrEqual(64)
  } finally {
    w.dispose()
  }
})
it('a Z15-only static host never receives unpublished coarse requests while flying', () => {
  const w = world()
  try {
    w.setStreamMode('flight')
    w.update([0, 1000, 0], [277.78, 0, 0])
    expect(new Set(w.diagnostics.tiles.map((t) => t.tile.z))).toEqual(new Set([15]))
  } finally {
    w.dispose()
  }
})
it('a flight at 1000 km/h anticipates coarse meshes while retaining local Z15 support within budget', () => {
  const w = world(12)
  try {
    w.setStreamMode('flight')
    w.setQuality(2, 30, false, 64)
    w.update([0, 500, 0], [1000 / 3.6, 0, 0])
    const tiles = w.diagnostics.tiles
    const zooms = new Set(tiles.map((t) => t.tile.z))
    expect(zooms.has(12)).toBe(true)
    expect(zooms.has(15)).toBe(true)
    expect(tiles.length).toBeLessThanOrEqual(64)
    expect(
      tiles.some(
        ({ tile }) =>
          tile.z === 12 &&
          tile.x > Math.floor(mapTileAt(origin.latitude, origin.longitude, 15).x / 8),
      ),
    ).toBe(true)
    w.setStreamMode('ground')
    w.update([0, 0, 0], [0, 0, 0])
    expect(new Set(w.diagnostics.tiles.map((t) => t.tile.z))).toEqual(new Set([15]))
  } finally {
    w.dispose()
  }
})

it('retains the local fine mesh if its advertised coarse ancestors are not yet published', async () => {
  const { Group } = await import('three')
  const w = world(12)
  const tile = mapTileAt(origin.latitude, origin.longitude, 15),
    key = mapTileId(tile)
  try {
    w.setStreamMode('flight')
    w.update([0, 5000, 0], [277.78, 0, 0])
    // Model an installed local tile while the network has not supplied any coarse ancestor.
    const state = w as unknown as {
      ready: Map<string, unknown>
      resident: Map<string, unknown>
      cover: () => void
    }
    state.ready.set(key, { tile })
    const group = new Group()
    state.resident.set(key, { group, bytes: 0 })
    state.cover()
    expect(group.visible).toBe(true)
    expect(w.cellStats.visible).toBe(1)
    state.resident.clear()
    state.ready.clear()
  } finally {
    w.dispose()
  }
})

it('high flight does not force a heavy Z15 download under every overflown cell, but descent prepares it', () => {
  const w = world(12)
  try {
    w.setStreamMode('flight')
    w.setQuality(2, 30, false, 64)
    w.update([0, 5000, 0], [277.78, 0, 0], [[0, 5000, 0]])
    expect(w.diagnostics.tiles.every((t) => t.tile.z < 15)).toBe(true)
    w.update([0, 3000, 0], [277.78, -80, 0], [[0, 3000, 0]])
    expect(w.diagnostics.tiles.some((t) => t.tile.z === 15)).toBe(true)
  } finally {
    w.dispose()
  }
})

it('falls back to the published Z15 mesh in a region whose advertised coarse parent is missing', async () => {
  const w = world(12)
  try {
    w.setStreamMode('flight')
    w.update([0, 5000, 0], [277.78, 0, 0])
    await vi.waitFor(() => expect(w.missingTiles.some((t) => t.z === 12)).toBe(true))
    w.update([0, 5000, 0], [277.78, 0, 0])
    expect(w.diagnostics.tiles.every((t) => t.tile.z === 15)).toBe(true)
  } finally {
    w.dispose()
  }
})

it('evicts unused resident cells to the configured limit rather than retaining a fixed 64', async () => {
  const { Group } = await import('three')
  const w = world()
  try {
    w.setMaxTiles(8)
    w.update([0, 0, 0], [0, 0, 0])
    const state = w as unknown as { resident: Map<string, unknown>; cover: () => void }
    for (let i = 0; i < 20; i++)
      state.resident.set(mapTileId({ z: 15, x: 100 + i, y: 100 }), { group: new Group(), bytes: 1 })
    state.cover()
    expect(w.cellStats.loaded).toBe(8)
  } finally {
    w.dispose()
  }
})

it('nearby startup freezes exactly four Z15 cells while ground checks visit neighbours', async () => {
  const { startupTerrainTiles } = await import('../../src/render/planet/startup-tiles.js')
  const { geoToLocal } = await import('../../src/math/geo/sphere.js')
  const { mapTileSample } = await import('../../src/scene/mercator.js')
  const w = world()
  try {
    w.setStartupMode(true, 4)
    w.update([0, 0, 0], [277.78, 0, 0])
    const expected = startupTerrainTiles(origin.latitude, origin.longitude)
    expect(w.startupTiles).toEqual(expected)
    expect(w.diagnostics.tiles.map((t) => mapTileId(t.tile))).toEqual(expected.map(mapTileId))
    const neighbour = geoToLocal(origin, mapTileSample(expected[2]!, 1, 1, 2))
    w.update(neighbour, [0, 0, 0])
    expect(w.startupTiles).toEqual(expected)
    expect(w.diagnostics.tiles.map((t) => mapTileId(t.tile))).toEqual(expected.map(mapTileId))
    w.setStartupMode(false)
    w.update([0, 0, 0], [0, 0, 0])
    expect(w.diagnostics.tiles.length).toBeGreaterThan(4)
  } finally {
    w.dispose()
  }
})

it('selects the closest three neighbours by position and wraps across the antimeridian', async () => {
  const { startupTerrainTiles } = await import('../../src/render/planet/startup-tiles.js')
  const { mapTileBounds } = await import('../../src/scene/mercator.js')
  const center = mapTileAt(origin.latitude, origin.longitude, 15)
  const bounds = mapTileBounds(center)
  const tiles = startupTerrainTiles(
    bounds.north - (bounds.north - bounds.south) * 0.01,
    bounds.west + (bounds.east - bounds.west) * 0.01,
  )
  expect(new Set(tiles.map(mapTileId))).toEqual(
    new Set(
      [
        center,
        { ...center, x: center.x - 1 },
        { ...center, y: center.y - 1 },
        { ...center, x: center.x - 1, y: center.y - 1 },
      ].map(mapTileId),
    ),
  )
  const wrapped = startupTerrainTiles(0.001, -179.99999)
  expect(new Set(wrapped.map(mapTileId)).size).toBe(4)
  expect(wrapped.some((t) => t.x === 32767)).toBe(true)
})

it('Z16 startup requests one Z15 fallback and its four actual children', async () => {
  const { mapTileChildren } = await import('../../src/scene/mercator.js')
  const w = world(15, 16)
  try {
    w.setStartupMode(true, 4)
    w.update([0, 0, 0], [0, 0, 0])
    const parent = mapTileAt(origin.latitude, origin.longitude, 15)
    const children = mapTileChildren(parent)
    expect(w.startupTiles).toEqual(children)
    expect(w.diagnostics.tiles.map((t) => mapTileId(t.tile))).toEqual(
      [parent, ...children].map(mapTileId),
    )
    w.setStartupMode(false)
    w.update([0, 0, 0], [10, 0, 0])
    expect(new Set(w.diagnostics.tiles.map((t) => t.tile.z))).toEqual(new Set([15, 16]))
    expect(w.diagnostics.tiles.length).toBeLessThanOrEqual(64)
  } finally {
    w.dispose()
  }
})

it('installed Z16 cells and pins retain the Z15 collider until the quartet is ready', async () => {
  const { Group, Vector3 } = await import('three')
  const { mapTileChildren } = await import('../../src/scene/mercator.js')
  const parent = mapTileAt(origin.latitude, origin.longitude, 15)
  const children = mapTileChildren(parent)
  const w = world(15, 16)
  const state = w as unknown as {
    ready: Map<string, unknown>
    resident: Map<string, unknown>
    pinned: Map<string, typeof parent>
    visible: string[]
    cover: () => void
  }
  try {
    w.setStartupMode(true, 4)
    w.update([0, 0, 0], [0, 0, 0])
    const setPlanetTiles = vi.fn()
    const simulation = {
      setPlanetTiles,
      discardPlanetReplacement: vi.fn(),
    } as unknown as Parameters<typeof w.renderUpdate>[2]
    for (const tile of [parent, ...children]) {
      const key = mapTileId(tile)
      state.ready.set(key, { tile })
      state.resident.set(key, { group: new Group(), bytes: 0, collision: { key } })
      if (tile.z === 16) state.pinned.set(key, tile)
      state.cover()
      expect(state.visible).toEqual(
        tile === children[3] ? children.map(mapTileId) : [mapTileId(parent)],
      )
      w.renderUpdate(new Vector3(), true, simulation)
      expect(setPlanetTiles.mock.lastCall?.[0].map((c: { key: string }) => c.key)).toEqual(
        state.visible,
      )
    }
  } finally {
    state.resident.clear()
    state.ready.clear()
    w.dispose()
  }
})

it('a missing Z16 child does not abort ground loading while its fallback is pending', () => {
  const w = world(15, 16)
  const state = w as unknown as {
    missing: { record: (tile: ReturnType<typeof mapTileAt>, status: number) => void }
  }
  try {
    const child = mapTileAt(origin.latitude, origin.longitude, 16)
    state.missing.record(child, 404)
    expect(w.missingTileAt([0, 0, 0])).toBeUndefined()
    state.missing.record(mapTileAt(origin.latitude, origin.longitude, 15), 404)
    expect(w.missingTileAt([0, 0, 0])).toEqual(child)
  } finally {
    w.dispose()
  }
})
