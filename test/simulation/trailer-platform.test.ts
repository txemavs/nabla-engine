import { expect, it } from 'vitest'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import { Simulation } from '../../src/simulation/simulation.js'
import { trailerPlatformTuning } from '../../src/config/gameplay-tuning.js'

it('moves the attached loading plate and retains its hitch', () => {
  const ground = createEntity('ground', 'box', [0, -0.5, 0])
  ground.size = [100, 1, 100]
  const sim = new Simulation(
    {
      version: 1,
      name: 'Platform',
      entities: [ground, createEntity('spawn', 'spawn', [20, 1, 0])],
    },
    { playerMode: 'walk' },
  )
  const truck = presetVehicle('white-truck', 'truck', [0, 1.45, 0])
  const trailer = presetVehicle('white-trailer', 'trailer', [0, 1.45, 7.33], { box: false })
  trailer.vehicle!.tow = {
    vehicleId: 'truck',
    hitch: truck.vehicle!.hitch!,
    anchor: trailer.vehicle!.towAnchor!,
  }
  sim.addVehicles([truck, trailer])
  expect(sim.setTrailerPlatform('truck', false)).toContain('Rampa')
  for (let i = 0; i < 20; i++) sim.step(1 / 60)
  expect(sim.vehicleInfo('trailer').rampAngle).toBeCloseTo(0.105)
  expect(sim.vehicleInfo('trailer').towVehicleId).toBe('truck')
  sim.dispose()
})
it('locks two physical cars onto the tilting car carrier', () => {
  const ground = createEntity('ground', 'box', [0, -0.5, 0])
  ground.size = [100, 1, 100]
  const sim = new Simulation(
    { version: 1, name: 'Cargo', entities: [ground, createEntity('spawn', 'spawn', [20, 1, 0])] },
    { playerMode: 'walk' },
  )
  const truck = presetVehicle('white-truck', 'truck', [0, 1.45, 0])
  const trailer = presetVehicle('white-car-transporter', 'trailer', [0, 1.45, 7.33])
  trailer.vehicle!.tow = {
    vehicleId: 'truck',
    hitch: truck.vehicle!.hitch!,
    anchor: trailer.vehicle!.towAnchor!,
  }
  sim.addVehicles([truck, trailer])
  for (const [i, slot] of trailerPlatformTuning.cargoSlots.entries()) {
    const id = 'cargo-' + i
    sim.addVehicles([presetVehicle('a3', id, [25 + i * 5, 1, 0])])
    sim.mountCargo(id, 'trailer', [...slot])
  }
  expect(sim.cargoCount('trailer')).toBe(2)
  expect(sim.cargoTrailer('truck')).toBe('trailer')
  for (let i = 0; i < 60; i++) sim.step(1 / 60)
  expect(sim.cargoCount('trailer')).toBe(2)
  const heights = trailerPlatformTuning.cargoSlots.map(
    (_, i) => sim.entityTransform('cargo-' + i).position[1],
  )
  expect(heights[1] - heights[0]).toBeCloseTo(0, 1)
  expect(sim.setTrailerPlatform('trailer', false)).toContain('Rampa')
  expect(sim.cargoCount('trailer')).toBe(0)
  sim.dispose()
})
