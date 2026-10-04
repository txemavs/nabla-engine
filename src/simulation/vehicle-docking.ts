/** Garage constraints and containment; vehicle/control selection remains with Simulation. */
import { LockConstraint, Quaternion, Vec3, type World } from './physics.js'
import type { Vehicle } from '../entity/vehicle/vehicle.js'
import type { Vec3Tuple } from '../entity/schema.js'
const vec = (v: Vec3): Vec3Tuple => [v.x, v.y, v.z]
export class VehicleDocking {
  readonly docks = new Map<string, { carrierId: string; constraint: LockConstraint }>()
  /** Borrow world/vehicles; notify the owner when a garage ramp must change. */
  constructor(
    private readonly world: World,
    private readonly vehicles: ReadonlyMap<string, Vehicle>,
    private readonly setRamp: (vehicle: Vehicle, closed: boolean) => void,
  ) {}
  /** Find a stationary garage fully supporting and containing the selected vehicle. */
  candidate(id: string | null): string | null {
    if (!id || this.docks.has(id)) return null
    const car = this.vehicles.get(id)
    if (!car || car.definition.garage) return null
    for (const [carrierId, carrier] of this.vehicles) {
      const bay = carrier.definition.garage
      if (!bay || [...this.docks.values()].some((d) => d.carrierId === carrierId)) continue
      if (
        carrier.body.velocity.length() > 0.8 ||
        car.body.velocity.vsub(carrier.body.velocity).length() > 0.8
      )
        continue
      // Every chassis corner must be inside, and all four suspension rays must rest on this carrier.
      if (
        !car.raycast.wheelInfos.every(
          (w) => w.raycastResult.hasHit && w.raycastResult.body === carrier.body,
        )
      )
        continue
      const contained = car.definition.colliders.every((collider) => {
        const q = new Quaternion(...collider.transform.rotation)
        for (const x of [-1, 1])
          for (const y of [-1, 1])
            for (const z of [-1, 1]) {
              const point = q
                .vmult(
                  new Vec3(
                    (x * collider.size[0]) / 2,
                    (y * collider.size[1]) / 2,
                    (z * collider.size[2]) / 2,
                  ),
                )
                .vadd(new Vec3(...collider.transform.position))
              const local = carrier.body.pointToLocalFrame(car.body.pointToWorldFrame(point))
              if (vec(local).some((n, i) => n < bay.min[i] - 0.05 || n > bay.max[i])) return false
            }
        return true
      })
      if (contained) return carrierId
    }
    return null
  }
  /** Attach/release one car, preserving flight restrictions and raycast ownership. */
  toggle(id: string | null): string {
    if (!id) return 'Entra en el coche para sujetarlo al garaje'
    const car = this.vehicles.get(id)!
    const dock = this.docks.get(id)
    if (dock) {
      if (this.vehicles.get(dock.carrierId)!.flight)
        return 'Aterriza y activa modo tierra antes de soltar el coche'
      if (this.vehicles.get(dock.carrierId)!.body.velocity.length() > 0.8)
        return 'Detén el container para soltar el coche'
      this.setRamp(this.vehicles.get(dock.carrierId)!, false)
      this.world.removeConstraint(dock.constraint)
      this.docks.delete(id)
      car.raycast.addToWorld(this.world)
      car.body.wakeUp()
      return 'Coche libre · sal marcha atrás por la rampa'
    }
    const carrierId = this.candidate(id)
    if (!carrierId) return 'Aparca completamente dentro del garaje y frena'
    const carrier = this.vehicles.get(carrierId)!
    car.raycast.removeFromWorld(this.world)
    this.world.addBody(car.body)
    car.body.velocity.copy(carrier.body.velocity)
    car.body.angularVelocity.copy(carrier.body.angularVelocity)
    const constraint = new LockConstraint(carrier.body, car.body, { maxForce: 1e12 })
    constraint.collideConnected = false
    this.world.addConstraint(constraint)
    this.docks.set(id, { carrierId, constraint })
    this.setRamp(carrier, true)
    return 'A3 sujeto al suelo · T para conducir el container'
  }
  /** Remove owned lock joints before the simulation world is freed. */
  dispose(): void {
    for (const dock of this.docks.values()) this.world.removeConstraint(dock.constraint)
    this.docks.clear()
  }
}
