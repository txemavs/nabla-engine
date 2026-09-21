import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { createRealWorld, type WorldExtract, IRUN_VENTAS } from './real-world.js'
import { terrainHeight } from './terrain.js'
import { Simulation, idleInput } from './simulation.js'
import { SceneEditor } from './editor.js'
import { parseScene } from './scene.js'
const data = JSON.parse(
  readFileSync(new URL('../assets/geography/irun-ventas.json', import.meta.url), 'utf8'),
) as WorldExtract
it('builds an actual Ventas district with original OSM identities and no circuit overlay', () => {
  const d = createRealWorld(data)
  expect(d.geography!.latitude).toBe(IRUN_VENTAS.latitude)
  expect(d.entities.filter((e) => e.parentId === 'world-buildings').length).toBeGreaterThan(300)
  expect(d.entities.some((e) => e.source?.id === 'way/111813719' && e.name === 'Irurzunzar')).toBe(
    true,
  )
  expect(d.entities.some((e) => e.surface?.url.includes('agency-ground'))).toBe(false)
  expect(terrainHeight(data.terrain, 0, 0)).toBe(0)
  const editor = new SceneEditor(d),
    building = d.entities.find((e) => e.parentId === 'world-buildings')!
  editor.update(building.id, { color: '#123456' })
  const saved = editor.serialize()
  expect(saved.length).toBeLessThan(2_500_000)
  expect(parseScene(JSON.parse(saved)).entities.find((e) => e.id === building.id)!.color).toBe(
    '#123456',
  )
  expect(parseScene(JSON.parse(saved)).entities.find((e) => e.id === building.id)!.source).toEqual(
    building.source,
  )
})
it('matches triangular height interpolation and rejects malformed grids', () => {
  const t = { columns: 2, rows: 2, spacing: 2, heights: [0, 2, 4, 10] }
  expect(terrainHeight(t, 0, 0)).toBe(5)
  expect(terrainHeight(t, -1, 1)).toBe(4)
  expect(() => terrainHeight(t, 2, 0)).toThrow()
  const d = createRealWorld(data)
  d.entities.find((e) => e.terrain)!.terrain!.heights.pop()
  expect(() => parseScene(d)).toThrow('Invalid terrain grid')
})
it('settles the A3 on real elevation, enters it and drives with ground support', () => {
  const s = new Simulation(createRealWorld(data), { playerMode: 'hover' })
  for (let i = 0; i < 120; i++) s.step(1 / 60)
  expect(s.nearestVehicle()).toBe('car-a')
  expect(s.interact()).toContain('Conduciendo')
  const start = s.entityTransform('car-a').position
  s.setInput({ ...idleInput(), forward: 1 })
  for (let i = 0; i < 150; i++) s.step(1 / 60)
  const end = s.entityTransform('car-a').position
  expect(Math.hypot(end[0] - start[0], end[2] - start[2])).toBeGreaterThan(2)
  expect(end[1] - terrainHeight(data.terrain, end[0], end[2])).toBeGreaterThan(0.2)
  expect(end[1] - terrainHeight(data.terrain, end[0], end[2])).toBeLessThan(1)
  s.dispose()
})

it('takes off from the actual district terrain and holds the carrier above it', () => {
  const d = createRealWorld(data),
    ship = d.entities.find((e) => e.id === 'carrier')!
  const spawn = d.entities.find((e) => e.kind === 'spawn')!
  spawn.transform.position = [
    ship.transform.position[0] + 1.85,
    ship.transform.position[1] - 0.7,
    ship.transform.position[2] - 2.8,
  ]
  const s = new Simulation(d, { playerMode: 'hover' })
  for (let i = 0; i < 120; i++) s.step(1 / 60)
  expect(s.nearestVehicle()).toBe('carrier')
  expect(s.interact()).toContain('Nave')
  expect(s.toggleFlight()).toContain('Modo vuelo')
  const before = s.entityTransform('carrier').position[1]
  s.setInput({ ...idleInput(), lift: 0.5 })
  for (let i = 0; i < 480; i++) s.step(1 / 60)
  s.setInput(idleInput())
  for (let i = 0; i < 240; i++) s.step(1 / 60)
  expect(s.entityTransform('carrier').position[1]).toBeGreaterThan(before + 8)
  expect(s.player.speed).toBeLessThan(1)
  s.dispose()
})

it('uses the elevation collider in valleys instead of an invisible globe surface', () => {
  const d = createRealWorld(data)
  d.entities = d.entities.filter((e) => e.terrain || e.kind === 'spawn')
  const s = new Simulation(d)
  for (const [x, z] of [
    [-400, -400],
    [400, 400],
    [200, -300],
  ]) {
    const h = terrainHeight(data.terrain, x, z)
    const hit = s.shoot([x, h + 30, z], [0, -1, 0], 60, 0)
    expect(hit?.entityId).toBe('world-terrain')
    expect(hit!.point[1]).toBeCloseTo(h, 4)
  }
  s.dispose()
})

it('isolates a real degenerate Madrid building instead of rejecting its entire tile', () => {
  const bad = JSON.parse(
    readFileSync(
      new URL('../tests/fixtures/madrid-degenerate-building.json', import.meta.url),
      'utf8',
    ),
  )
  const doc = createRealWorld({
    name: 'Madrid regression',
    origin: { latitude: 40.4168, longitude: -3.7038, altitude: 0 },
    terrain: { columns: 13, rows: 13, spacing: 100, heights: Array(169).fill(0) },
    source: { retrievedAt: '2026-09-21' },
    features: [
      bad,
      {
        id: 'way/999999999',
        tags: { building: 'yes' },
        rings: [
          {
            role: 'outer',
            coordinates: [
              [-3.7038, 40.4168],
              [-3.7036, 40.4168],
              [-3.7036, 40.417],
              [-3.7038, 40.417],
              [-3.7038, 40.4168],
            ],
          },
        ],
      },
    ],
  })
  expect(doc.entities.some((e) => e.terrain)).toBe(true)
  expect(doc.entities.filter((e) => e.kind === 'solid')).toHaveLength(1)
  expect(doc.entities.some((e) => e.source?.id === bad.id)).toBe(false)
  expect(doc.entities.find((e) => e.id === 'world-buildings')!.name).toContain('1 omitidos')
  expect(() => parseScene(doc)).not.toThrow()
})
