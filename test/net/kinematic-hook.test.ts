import { describe, expect, it } from 'vitest'
import { Simulation } from '../../src/simulation/simulation.js'
import { createEntity } from '../../src/entity/schema.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { RemoteVehicle } from '../../src/net/index.js'

const scene = () => ({
  version: 1 as const,
  name: 'Kinematic mirror',
  entities: [
    {
      ...createEntity('ground', 'box', [0, -0.5, 0]),
      size: [200, 1, 200] as [number, number, number],
    },
    createEntity('spawn', 'spawn', [0, 1, 0]),
  ],
})

describe('Simulation kinematic hooks', () => {
  it('drives a vehicle body along network poses without gravity or local forces', () => {
    const sim = new Simulation(scene(), { playerMode: 'walk' })
    sim.addVehicles([presetVehicle('car', 'mirror', [0, 3, -10])])
    const remote = new RemoteVehicle('mirror', sim)
    for (let i = 0; i <= 40; i++)
      remote.push(
        i * 50,
        {
          position: [i * 0.5, 3, -10],
          rotation: [0, 0, 0, 1],
          velocity: [10, 0, 0],
          angularVelocity: [0, 0, 0],
        },
        i * 50,
      )
    for (let frame = 1; frame <= 60; frame++) {
      remote.update(1000 + frame * (1000 / 60))
      sim.step(1 / 60)
    }
    const { position } = sim.entityTransform('mirror')
    // Hovers at the networked height (no gravity) and follows x with a 100 ms delay.
    expect(position[1]).toBeCloseTo(3, 1)
    expect(position[0]).toBeCloseTo(19, 0)
    remote.release()
    for (let i = 0; i < 120; i++) sim.step(1 / 60)
    expect(sim.entityTransform('mirror').position[1]).toBeLessThan(2.5)
    sim.dispose()
  })
  it('refuses unknown ids and the controlled vehicle', () => {
    const sim = new Simulation(scene(), { playerMode: 'walk' })
    sim.addVehicles([presetVehicle('car', 'mine', [0, 1, -4])])
    expect(sim.setEntityKinematic('nope', true)).toBe(false)
    sim.interact()
    expect(sim.setEntityKinematic('mine', true)).toBe(false)
    expect(sim.moveKinematicEntity('mine', { position: [0, 0, 0], rotation: [0, 0, 0, 1] })).toBe(
      false,
    )
    sim.dispose()
  })
})
