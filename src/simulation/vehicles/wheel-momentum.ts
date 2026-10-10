import { Vec3 } from '../physics.js'
import type { WheeledVehicle } from './wheeled/runtime.js'
import { isDriven } from './drivetrain.js'

const spins = new WeakMap<WheeledVehicle, number[]>()

/**
 * Ray-cast wheels have no rotational inertia. Track their free spin separately and give
 * the chassis the opposite angular impulse when drive or brakes change it in the air.
 * Grounded wheels keep the existing tyre forces; a stopped wheel cannot keep pitching
 * the chassis under a held brake. Wheel inertia is estimated from tyre radius and mass.
 */
export function stepWheelMomentum(
  v: WheeledVehicle,
  dt: number,
  active: boolean,
  powered: boolean,
  throttle: number,
): void {
  const wheels = v.raycast.wheelInfos
  const forward = v.body.quaternion.vmult(new Vec3(0, 0, -1))
  const speed = v.body.velocity.dot(forward)
  const spin = spins.get(v) ?? wheels.map((wheel) => speed / wheel.radius)
  spins.set(v, spin)
  const bike = !!v.definition.twoWheeled
  // Approximate rim/tyre assembly: 12 kg on a bike, 22 kg on a road car.
  const wheelMass = bike ? 12 : 22
  let torque = 0
  for (let i = 0; i < wheels.length; i++) {
    const wheel = wheels[i]
    const contact = v.raycast.controller?.wheelIsInContact(i) ?? wheel.isInContact
    if (contact) {
      spin[i] = speed / wheel.radius
      continue
    }
    if (!active || v.drivetrain.parked) continue
    const inertia = 0.7 * wheelMass * wheel.radius ** 2
    const before = spin[i]
    const driven = bike ? i === 1 : isDriven(v.definition.drivenWheels, i)
    const drive = powered && throttle > 0 && driven ? Math.max(0, wheel.engineForce) : 0
    const acceleration = Math.min(250, (drive * wheel.radius) / inertia)
    const tune = v.definition.powertrain
    const ratio = tune
      ? tune.ratios[Math.min(tune.ratios.length - 1, Math.max(0, v.drivetrain.gear - 1))] *
        tune.finalDrive
      : 6
    const limit = ((tune?.maxRpm ?? 6900) * 2 * Math.PI) / (60 * ratio)
    let after = before + acceleration * dt
    // The rev limiter stops adding wheel momentum, rather than removing existing spin.
    if (acceleration > 0) after = Math.min(after, Math.max(before, limit))
    const braking = Math.min(1, Math.max(0, wheel.brake) / v.definition.brakeForce)
    const retention = powered && driven && throttle <= 0 ? 12 : 0
    const deceleration = (braking * 500 + retention) * dt
    after = Math.sign(after) * Math.max(0, Math.abs(after) - deceleration)
    spin[i] = after
    torque += (inertia * (after - before)) / dt
  }
  if (torque !== 0) {
    // Forward wheel spin is about local -X; its reaction raises the nose about +X.
    v.body.applyTorque(v.body.quaternion.vmult(new Vec3(torque, 0, 0)))
  }
}
