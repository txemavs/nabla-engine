import { describe, expect, it } from 'vitest'
import { Euler, Quaternion } from 'three'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import { Simulation } from '../../src/simulation/simulation.js'
import {
  hasLandingGear,
  landingGearDeployOffset,
  landingGearFeet,
  trailerWheelContactY,
} from '../../src/simulation/landing-gear.js'

const scene = () => ({
  version: 1 as const,
  name: 'Landing gear',
  entities: [
    createEntity('ground', 'box', [0, -0.5, 0]),
    createEntity('spawn', 'spawn', [0, 1, 0]),
  ].map((e) => (e.id === 'ground' ? { ...e, size: [200, 1, 200] as [number, number, number] } : e)),
})

function tilt(sim: Simulation, id: string) {
  const euler = new Euler().setFromQuaternion(
    new Quaternion(...sim.entityTransform(id).rotation),
    'YXZ',
  )
  return { pitch: euler.x, roll: euler.z, yaw: euler.y }
}

describe('trailer landing gear', () => {
  it('places Stützbein feet on the same plane as the tyres, behind the kingpin', () => {
    const trailer = presetVehicle('white-trailer', 't')
    expect(hasLandingGear(trailer.vehicle!)).toBe(true)
    const contact = trailerWheelContactY(trailer.vehicle!)
    const feet = landingGearFeet(trailer.vehicle!)
    expect(feet).toHaveLength(2)
    expect(feet[0]!.position[0]).toBeCloseTo(-feet[1]!.position[0], 6)
    for (const foot of feet) {
      expect(foot.position[1] - foot.size[1] / 2).toBeCloseTo(contact, 6)
      expect(foot.position[2]).toBeGreaterThan(trailer.vehicle!.towAnchor![2])
      expect(foot.position[2]).toBeLessThan(Math.min(...trailer.vehicle!.hubs.map((h) => h[2])))
    }
    expect(landingGearDeployOffset(-0.8433, contact)).toBeCloseTo(contact + 0.8433, 5)
    expect(landingGearDeployOffset(-0.8433, contact)).toBeLessThan(0)
  })

  it('keeps a free trailer level on its legs instead of pitching onto the kingpin', () => {
    const sim = new Simulation(scene(), { playerMode: 'walk' })
    sim.addVehicles([presetVehicle('white-trailer', 'free', [0, 1.4, -8])])
    expect(sim.vehicleInfo('free').landingGear).toBe(true)
    expect(sim.vehicleInfo('free').towVehicleId).toBeNull()
    for (let i = 0; i < 240; i++) sim.step(1 / 60)
    const pose = sim.entityTransform('free')
    const { pitch, roll } = tilt(sim, 'free')
    expect(Math.abs(pitch)).toBeLessThan(0.08)
    expect(Math.abs(roll)).toBeLessThan(0.08)
    expect(pose.position[1]).toBeGreaterThan(0.9)
    expect(pose.position[1]).toBeLessThan(1.8)
    expect(sim.vehicleInfo('free').landingGear).toBe(true)
    sim.dispose()
  })

  it('retracts legs when the trailer is spawned already hitched', () => {
    const tractor = presetVehicle('white-truck', 'tractor', [0, 1.45, 0])
    const trailer = presetVehicle('white-trailer', 'trailer', [0, 1.45, 7.33])
    trailer.vehicle!.tow = {
      vehicleId: tractor.id,
      hitch: tractor.vehicle!.hitch!,
      anchor: trailer.vehicle!.towAnchor!,
    }
    const sim = new Simulation({
      version: 1,
      name: 'Hitched',
      entities: [
        createEntity('spawn', 'spawn', [-3, 1, 0]),
        { ...createEntity('floor', 'box', [0, -0.5, 0]), size: [200, 1, 200] },
        tractor,
        trailer,
      ],
    })
    expect(sim.vehicleInfo('trailer').landingGear).toBe(false)
    expect(sim.vehicleInfo('trailer').towVehicleId).toBe('tractor')
    for (let i = 0; i < 120; i++) sim.step(1 / 60)
    expect(sim.vehicleInfo('trailer').landingGear).toBe(false)
    sim.dispose()
  })
})
