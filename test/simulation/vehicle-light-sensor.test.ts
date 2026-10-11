import { expect, it } from 'vitest'
import { Simulation } from '../../src/simulation/simulation.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import { Vec3 } from '../../src/simulation/physics.js'
import type { Vehicle } from '../../src/entity/vehicle/vehicle.js'

it('ignores the truck and its hitched trailer but still detects external shade', () => {
  const truck = presetVehicle('white-truck', 'truck', [0, 1.45, 0])
  const trailer = presetVehicle('white-trailer', 'trailer', [0, 1.45, 7.33])
  trailer.vehicle!.tow = {
    vehicleId: truck.id,
    hitch: truck.vehicle!.hitch!,
    anchor: trailer.vehicle!.towAnchor!,
  }
  const sim = new Simulation({
    version: 1,
    name: 'Truck light sensor',
    entities: [truck, trailer, createEntity('spawn', 'spawn', [20, 1, 0])],
  })
  try {
    sim.startInVehicle('truck')
    const vehicles = (sim as unknown as { vehicles: Map<string, Vehicle> }).vehicles
    const own = vehicles.get('truck')!
    const towed = vehicles.get('trailer')!
    const from = own.body
      .pointToWorldFrame(new Vec3(...own.definition.driver))
      .vadd(new Vec3(0, 0.4, 0))
    const at = towed.body.pointToWorldFrame(
      new Vec3(...towed.definition.colliders![0].transform.position),
    )
    const direction = at.vsub(from)
    direction.normalize()
    const ray: [number, number, number] = [direction.x, direction.y, direction.z]
    expect(sim.shoot([from.x, from.y, from.z], ray, 200, 0)?.entityId).toBe('trailer')
    expect(sim.vehicleSunOccluded('truck', ray)).toBe(false)
    expect(sim.vehicleSunOccluded('truck', [0, 1, 0])).toBe(false)
  } finally {
    sim.dispose()
  }

  const roof = createEntity('roof', 'box', [0, 8, 0])
  roof.size = [20, 1, 20]
  const covered = new Simulation({
    version: 1,
    name: 'External shade',
    entities: [truck, roof, createEntity('spawn', 'spawn', [20, 1, 0])],
  })
  try {
    covered.startInVehicle('truck')
    expect(covered.vehicleSunOccluded('truck', [0, 1, 0])).toBe(true)
  } finally {
    covered.dispose()
  }
})
