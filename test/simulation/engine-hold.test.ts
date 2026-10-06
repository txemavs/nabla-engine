import { describe, expect, it } from 'vitest'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { roadVehicleDefaults } from '../../src/config/simulation.js'
import { createEntity } from '../../src/entity/schema.js'
import { Simulation } from '../../src/simulation/simulation.js'

const dt = 1 / 60
const startSeconds =
  roadVehicleDefaults.ignitionCrankSeconds + roadVehicleDefaults.ignitionSweepSeconds

function flat(): Simulation {
  const floor = createEntity('floor', 'box', [0, -0.5, 0])
  floor.size = [400, 1, 400]
  return new Simulation({
    version: 1,
    name: 'Hold',
    entities: [
      floor,
      createEntity('spawn', 'spawn', [8, 1, 0]),
      presetVehicle('car', 's3', [0, 1.45, 0]),
    ],
  })
}
const run = (sim: Simulation, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / dt); i++) sim.step(dt)
}

describe('engine hold for start sequences', () => {
  it('needs a seated road vehicle', () => {
    const sim = flat()
    expect(sim.holdEngine()).toBe(false)
    expect(sim.startEngine()).toBe(false)
  })

  it('keeps the engine off in P, then runs the normal start-up on request', () => {
    const sim = flat()
    sim.startInVehicle('s3')
    expect(sim.vehicleInfo('s3').ignition).toBe('cranking')
    const count = sim.vehicleInfo('s3').ignitionCount
    expect(sim.holdEngine()).toBe(true)
    run(sim, 1)
    const at = sim.entityTransform('s3').position
    run(sim, startSeconds + 1)
    let info = sim.vehicleInfo('s3')
    expect([info.helm, info.ignition, info.parked]).toEqual(['off', 'running', true])
    expect(info.ignitionCount).toBe(count)
    const now = sim.entityTransform('s3').position
    expect(Math.hypot(now[0] - at[0], now[2] - at[2])).toBeLessThan(0.05)

    expect(sim.startEngine()).toBe(true)
    info = sim.vehicleInfo('s3')
    expect([info.helm, info.ignition, info.ignitionCount]).toEqual(['car', 'cranking', count + 1])
    run(sim, startSeconds + 0.1)
    info = sim.vehicleInfo('s3')
    expect([info.ignition, info.parked]).toEqual(['running', true])
  })
})
