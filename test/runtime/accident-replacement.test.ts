import { expect, it } from 'vitest'
import { AccidentReplacement, replacementRoadSpot } from '../../src/runtime/accident-replacement.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'

it('waits two gameplay seconds, emits one random replacement and cancels on reset', () => {
  const choices = ['vfr800', 'car', 'white-truck'].map((id) => [presetVehicle(id, id)])
  const queue = new AccidentReplacement(choices, () => 0.5)
  queue.schedule()
  expect(queue.step(1.9)).toBeNull()
  queue.schedule()
  expect(queue.step(0.1)).toBe(choices[1])
  expect(queue.step(3)).toBeNull()
  queue.schedule()
  queue.clear()
  expect(queue.step(2)).toBeNull()
})

it('projects behind onto a road, aligned with its direction and clear of the wreck', () => {
  const car = presetVehicle('car', 'replacement')
  const roads = [
    {
      width: 8,
      points: [
        { x: 4, z: -100 },
        { x: 4, z: 100 },
      ],
    },
  ]
  const result = replacementRoadSpot([0, 0, 0], 0, car, roads, [
    { position: [4, 0, 12], size: [4, 2, 8] },
  ])!
  expect(result.position[0]).toBe(4)
  expect(result.position[2]).toBeGreaterThan(12)
  expect(Math.abs(result.yaw)).toBeLessThan(1e-6)
  expect(
    replacementRoadSpot(
      [0, 0, 0],
      0,
      car,
      [
        {
          width: 8,
          points: [
            { x: -20, z: -10 },
            { x: 20, z: -10 },
          ],
        },
      ],
      [],
    ),
  ).toBeNull()
})
