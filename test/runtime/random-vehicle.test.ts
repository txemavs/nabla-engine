import { expect, it } from 'vitest'
import { randomRoadVehicle } from '../../src/runtime/random-vehicle.js'

it('uses the 4:3:2:1:1 road-only weights', () => {
  const results = Array.from({ length: 11 }, (_, i) => randomRoadVehicle(() => (i + 0.1) / 11))
  expect(results.map((entry) => entry.vehicle.name)).toEqual([
    ...Array(4).fill(results[0].vehicle.name),
    ...Array(3).fill(results[4].vehicle.name),
    ...Array(3).fill(results[7].vehicle.name),
    results[10].vehicle.name,
  ])
  expect(results.filter((entry) => entry.trailer)).toHaveLength(1)
  expect(results.filter((entry) => entry.vehicle.vehicle!.passive)).toHaveLength(1)
  expect(results.every((entry) => !entry.vehicle.vehicle!.flight)).toBe(true)
})

it('includes every standalone trailer variant', () => {
  const names = [0, 0.4, 0.8].map((variant) => {
    let first = true
    return randomRoadVehicle(() => {
      if (first) {
        first = false
        return 0.99
      }
      return variant
    }).vehicle.name
  })
  expect(new Set(names).size).toBe(3)
})
