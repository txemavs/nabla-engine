import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import { Simulation } from '../../src/simulation/simulation.js'

const scene = () => ({
  version: 1 as const,
  name: 'Hitch',
  entities: [
    createEntity('ground', 'box', [0, -0.5, 0]),
    createEntity('spawn', 'spawn', [-4, 1, 0]),
  ].map((e) => (e.id === 'ground' ? { ...e, size: [200, 1, 200] as [number, number, number] } : e)),
})

function hitchError(
  sim: Simulation,
  tractorId: string,
  trailerId: string,
  hitch: number[],
  anchor: number[],
) {
  const point = (id: string, local: number[]) => {
    const pose = sim.entityTransform(id)
    return new Vector3(...local)
      .applyQuaternion(new Quaternion(...pose.rotation))
      .add(new Vector3(...pose.position))
  }
  return point(tractorId, hitch).distanceTo(point(trailerId, anchor))
}

describe('Simulation hitch / unhitch', () => {
  it('couples a nearby free trailer and retracts its landing legs', () => {
    const sim = new Simulation(scene(), { playerMode: 'walk' })
    const tractor = presetVehicle('white-truck', 'tractor', [0, 1.45, 0])
    const trailer = presetVehicle('white-trailer', 'trailer', [0, 1.45, 7.33])
    sim.addVehicles([tractor, trailer])
    expect(sim.vehicleInfo('trailer').landingGear).toBe(true)
    expect(sim.vehicleInfo('trailer').towVehicleId).toBeNull()
    expect(sim.hitchTrailer('tractor', 'trailer')).toBe('trailer')
    expect(sim.vehicleInfo('trailer').towVehicleId).toBe('tractor')
    expect(sim.vehicleInfo('trailer').landingGear).toBe(false)
    expect(
      hitchError(sim, 'tractor', 'trailer', tractor.vehicle!.hitch!, trailer.vehicle!.towAnchor!),
    ).toBeLessThan(0.05)
    for (let i = 0; i < 120; i++) sim.step(1 / 60)
    expect(sim.vehicleInfo('trailer').towVehicleId).toBe('tractor')
    expect(
      hitchError(sim, 'tractor', 'trailer', tractor.vehicle!.hitch!, trailer.vehicle!.towAnchor!),
    ).toBeLessThan(0.15)
    sim.dispose()
  })

  it('uncouples and puts the trailer back on its legs', () => {
    const sim = new Simulation(scene(), { playerMode: 'walk' })
    const tractor = presetVehicle('white-truck', 'tractor', [0, 1.45, 0])
    const trailer = presetVehicle('white-trailer', 'trailer', [0, 1.45, 7.33])
    trailer.vehicle!.tow = {
      vehicleId: tractor.id,
      hitch: tractor.vehicle!.hitch!,
      anchor: trailer.vehicle!.towAnchor!,
    }
    sim.addVehicles([tractor, trailer])
    expect(sim.vehicleInfo('trailer').towVehicleId).toBe('tractor')
    expect(sim.unhitchTrailer('trailer')).toEqual(['trailer'])
    expect(sim.vehicleInfo('trailer').towVehicleId).toBeNull()
    expect(sim.vehicleInfo('trailer').landingGear).toBe(true)
    for (let i = 0; i < 180; i++) sim.step(1 / 60)
    expect(sim.entityTransform('trailer').position[1]).toBeGreaterThan(0.9)
    sim.dispose()
  })

  it('toggles hitch from the occupied tractor', () => {
    const sim = new Simulation(scene(), { playerMode: 'walk' })
    sim.addVehicles([
      presetVehicle('white-truck', 'tractor', [0, 1.45, 0]),
      presetVehicle('white-trailer', 'trailer', [0, 1.45, 7.33]),
    ])
    sim.startInVehicle('tractor')
    expect(sim.toggleHitch()).toBe('Remolque enganchado')
    expect(sim.vehicleInfo('trailer').towVehicleId).toBe('tractor')
    expect(sim.toggleHitch()).toBe('Remolque suelto')
    expect(sim.vehicleInfo('trailer').towVehicleId).toBeNull()
    expect(sim.vehicleInfo('trailer').landingGear).toBe(true)
    sim.dispose()
  })

  it('keeps a batch-spawned tow joint (host tow:true path)', () => {
    const sim = new Simulation(scene(), { playerMode: 'walk' })
    const tractor = presetVehicle('white-truck', 'tractor', [0, 1.45, -4])
    const trailer = presetVehicle('white-trailer', 'trailer', [0, 1.45, 3.33])
    trailer.vehicle!.tow = {
      vehicleId: tractor.id,
      hitch: tractor.vehicle!.hitch!,
      anchor: trailer.vehicle!.towAnchor!,
    }
    sim.addVehicles([tractor, trailer])
    expect(sim.vehicleInfo('trailer').towVehicleId).toBe('tractor')
    expect(sim.vehicleInfo('trailer').landingGear).toBe(false)
    sim.dispose()
  })
})
