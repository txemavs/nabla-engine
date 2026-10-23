import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Vector3 } from 'three'
import {
  NavigationPlaceLookup,
  nearestStreet,
  setNavigationPlaces,
  setNavigationRoads,
  type NavigationRoad,
} from '../../src/render/entity/navigation-places.js'

function road(
  name: string,
  pts: [number, number][],
  width = 8,
  carriageway = true,
): NavigationRoad {
  const xs = pts.map((p) => p[0]),
    zs = pts.map((p) => p[1])
  return {
    name,
    width,
    carriageway,
    points: pts.map(([x, z]) => ({ x, z })),
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  } as unknown as NavigationRoad
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  setNavigationPlaces(() => [])
  setNavigationRoads(() => [])
  vi.useRealTimers()
})

async function ask(lookup: NavigationPlaceLookup, pos: number[]) {
  const apply = vi.fn()
  lookup.request(pos, apply)
  await vi.runAllTimersAsync()
  return apply
}

it('matches the linear street scan, including long roads and ties', async () => {
  const roads: NavigationRoad[] = []
  for (let i = 0; i < 40; i++)
    roads.push(
      road(`Calle ${i}`, [
        [i * 50, -500],
        [i * 50, 500],
      ]),
    )
  roads.push(
    road(
      'Autopista',
      [
        [-20000, 3],
        [20000, 3],
      ],
      20,
    ),
  )
  roads.push(
    road(
      'Paseo',
      [
        [0, 3.2],
        [3000, 3.2],
      ],
      6,
      false,
    ),
  )
  roads.push(
    road('', [
      [0, 0],
      [100, 0],
    ]),
  )
  setNavigationRoads(() => roads)
  setNavigationPlaces(() => [])
  for (const pos of [
    [0, 0, 0],
    [25, 0, 3],
    [1210, 0, 4],
    [-15000, 0, 2],
    [7000, 0, 300],
    [990, 0, -480],
  ]) {
    const lookup = new NavigationPlaceLookup()
    const apply = await ask(lookup, pos)
    expect(apply).toHaveBeenCalledWith(expect.any(String), nearestStreet(pos, []) ?? '')
  }
})

it('only re-queries after moving the threshold or after the refresh period', async () => {
  const provider = vi.fn(() => [{ id: 'a', text: 'Zaisa', position: new Vector3() }])
  setNavigationPlaces(provider)
  setNavigationRoads(() => [])
  const lookup = new NavigationPlaceLookup({ minMove: 25, refreshMs: 5000, intervalMs: 500 })
  expect(await ask(lookup, [0, 0, 0])).toHaveBeenCalledWith('Zaisa', '')
  await vi.advanceTimersByTimeAsync(600)
  expect(await ask(lookup, [10, 0, 10])).not.toHaveBeenCalled()
  expect(provider).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(600)
  expect(await ask(lookup, [30, 0, 0])).toHaveBeenCalled()
  expect(provider).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(5000)
  expect(await ask(lookup, [30, 0, 0])).toHaveBeenCalled()
  expect(provider).toHaveBeenCalledTimes(3)
})

it('rebuilds the road index when the road set changes', async () => {
  let roads = [
    road('Vieja', [
      [0, 0],
      [100, 0],
    ]),
  ]
  setNavigationRoads(() => roads)
  setNavigationPlaces(() => [])
  const lookup = new NavigationPlaceLookup({ minMove: 0, intervalMs: 0 })
  expect(await ask(lookup, [50, 0, 0])).toHaveBeenCalledWith(expect.any(String), 'Vieja')
  roads = [
    road('Nueva', [
      [0, 0],
      [100, 0],
    ]),
  ]
  expect(await ask(lookup, [50, 0, 0])).toHaveBeenCalledWith(expect.any(String), 'Nueva')
})
