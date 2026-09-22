import { expect, it } from 'vitest'
import { Body, Box, Vec3, RaycastResult, World } from 'cannon-es'
import { roadGeometry, smoothFloatRoadGeometry } from './draped-road.js'
import { terrainHeight } from './terrain.js'
import { createEntity } from './scene.js'
import { Simulation } from './simulation.js'

it('clears terrain under the interior of every triangle, including a bump between OSM endpoints', () => {
  const t = {
    columns: 9,
    rows: 9,
    spacing: 5,
    heights: Array.from({ length: 81 }, (_, i) => Math.sin(i * 3.1) * 2 + 3),
  }
  t.heights[40] = 12
  const g = smoothFloatRoadGeometry(
    t,
    [
      [
        [-18, 0, 0],
        [18, 0, 0],
      ],
    ],
    6,
  )
  expect(g.faces.length).toBeGreaterThan(2)
  for (const f of g.faces) {
    const [a, b, c] = f.map((i) => g.vertices[i])
    for (let i = 0; i <= 10; i++)
      for (let j = 0; j <= 10 - i; j++) {
        const p = a.map((v, k) => v * (1 - (i + j) / 10) + (b[k] * i) / 10 + (c[k] * j) / 10)
        expect(p[1] - terrainHeight(t, p[0], p[2])).toBeGreaterThanOrEqual(0.1 - 1e-5)
      }
  }
})
it('uses shared sloped edges without raised joint discs and limits grade', () => {
  const t = {
    columns: 7,
    rows: 7,
    spacing: 10,
    heights: Array.from({ length: 49 }, (_, i) => (i % 7) * 2),
  }
  const g = smoothFloatRoadGeometry(
    t,
    [
      [
        [-20, 0, 0],
        [0, 0, 0],
      ],
      [
        [0, 0, 0],
        [20, 0, 0],
      ],
    ],
    4,
  )
  expect(g.vertices).toHaveLength(8 * 4)
  expect(g.faces).toHaveLength(8 * 2)
  for (let i = 0; i < g.vertices.length; i += 4) {
    const [a, b, c, d] = g.vertices.slice(i, i + 4)
    expect(a[1]).toBe(b[1])
    expect(c[1]).toBe(d[1])
    expect(Math.abs(a[1] - d[1]) / Math.hypot(a[0] - d[0], a[2] - d[2])).toBeLessThanOrEqual(
      0.150001,
    )
    if (i + 4 < g.vertices.length) {
      expect(c).toEqual(g.vertices[i + 5])
      expect(d).toEqual(g.vertices[i + 4])
    }
  }
})
it('does not smooth across disconnected pieces or replace bridge/tunnel geometry', () => {
  const t = {
    columns: 7,
    rows: 7,
    spacing: 10,
    heights: Array.from({ length: 49 }, (_, i) => (i < 21 ? 0 : 10)),
  }
  const paths: [number, number, number][][] = [
    [
      [-20, 0, -25],
      [20, 0, -25],
    ],
    [
      [-20, 0, 25],
      [20, 0, 25],
    ],
  ]
  const together = smoothFloatRoadGeometry(t, paths, 4)
  expect(together.vertices.slice(0, 32)).toEqual(smoothFloatRoadGeometry(t, [paths[0]], 4).vertices)
  for (const elevation of ['bridge', 'tunnel'] as const)
    expect(roadGeometry(t, paths, 4, { mode: 'smooth-float', elevation })).toEqual(
      roadGeometry(t, paths, 4, { elevation }),
    )
})
it('matches the physical top to the render surface without a default box, even with buildings disabled', () => {
  const terrain = createEntity('terrain', 'terrain')
  terrain.terrain = { columns: 5, rows: 5, spacing: 10, heights: Array(25).fill(0) }
  const road = createEntity('road', 'group')
  road.road = {
    terrainId: 'terrain',
    width: 4,
    paths: [
      [
        [-15, 0, 0],
        [15, 0, 0],
      ],
    ],
    mode: 'smooth-float',
  }
  const sim = new Simulation(
    {
      version: 1,
      name: 'smooth',
      entities: [terrain, road, createEntity('spawn', 'spawn', [0, 3, 5])],
    },
    { mapBuildingsEnabled: false },
  )
  try {
    const internal = sim as unknown as { bodies: Map<string, Body>; world: World }
    const body = internal.bodies.get('road')!
    expect(body.shapes.some((s) => s instanceof Box)).toBe(false)
    const hit = new RaycastResult()
    internal.world.raycastClosest(new Vec3(0, 3, 0), new Vec3(0, -3, 0), {}, hit)
    expect(hit.body).toBe(body)
    expect(hit.hitPointWorld.y).toBeCloseTo(
      roadGeometry(terrain.terrain, road.road.paths, 4, road.road).vertices[0][1],
      6,
    )
    sim.setMapBuildingsEnabled(true)
    sim.setMapBuildingsEnabled(false)
    expect(body.world).toBe(internal.world)
  } finally {
    sim.dispose()
  }
})

it('drives across a rough DEM on the smooth deck without overturning', () => {
  const terrain = createEntity('terrain', 'terrain')
  terrain.terrain = {
    columns: 5,
    rows: 25,
    spacing: 5,
    heights: Array.from(
      { length: 125 },
      (_, i) => (i % 5) * 0.3 + (Math.floor(i / 5) === 12 ? 2 : 0),
    ),
  }
  const road = createEntity('road', 'group')
  road.road = {
    terrainId: 'terrain',
    width: 6,
    paths: [
      [
        [0, 0, -55],
        [0, 0, 55],
      ],
    ],
    mode: 'smooth-float',
  }
  const car = createEntity('car', 'vehicle', [0, 4, 30])
  const sim = new Simulation({
    version: 1,
    name: 'driving',
    entities: [terrain, road, car, createEntity('spawn', 'spawn', [2, 3, 30])],
  })
  try {
    for (let i = 0; i < 120; i++) sim.step(1 / 60)
    expect(sim.interact()).toContain('Conduciendo')
    sim.setInput({ forward: 1, right: 0, yaw: 0, sprint: false, jump: false, brake: false })
    for (let i = 0; i < 300; i++) sim.step(1 / 60)
    const pose = sim.entityTransform('car')
    expect(pose.position[2]).toBeLessThan(20)
    const up = new Vec3()
    ;(sim as unknown as { bodies: Map<string, Body> }).bodies
      .get('car')!
      .quaternion.vmult(new Vec3(0, 1, 0), up)
    expect(up.y).toBeGreaterThan(0.95)
  } finally {
    sim.dispose()
  }
})
