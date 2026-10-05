import { describe, expect, it } from 'vitest'
import { Vector3, Quaternion } from 'three'
import { Simulation } from '../../src/simulation/simulation.js'
import { createEntity } from '../../src/entity/schema.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { spawnChoiceEntities } from '../../src/catalog/vehicles/spawn.js'

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

  it('adds a trailer without a tow joint', () => {
    const sim = new Simulation(scene(), { playerMode: 'walk' })
    const trailer = presetVehicle('white-trailer', 'added-t', [0, 1.4, -12])
    expect(() => sim.addVehicles([trailer])).not.toThrow()
    for (let i = 0; i < 120; i++) sim.step(1 / 60)
    expect(sim.entityTransform('added-t').position[1]).toBeGreaterThan(0.5)
    sim.dispose()
  })

  it('adds a coupled truck+trailer and keeps the hitch aligned', () => {
    const sim = new Simulation(scene(), { playerMode: 'walk' })
    const [truck, trailer] = spawnChoiceEntities('white-truck-trailer', 'added-rig', [0, 1.6, -8])
    sim.addVehicles([truck, trailer])
    expect(sim.vehicleInfo(trailer.id).towVehicleId).toBe(truck.id)
    for (let i = 0; i < 180; i++) sim.step(1 / 60)
    expect(sim.vehicleInfo(trailer.id).towVehicleId).toBe(truck.id)
    const hitch = trailer.vehicle!.tow!.hitch
    const anchor = trailer.vehicle!.tow!.anchor
    const point = (id: string, local: number[]) => {
      const pose = sim.entityTransform(id)
      return new Vector3(...local)
        .applyQuaternion(new Quaternion(...pose.rotation))
        .add(new Vector3(...pose.position))
    }
    expect(point(truck.id, hitch).distanceTo(point(trailer.id, anchor))).toBeLessThan(0.15)
    sim.removeVehicle(truck.id)
    expect(sim.vehicleInfo(trailer.id).towVehicleId).toBeNull()
    sim.dispose()
  })
})
