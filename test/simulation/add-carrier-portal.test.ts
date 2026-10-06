import { describe, expect, it } from 'vitest'
import { Simulation } from '../../src/simulation/simulation.js'
import { createEntity } from '../../src/entity/schema.js'
import { createPortal } from '../../src/entity/portal/portal.js'
import { presetEntities, presetVehicle } from '../../src/catalog/vehicles/library.js'

const scene = () => ({
  version: 1 as const,
  name: 'Late carrier',
  entities: [
    {
      ...createEntity('ground', 'box', [0, -0.5, 0]),
      size: [200, 1, 200] as [number, number, number],
    },
    createEntity('spawn', 'spawn', [0, 1, 0]),
    createPortal('gate', [30, 1.455, 0]),
  ],
})
const advance = (sim: Simulation, n = 150) => {
  for (let i = 0; i < n; i++) sim.step(1 / 60)
}

describe('Simulation.addVehicles with hosted portal mouths', () => {
  it('installs a late carrier with its stern portal, which can be linked and is removed with it', () => {
    const sim = new Simulation(scene(), { playerMode: 'walk' })
    advance(sim, 10)
    const added = presetEntities('carrier', 'late-ship', [0, 1.2, -20])
    expect(added.map((e) => e.id)).toEqual(['late-ship', 'late-ship-stern'])
    sim.addVehicles(added)
    expect(sim.portalState('late-ship-stern')).toMatchObject({ pairId: null, mode: 'closed' })
    sim.setGarageDoor('late-ship', true)
    advance(sim, 240)
    expect(sim.vehicleInfo('late-ship').rampClosed).toBe(true)
    sim.configurePortal('late-ship-stern', 'gate', 'window')
    expect(sim.portalState('gate')).toMatchObject({ pairId: 'late-ship-stern', mode: 'window' })
    sim.removeVehicle('late-ship')
    // The partner is unlinked, not left pointing at a removed mouth.
    expect(sim.portalState('gate')).toMatchObject({ pairId: null, mode: 'closed' })
    expect(() => sim.portalState('late-ship-stern')).toThrow(/Unknown portal/)
    advance(sim, 10)
    // The ids are free again.
    sim.addVehicles(presetEntities('carrier', 'late-ship', [0, 1.2, -20]))
    expect(sim.portalState('late-ship-stern').mode).toBe('closed')
    sim.dispose()
  })

  it('rejects orphan, linked or open mouths before installing anything', () => {
    const sim = new Simulation(scene(), { playerMode: 'walk' })
    const [ship, stern] = presetEntities('carrier', 'ship', [0, 1.2, -20])
    expect(() => sim.addVehicles([stern])).toThrow(/hosted by a vehicle in the same batch/)
    expect(() =>
      sim.addVehicles([ship, { ...stern, portal: { ...stern.portal!, pairId: 'gate' } }]),
    ).toThrow(/unlinked and closed/)
    expect(() =>
      sim.addVehicles([ship, { ...stern, portal: { ...stern.portal!, mode: 'window' } }]),
    ).toThrow(/unlinked and closed/)
    expect(() => sim.addVehicles([presetVehicle('car', 'car-1', [0, 1, -8]), stern])).toThrow(
      /hosted by a vehicle in the same batch/,
    )
    expect(sim.vehicleSpec('ship')).toBeNull()
    expect(sim.vehicleSpec('car-1')).toBeNull()
    sim.dispose()
  })
})
