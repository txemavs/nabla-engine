import { expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { Simulation, idleInput } from './simulation.js'
import { createEntity, type SceneDocument } from './scene.js'
import { createA3 } from './presets.js'

function scene(): SceneDocument {
  return {
    version: 1,
    name: 'Render interpolation',
    entities: [
      { ...createEntity('floor', 'box', [0, -0.5, 0]), size: [100, 1, 100] },
      createEntity('spawn', 'spawn', [2, 0.05, 3]),
      createA3('car', [0, 0.62, 3]),
    ],
  }
}
it('renders continuous walking at 144 Hz between 60 Hz physics ticks', () => {
  const sim = new Simulation(scene())
  sim.setInput({ ...idleInput(), forward: 1 })
  for (let i = 0; i < 120; i++) sim.step(1 / 60)
  const distances: number[] = []
  let previous = sim.renderPlayerPosition[2]
  for (let i = 0; i < 144; i++) {
    sim.step(1 / 144)
    const next = sim.renderPlayerPosition[2]
    distances.push(previous - next)
    previous = next
  }
  expect(Math.min(...distances)).toBeGreaterThan(0.005)
  expect(Math.max(...distances) / Math.min(...distances)).toBeLessThan(1.05)
  sim.dispose()
})
it('keeps the cockpit anchor rigidly attached to the displayed chassis', () => {
  const doc = scene(),
    sim = new Simulation(doc)
  for (let i = 0; i < 120; i++) sim.step(1 / 60)
  sim.interact()
  expect(sim.player.vehicleId).toBe('car')
  sim.setInput({ ...idleInput(), forward: 1, right: 0.3 })
  for (let i = 0; i < 240; i++) {
    sim.step(1 / 144)
    const pose = sim.entityTransform('car', true)
    const expected = new Vector3(...doc.entities.find((e) => e.id === 'car')!.vehicle!.driver)
      .applyQuaternion(new Quaternion(...pose.rotation))
      .add(new Vector3(...pose.position))
    expect(expected.distanceTo(new Vector3(...sim.vehicleInfo('car', true).driver))).toBeLessThan(
      1e-10,
    )
    expect(
      new Vector3(...sim.renderPlayerPosition).distanceTo(new Vector3(...pose.position)),
    ).toBeLessThan(1e-10)
  }
  sim.dispose()
})
