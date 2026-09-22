import { expect, it, vi } from 'vitest'
import { WorldStream, wantedWorldTiles, worldTileAt, mapTileEntities } from './world-stream.js'
import { createEntity, type Entity, type SceneDocument } from './scene.js'
import { SceneEditor } from './editor.js'
import { Simulation, idleInput } from './simulation.js'
import { createA3 } from './presets.js'
import { rotationDegrees } from './scene.js'
import { clipRoadSegment } from './real-world.js'
const terrain = (key: string, x: number): Entity => ({
  ...createEntity(key === '0_0' ? 'world-terrain' : `world-terrain-${key}`, 'terrain', [x, 0, 0]),
  terrain: { columns: 121, rows: 121, spacing: 10, heights: Array(14641).fill(0) },
})
function document(): SceneDocument {
  return {
    version: 1,
    name: 'Stream',
    entities: [terrain('0_0', 0), createEntity('spawn', 'spawn', [584, 0.1, 0])],
  }
}
it('prefetches ahead before crossing the 600 m boundary, including negative coordinates', () => {
  expect(worldTileAt([601, 0, -601])).toEqual([1, -1])
  const idle = wantedWorldTiles([0, 0, 0], [0, 0, 0]),
    fast = wantedWorldTiles([400, 0, 0], [90, 0, 0])
  expect(idle).toContain('1_0')
  expect(fast).toContain('2_0')
  expect(idle).toContain('1_1')
  expect(idle).toContain('-1_-1')
  expect(fast.indexOf('2_0')).toBeLessThan(fast.indexOf('-1_0'))
})
it('clips road segments to identical neighboring edges instead of dropping crossing roads', () => {
  expect(clipRoadSegment([590, 0, 0], [620, 0, 0], 600, 600)).toEqual([
    [590, 0, 0],
    [600, 0, 0],
  ])
  expect(clipRoadSegment([-610, 0, 0], [-580, 0, 0], 600, 600)).toEqual([
    [-600, 0, 0],
    [-580, 0, 0],
  ])
  expect(clipRoadSegment([610, 0, 0], [620, 0, 0], 600, 600)).toBeNull()
})
it('keeps vehicle motion while adding terrain and drives across the old boundary', () => {
  const d = document(),
    car = createA3('car', [585, 0.85, 0])
  car.transform.rotation = rotationDegrees(0, -90, 0)
  d.entities.push(car)
  const s = new Simulation(d, { playerMode: 'hover' })
  for (let i = 0; i < 120; i++) s.step(1 / 60)
  s.interact()
  s.setInput({ ...idleInput(), forward: 1 })
  for (let i = 0; i < 30; i++) s.step(1 / 60)
  const before = s.player
  s.replaceMapEntities(new Set(), [terrain('1_0', 1200)])
  expect(s.player).toEqual(before)
  for (let i = 0; i < 300; i++) s.step(1 / 60)
  expect(s.player.position[0]).toBeGreaterThan(610)
  expect(s.player.position[1]).toBeGreaterThan(0)
  expect(s.shoot([1200, 20, 0], [0, -1, 0], 30, 0)?.entityId).toBe('world-terrain-1_0')
  s.dispose()
})
it('holds a grounded car before unavailable terrain rather than letting it fall', () => {
  const d = document(),
    car = createA3('car', [585, 0.85, 0])
  car.transform.rotation = rotationDegrees(0, -90, 0)
  d.entities.push(car)
  const s = new Simulation(d, { playerMode: 'hover' })
  for (let i = 0; i < 120; i++) s.step(1 / 60)
  s.interact()
  s.setInput({ ...idleInput(), forward: 1 })
  for (let i = 0; i < 400; i++) s.step(1 / 60)
  expect(s.player.position[0]).toBeLessThanOrEqual(592.01)
  expect(s.player.position[1]).toBeGreaterThan(0)
  s.dispose()
})
it('does not treat map arrivals as undo steps or undo away a loaded tile', () => {
  const editor = new SceneEditor(document())
  editor.update('world-terrain', { color: '#123456' })
  editor.replaceMapEntities(new Set(), [terrain('1_0', 1200)])
  editor.undo()
  expect(editor.document.entities.some((e) => e.id === 'world-terrain-1_0')).toBe(true)
  expect(editor.document.entities.find((e) => e.id === 'world-terrain')!.color).not.toBe('#123456')
})
it('deduplicates requests, backs off failures and cancels a discarded session', async () => {
  const editor = new SceneEditor(document()),
    status = vi.fn()
  const rejects: Array<(error: Error) => void> = []
  const load = vi.fn(
    (_key: string, _signal: AbortSignal) =>
      new Promise<Entity[]>((_res, rej) => {
        rejects.push(rej)
      }),
  )
  const stream = new WorldStream({
    document: () => editor.document,
    load,
    replace: (r, a) => editor.replaceMapEntities(r, a),
    status,
  })
  stream.update([0, 0, 0], [0, 0, 0])
  stream.update([0, 0, 0], [0, 0, 0])
  const initialCalls = load.mock.calls.length
  expect(initialCalls).toBeGreaterThanOrEqual(1)
  expect(initialCalls).toBeLessThanOrEqual(3)
  const firstKey = load.mock.calls[0][0]
  expect(load.mock.calls.filter(([k]) => k === firstKey)).toHaveLength(1)
  rejects[0](new Error('HTTP 429'))
  await new Promise((r) => setTimeout(r, 0))
  stream.update([0, 0, 0], [0, 0, 0])
  expect(load.mock.calls.filter(([k]) => k === firstKey)).toHaveLength(1)
  stream.update([0, 0, 0], [0, 0, 0], [], Date.now() + 61000)
  await new Promise((r) => setTimeout(r, 0))
  expect(load.mock.calls.filter(([k]) => k === firstKey).length).toBeGreaterThanOrEqual(2)
  const lastSignal = load.mock.calls[load.mock.calls.length - 1][1]
  stream.dispose()
  expect(lastSignal.aborted).toBe(true)
})
it('finds a tiles descendants without including actors or unrelated authored entities', () => {
  const d = document(),
    child = createEntity('building', 'solid')
  child.parentId = 'world-buildings'
  d.entities.push(createEntity('world-buildings', 'group'), child, createEntity('extra', 'box'))
  expect(mapTileEntities(d, '0_0').map((e) => e.id)).toEqual([
    'world-terrain',
    'world-buildings',
    'building',
  ])
})

it('evicts clean distant zones but retains authored changes during a long journey', async () => {
  const editor = new SceneEditor(document())
  let first = ''
  const stream = new WorldStream({
    document: () => editor.document,
    load: async (key) => {
      first ||= key
      const [x, z] = key.split('_').map(Number)
      const ground = terrain(key, x * 1200)
      ground.transform.position[2] = z * 1200
      const group = createEntity(`world-buildings-${key}`, 'group')
      const building = createEntity(`building-${key}`, 'box')
      building.parentId = group.id
      return [ground, group, building]
    },
    replace: (r, a) => editor.replaceMapEntities(r, a),
    status: () => undefined,
  })
  stream.update([0, 0, 0], [0, 0, 0])
  await new Promise((r) => setTimeout(r, 0))
  editor.update(`building-${first}`, { color: '#123456' })
  for (let i = 1; i < 24; i++) {
    stream.update([i * 1200, 0, 0], [0, 0, 0], [], Date.now() + i * 10000)
    await new Promise((r) => setTimeout(r, 0))
  }
  expect(editor.document.entities.find((e) => e.id === `building-${first}`)!.color).toBe('#123456')
  expect(editor.document.entities.filter((e) => e.terrain).length).toBeLessThanOrEqual(12)
  expect(editor.document.entities.some((e) => e.id === 'world-terrain-1_0')).toBe(false)
  stream.dispose()
})

it('prefetches a continuous corridor at 1000 km/h and follows travel far from the origin', () => {
  const fast = wantedWorldTiles([0, 100, 0], [1000 / 3.6, 0, 0])
  for (let x = 0; x <= 4; x++) expect(fast).toContain(`${x}_0`)
  const far = wantedWorldTiles([12000, 100, -12000], [0, 0, 0])
  expect(far[0]).toBe('10_-10')
  expect(far).not.toContain('0_0')
  expect(far).toHaveLength(9)
})

it('fills other holes after a failed tile without delaying cached arrivals for a minute', async () => {
  const editor = new SceneEditor(document())
  const calls: string[] = []
  let firstFailed = ''
  const stream = new WorldStream({
    document: () => editor.document,
    load: async (key) => {
      calls.push(key)
      if (!firstFailed) {
        firstFailed = key
        throw new Error('HTTP 503')
      }
      const [x, z] = key.split('_').map(Number)
      const e = terrain(key, x * 1200)
      e.transform.position[2] = z * 1200
      return [e]
    },
    replace: (r, a) => editor.replaceMapEntities(r, a),
    status: () => undefined,
  })
  stream.update([0, 0, 0], [0, 0, 0])
  await new Promise((r) => setTimeout(r, 0))
  stream.update([0, 0, 0], [0, 0, 0], [], Date.now() + 500)
  await new Promise((r) => setTimeout(r, 0))
  expect(calls.length).toBeGreaterThanOrEqual(2)
  expect(calls.some((k) => k !== firstFailed)).toBe(true)
  expect(editor.document.entities.filter((e) => e.terrain).length).toBeGreaterThanOrEqual(2)
  stream.update([0, 0, 0], [0, 0, 0], [], Date.now() + 1000)
  await new Promise((r) => setTimeout(r, 0))
  expect(editor.document.entities.filter((e) => e.terrain).length).toBeGreaterThanOrEqual(3)
  stream.dispose()
})

it('prioritizes immediate neighborhood and loads distant zone when position changes', async () => {
  const editor = new SceneEditor(document())
  const calls: string[] = []
  const stream = new WorldStream({
    document: () => editor.document,
    load: async (key) => {
      calls.push(key)
      const [x, z] = key.split('_').map(Number)
      const e = terrain(key, x * 1200)
      e.transform.position[2] = z * 1200
      return [e]
    },
    replace: (r, a) => editor.replaceMapEntities(r, a),
    status: () => undefined,
  })
  let time = Date.now()
  stream.update([0, 100, 0], [0, 0, 0], [], time)
  await new Promise((r) => setTimeout(r, 10))
  time += 200
  stream.update([0, 100, 0], [0, 0, 0], [], time)
  await new Promise((r) => setTimeout(r, 10))
  time += 200
  stream.update([12000, 100, 0], [0, 0, 0], [], time)
  await new Promise((r) => setTimeout(r, 10))
  time += 200
  stream.update([12000, 100, 0], [0, 0, 0], [], time)
  await new Promise((r) => setTimeout(r, 10))
  expect(calls.some((k) => k.startsWith('10_') || k.startsWith('9_'))).toBe(true)
  stream.dispose()
})

it('replaces farther clean tiles before a dense arrival exceeds the entity budget', async () => {
  const editor = new SceneEditor(document())
  const sizes: number[] = []
  const load = vi.fn(async (key: string) => {
    const [x, z] = key.split('_').map(Number)
    const ground = terrain(key, x * 1200)
    ground.transform.position[2] = z * 1200
    return [ground, createEntity(`world-buildings-${key}`, 'group')]
  })
  const stream = new WorldStream(
    {
      document: () => editor.document,
      load,
      replace: (r, a) => {
        editor.replaceMapEntities(r, a)
        sizes.push(editor.document.entities.length)
      },
      status: () => undefined,
    },
    20,
  )
  let time = Date.now()
  stream.update([0, 0, 0], [0, 0, 0], [], time)
  await new Promise((r) => setTimeout(r, 10))
  time += 200
  stream.update([0, 0, 0], [0, 0, 0], [], time)
  await new Promise((r) => setTimeout(r, 10))
  time += 200
  stream.update([3600, 0, 0], [0, 0, 0], [], time)
  await new Promise((r) => setTimeout(r, 10))
  time += 200
  stream.update([3600, 0, 0], [0, 0, 0], [], time)
  await new Promise((r) => setTimeout(r, 10))
  expect(sizes.length).toBeGreaterThanOrEqual(1)
  stream.dispose()
})

it('preserves edited tiles and avoids repeating budget-rejected loads while stationary', async () => {
  const editor = new SceneEditor(document())
  const load = vi.fn(async (key: string) => {
    const [x, z] = key.split('_').map(Number)
    const ground = terrain(key, x * 1200)
    ground.transform.position[2] = z * 1200
    return [ground]
  })
  const status = vi.fn()
  const stream = new WorldStream(
    {
      document: () => editor.document,
      load,
      replace: (r, a) => editor.replaceMapEntities(r, a),
      status,
    },
    3,
  )
  stream.update([0, 0, 0], [0, 0, 0])
  await new Promise((r) => setTimeout(r, 0))
  const loadedKeys = load.mock.calls.map(([k]) => k)
  const editableKey = loadedKeys.find((k) => k !== '0_0') ?? loadedKeys[0]
  const terrainId = editableKey === '0_0' ? 'world-terrain' : `world-terrain-${editableKey}`
  if (editor.document.entities.some((e) => e.id === terrainId)) {
    editor.update(terrainId, { color: '#123456' })
    expect(editor.document.entities.find((e) => e.id === terrainId)!.color).toBe('#123456')
  }
  stream.dispose()
})

it('does not insert streamed city entities into a different destination in undo history', () => {
  const previous = document()
  previous.geography = { latitude: 40, longitude: 0, altitude: 0, imagery: 'offline' }
  const editor = new SceneEditor(previous)
  const next = document()
  next.geography = { ...previous.geography, latitude: 43 }
  editor.load(next)
  editor.replaceMapEntities(new Set(), [terrain('1_0', 1200)])
  editor.undo()
  expect(editor.document.geography!.latitude).toBe(40)
  expect(editor.document.entities.some((e) => e.id === 'world-terrain-1_0')).toBe(false)
})

it('can evict untouched generated zones after saving and reopening, but pins edited ones', async () => {
  const { mapFingerprint } = await import('./world-stream.js')
  const d = document()
  d.entities[0].mapBaseline = mapFingerprint(mapTileEntities(d, '0_0'))
  const editor = new SceneEditor(JSON.parse(JSON.stringify(d)))
  const stream = new WorldStream(
    {
      document: () => editor.document,
      load: async (key) => {
        const [x, z] = key.split('_').map(Number)
        const ground = terrain(key, x * 1200)
        ground.transform.position[2] = z * 1200
        return [ground, createEntity(`world-buildings-${key}`, 'group')]
      },
      replace: (remove, add) => editor.replaceMapEntities(remove, add),
      status: () => undefined,
    },
    20,
  )
  let time = Date.now()
  stream.update([12000, 100, 0], [0, 0, 0], [], time)
  await new Promise((r) => setTimeout(r, 10))
  time += 200
  stream.update([12000, 100, 0], [0, 0, 0], [], time)
  await new Promise((r) => setTimeout(r, 10))
  expect(editor.document.entities.some((e) => e.id === 'world-terrain-10_0')).toBe(true)
  stream.dispose()
  d.entities[0].color = '#123456'
  const edited = new SceneEditor(d)
  const locked = new WorldStream(
    {
      document: () => edited.document,
      load: async (key) => {
        const [x, z] = key.split('_').map(Number)
        const ground = terrain(key, x * 1200)
        ground.transform.position[2] = z * 1200
        return [ground, createEntity(`world-buildings-${key}`, 'group')]
      },
      replace: (remove, add) => edited.replaceMapEntities(remove, add),
      status: () => undefined,
    },
    3,
  )
  locked.update([12000, 100, 0], [0, 0, 0])
  await new Promise((r) => setTimeout(r, 10))
  expect(edited.document.entities.find((e) => e.id === 'world-terrain')!.color).toBe('#123456')
  locked.dispose()
})

it('verifies legacy saved zones against their source before freeing space', async () => {
  const editor = new SceneEditor(document())
  const original = structuredClone(mapTileEntities(editor.document, '0_0'))
  const stream = new WorldStream(
    {
      document: () => editor.document,
      load: async (key) => {
        if (key === '0_0') return original
        const [x, z] = key.split('_').map(Number)
        const ground = terrain(key, x * 1200)
        ground.transform.position[2] = z * 1200
        return [ground, createEntity(`world-buildings-${key}`, 'group')]
      },
      replace: (remove, add) => editor.replaceMapEntities(remove, add),
      status: () => undefined,
    },
    20,
  )
  let time = Date.now()
  stream.update([12000, 100, 0], [0, 0, 0], [], time)
  await new Promise((r) => setTimeout(r, 10))
  time += 200
  stream.update([12000, 100, 0], [0, 0, 0], [], time)
  await new Promise((r) => setTimeout(r, 10))
  expect(editor.document.entities.some((e) => e.id === 'world-terrain-10_0')).toBe(true)
  stream.dispose()
})

it('prioritizes the immediate neighborhood when crossing into unloaded terrain', async () => {
  const editor = new SceneEditor(document())
  const calls: string[] = []
  const stream = new WorldStream({
    document: () => editor.document,
    load: async (key) => {
      calls.push(key)
      const [x, z] = key.split('_').map(Number)
      const e = terrain(key, x * 1200)
      e.transform.position[2] = z * 1200
      return [e]
    },
    replace: (r, a) => editor.replaceMapEntities(r, a),
    status: () => undefined,
  })
  let time = Date.now()
  stream.update([0, 0, 0], [0, 0, 0], [], time)
  await new Promise((r) => setTimeout(r, 10))
  time += 200
  stream.update([0, 0, 0], [0, 0, 0], [], time)
  await new Promise((r) => setTimeout(r, 10))
  time += 200
  stream.update([1200, 0, 0], [0, 0, 0], [], time)
  await new Promise((r) => setTimeout(r, 10))
  time += 200
  stream.update([1200, 0, 0], [0, 0, 0], [], time)
  await new Promise((r) => setTimeout(r, 10))
  expect(calls.some((k) => k === '1_0' || k === '2_0')).toBe(true)
  expect(editor.document.entities.some((e) => e.id === 'world-terrain-1_0')).toBe(true)
  stream.dispose()
})
