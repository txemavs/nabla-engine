import { expect, it } from 'vitest'
import { Body, RaycastResult, Vec3, World } from 'cannon-es'
import { createRealWorld, IRUN_VENTAS } from './real-world.js'
import { Simulation } from './simulation.js'
import { nearestRoadCenterline, roadGeometry } from './draped-road.js'

it('creates a physical bridge whose top matches its visible deck despite group motion none', () => {
  const doc = createRealWorld({
    name: 'bridge',
    origin: IRUN_VENTAS,
    terrain: { columns: 13, rows: 13, spacing: 100, heights: Array(169).fill(0) },
    source: { retrievedAt: 'review' },
    features: [
      {
        id: 'way/1',
        tags: { highway: 'primary', bridge: 'yes' },
        rings: [
          {
            role: 'outer',
            coordinates: [
              [-1.821, 43.32969],
              [-1.818, 43.32969],
            ],
          },
        ],
      },
    ],
  })
  const road = doc.entities.find((e) => e.road)!
  expect(road.motion).toBe('none')
  expect(road.road!.profiled).toBe(true)
  const paths = road.road!.paths
  expect(paths[0][0][1]).toBeCloseTo(0)
  expect(paths.at(-1)!.at(-1)![1]).toBeCloseTo(0)
  const sim = new Simulation(doc)
  try {
    const body = (sim as unknown as { bodies: Map<string, Body> }).bodies.get(road.id)
    expect(body).toBeDefined()
    const hit = new RaycastResult()
    ;(sim as unknown as { world: World }).world.raycastClosest(
      new Vec3(0, 30, 0),
      new Vec3(0, -10, 0),
      {},
      hit,
    )
    expect(hit.body).toBe(body)
    expect(hit.hitPointWorld.y).toBeCloseTo(5.035, 3)
  } finally {
    sim.dispose()
  }
})
it('shares deck edges across sloping segments and bends', () => {
  const t = { columns: 3, rows: 3, spacing: 10, heights: [0, 10, 20, 0, 10, 20, 0, 10, 20] }
  const g = roadGeometry(
    t,
    [
      [
        [-10, 0, 0],
        [0, 0, 0],
        [10, 0, 0],
      ],
    ],
    4,
    { elevation: 'bridge' },
  )
  const join = g.vertices.filter((v) => v[0] === 0 && Math.abs(v[2]) === 2)
  expect(join).toHaveLength(4)
  expect(new Set(join.map((v) => v[1])).size).toBe(1)
  const bend = roadGeometry(
    t,
    [
      [
        [-10, 0, 0],
        [0, 5, 0],
        [0, 10, 10],
      ],
    ],
    4,
    { elevation: 'bridge', profiled: true },
  )
  expect(bend.vertices[2]).toEqual(bend.vertices[5])
  expect(bend.vertices[3]).toEqual(bend.vertices[4])
})
it('does not pull a vehicle toward a road on a different level', () => {
  expect(
    nearestRoadCenterline(
      [0, 20, 5],
      [
        {
          paths: [
            [
              [-10, 0, 0],
              [10, 0, 0],
            ],
          ],
          width: 6,
        },
      ],
      20,
      3,
    ),
  ).toBeNull()
})
