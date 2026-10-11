import { expect, it } from 'vitest'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import type { Vehicle } from '../../src/entity/vehicle/vehicle.js'
import { parseScene } from '../../src/scene/document.js'
import { Vec3 } from '../../src/simulation/physics.js'
import { Simulation, idleInput } from '../../src/simulation/simulation.js'
import { finishStartUp } from '../start-up.js'

it.each(['vfr800', 'a3'])(
  '%s can adjust a jump with throttle and brakes without air propulsion',
  (preset) => {
    const run = (forward: number) => {
      const floor = createEntity('floor', 'box', [0, -0.5, 0])
      floor.size = [1000, 1, 1000]
      const s = new Simulation(
        parseScene({
          version: 1,
          name: 'Jump',
          entities: [
            floor,
            presetVehicle(preset, 'vehicle', [0, 0.7, 0]),
            createEntity('spawn', 'spawn', [3, 1, 4]),
          ],
        }),
      )
      try {
        for (let i = 0; i < 60; i++) s.step(1 / 60)
        s.startInVehicle('vehicle')
        finishStartUp(s)
        const v = (s as unknown as { vehicles: Map<string, Vehicle> }).vehicles.get('vehicle')!
        v.drivetrain.parked = false
        v.drivetrain.gear = 2
        // Seed rolling wheel momentum before leaving the ground at 72 km/h.
        for (let i = 0; i < 3; i++) {
          v.body.velocity.set(0, 0, -20)
          if (v.twoWheeled) v.twoWheeled.previousVelocity = null
          s.step(1 / 60)
        }
        v.body.position.set(0, 10, 0)
        v.body.quaternion.set(0, 0, 0, 1)
        v.body.velocity.set(0, 0, -20)
        v.body.angularVelocity.set(0, 0, 0)
        if (v.twoWheeled) {
          v.twoWheeled.crashed = false
          v.twoWheeled.fallen = false
          v.twoWheeled.previousSpeed = 20
          v.twoWheeled.previousVelocity = null
        }
        // Refresh contacts after take-off before applying either command.
        s.step(1 / 60)
        s.setInput({ ...idleInput(), forward })
        for (let i = 0; i < 24; i++) s.step(1 / 60)
        return { nose: v.body.quaternion.vmult(new Vec3(0, 0, -1)).y, z: v.body.position.z }
      } finally {
        s.dispose()
      }
    }
    const coast = run(0),
      accelerate = run(1),
      brake = run(-1)
    expect(accelerate.nose).toBeGreaterThan(coast.nose + 0.005)
    expect(brake.nose).toBeLessThan(coast.nose - 0.005)
    expect(Math.abs(accelerate.z - coast.z)).toBeLessThan(0.03)
    expect(Math.abs(brake.z - coast.z)).toBeLessThan(0.03)
  },
)
