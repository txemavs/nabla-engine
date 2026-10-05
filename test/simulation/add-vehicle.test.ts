import { describe, expect, it } from 'vitest'
import { Simulation } from '../../src/simulation/simulation.js'
import { createEntity } from '../../src/entity/schema.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'

const scene = () => ({
  version: 1 as const,
  name: 'Add vehicle',
  entities: [
    createEntity('ground', 'box', [0, -0.5, 0]),
    createEntity('spawn', 'spawn', [0, 1, 0]),
  ].map((e) => (e.id === 'ground' ? { ...e, size: [200, 1, 200] as [number, number, number] } : e)),
})

describe('Simulation.addVehicles / removeVehicle', () => {
  it('adds a truck to a running simulation that settles on the ground and can be boarded', () => {
    const sim = new Simulation(scene(), { playerMode: 'walk' })
    for (let i = 0; i < 30; i++) sim.step(1 / 60)
    const truck = presetVehicle('white-truck', 'added-1', [0, 1.6, -5])
    sim.addVehicles([truck])
    for (let i = 0; i < 240; i++) sim.step(1 / 60)
    const y = sim.entityTransform('added-1').position[1]
    // Rests at its ride height instead of falling through or hovering.
    expect(y).toBeGreaterThan(0.8)
    expect(y).toBeLessThan(2.2)
    expect(sim.nearestVehicle()).toBe('added-1')
    sim.interact()
    expect(sim.player.vehicleId).toBe('added-1')
    sim.dispose()
  })

  it('removes an added vehicle, refuses while the player is inside, and frees the id', () => {
    const sim = new Simulation(scene(), { playerMode: 'walk' })
    sim.addVehicles([presetVehicle('car', 'added-1', [0, 1, -4])])
    sim.interact()
    expect(sim.player.vehicleId).toBe('added-1')
    expect(() => sim.removeVehicle('added-1')).toThrow(/Leave the vehicle/)
    sim.interact()
    expect(sim.player.vehicleId).toBeNull()
    sim.removeVehicle('added-1')
    expect(sim.nearestVehicle()).toBeNull()
    expect(() => sim.removeVehicle('added-1')).toThrow(/No vehicle/)
    // The step loop no longer sees it, and the id can be used again.
    for (let i = 0; i < 20; i++) sim.step(1 / 60)
    sim.addVehicles([presetVehicle('car', 'added-1', [0, 1, -4])])
    expect(sim.nearestVehicle()).toBe('added-1')
    sim.dispose()
  })

  it('rejects ids in use, non-vehicles and portals', () => {
    const sim = new Simulation(scene(), { playerMode: 'walk' })
    sim.addVehicles([presetVehicle('car', 'added-1', [0, 1, -4])])
    expect(() => sim.addVehicles([presetVehicle('car', 'added-1', [0, 1, -9])])).toThrow(/in use/)
    expect(() => sim.addVehicles([createEntity('box-1', 'box', [0, 1, -9])])).toThrow(
      /not a plain vehicle/,
    )
    sim.dispose()
  })

  it('adds a trailer without a tow joint and keeps it on landing legs', () => {
    const sim = new Simulation(scene(), { playerMode: 'walk' })
    const trailer = presetVehicle('white-trailer', 'added-t', [0, 1.4, -12])
    expect(() => sim.addVehicles([trailer])).not.toThrow()
    for (let i = 0; i < 120; i++) sim.step(1 / 60)
    expect(sim.entityTransform('added-t').position[1]).toBeGreaterThan(0.5)
    expect(sim.vehicleInfo('added-t').landingGear).toBe(true)
    expect(sim.vehicleInfo('added-t').towVehicleId).toBeNull()
    sim.dispose()
  })

  it('keeps a hitch when the tractor is in the same addVehicles batch', () => {
    const sim = new Simulation(scene(), { playerMode: 'walk' })
    const truck = presetVehicle('white-truck', 'rig-truck', [0, 1.6, -8])
    const trailer = presetVehicle('white-trailer', 'rig-trailer', [0, 1.6, -0.67])
    trailer.vehicle!.tow = {
      vehicleId: truck.id,
      hitch: truck.vehicle!.hitch!,
      anchor: trailer.vehicle!.towAnchor!,
    }
    sim.addVehicles([truck, trailer])
    expect(sim.vehicleInfo('rig-trailer').towVehicleId).toBe('rig-truck')
    expect(sim.vehicleInfo('rig-trailer').landingGear).toBe(false)
    sim.removeVehicle('rig-truck')
    expect(sim.vehicleInfo('rig-trailer').towVehicleId).toBeNull()
    expect(sim.vehicleInfo('rig-trailer').landingGear).toBe(true)
    sim.dispose()
  })
})
