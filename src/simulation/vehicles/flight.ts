import { Body, Vec3, Quaternion } from '../physics.js'
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
export interface FlightState {
  altitude: number
  yaw: number
}
export interface FlightRuntime {
  body: Body
  flight: FlightState | null
  helm: 'off' | 'auto' | 'car' | 'drone' | 'plane' | 'space'
  definition: { plane?: boolean }
  /** Compatibility cruise setting, km/h. */
  cruiseSpeed: number
}
export interface FlightInput {
  forward: number
  right: number
  brake: boolean
  lift?: number
  turn?: number
  sprint?: boolean
}
export interface FlightEnvironment {
  height: number
  up: Vec3
  tangent: Quaternion
  minimumAltitude: number
  planetary: boolean
  /** Other rigidly docked bodies. The host owns joints and stepping. */
  cargo?: readonly Body[]
}
export function createFlight(body: Body, altitude: number, plane = false): FlightRuntime {
  const forward = body.quaternion.vmult(new Vec3(0, 0, -1))
  return {
    body,
    flight: { altitude, yaw: Math.atan2(-forward.x, -forward.z) },
    helm: plane ? 'plane' : 'drone',
    definition: { plane },
    cruiseSpeed: 300,
  }
}
/** Accumulates forces only: the host steps its single shared physics world. */
export function stepFlight(
  v: FlightRuntime,
  input: FlightInput,
  environment: FlightEnvironment,
  dt: number,
  active = true,
): void {
  if (!Number.isFinite(dt) || dt < 0) throw new RangeError('Invalid flight step')
  if (!v.flight || dt === 0) return
  const flight = v.flight!,
    body = v.body
  const inv = body.raw?.invPrincipalInertiaSqrt()
  if (!inv || inv.x === 0) body.applyInertia()
  const helm = v.helm
  const auto = helm === 'auto'
  const hands = active && !auto
  const space = helm === 'space'
  const height = environment.height,
    radial = environment.up
  const lift = hands ? (space ? (height < 80000 ? 1 : (input.lift ?? 0)) : (input.lift ?? 0)) : 0
  const turn = active ? (input.turn ?? 0) : 0
  const forward = hands && !input.brake ? (space ? 1 : input.forward) : 0
  const right = hands && !input.brake ? input.right : 0
  // Shift still scales travel with altitude. Plain climb is the container's own vertical rate.
  const travelSpeed =
    (space || (active && input.sprint)) && environment.planetary
      ? Math.min(2000000, Math.max(30, height * 0.8))
      : 3
  const climb = Math.abs(lift) > 0 && travelSpeed <= 3 ? 100 : travelSpeed
  const lead = Math.max(1.5, climb * 0.8)
  if (helm !== 'plane')
    flight.altitude = clamp(
      flight.altitude + lift * climb * dt,
      Math.max(environment.minimumAltitude, height - lead),
      height + lead,
    )
  if (helm === 'plane' && v.definition.plane) flight.yaw -= turn * 0.9 * dt
  else flight.yaw -= turn * 1.2 * dt
  const tangent = environment.tangent
  const heading = tangent.mult(new Quaternion().setFromAxisAngle(new Vec3(0, 1, 0), flight.yaw))
  const pitchAngle = space
    ? height < 80000
      ? -1.05
      : -0.15
    : helm === 'plane'
      ? -forward * (v.definition.plane ? 0.55 : 0.9)
      : -forward * 0.35
  const pitch = new Quaternion().setFromAxisAngle(new Vec3(1, 0, 0), pitchAngle)
  const roll = new Quaternion().setFromAxisAngle(
    new Vec3(0, 0, 1),
    -right * (helm === 'plane' && v.definition.plane ? 0.62 : 0.35),
  )
  const desired = heading.mult(pitch).mult(roll)
  const error = body.quaternion.inverse().mult(desired)
  const sign = error.w < 0 ? -1 : 1
  const rate = body.vectorToLocalFrame(body.angularVelocity)
  const torque = new Vec3(
    body.inertia.x * (error.x * sign * 24 - rate.x * 7),
    body.inertia.y * (error.y * sign * 24 - rate.y * 7),
    body.inertia.z * (error.z * sign * 24 - rate.z * 7),
  )
  body.torque.vadd(body.vectorToWorldFrame(torque), body.torque)
  if (helm === 'plane') {
    const nose = body.quaternion.vmult(new Vec3(0, 0, -1))
    const along = body.velocity.dot(nose)
    const air = Math.max(0, along)
    if (v.definition.plane) {
      const wing = body.quaternion.vmult(new Vec3(0, 1, 0))
      const wings = clamp(air / 28, 0, 1)
      const thrust = lift > 0 ? clamp(68 - along, 0, 8) : 0
      const drag = 0.0011 * along * Math.abs(along)
      const flightDir = body.velocity.length() > 4 ? body.velocity.clone().normalize() : nose
      // Nose above the flight path is positive. The old sign rewarded diving.
      const aoa = clamp(-wing.dot(flightDir), -0.45, 0.5)
      const liftAccel = 9.81 * wings * clamp(1 + aoa * 2.4, 0, 1.65)
      body.applyForce(
        wing
          .scale(liftAccel)
          .vadd(nose.scale(thrust - drag))
          .scale(body.mass),
      )
    } else {
      const wings = clamp(air / 42, 0, 1)
      const push = lift > 0 ? clamp(680 - along, 0, 80) : lift < 0 ? clamp(-40 - along, -80, 0) : 0
      body.applyForce(
        radial
          .scale(9.81 * wings)
          .vadd(nose.scale(push))
          .scale(body.mass),
      )
    }
    body.wakeUp()
    return
  }
  const verticalSpeed = body.velocity.dot(radial)
  const accelCap = Math.max(
    6,
    travelSpeed * 4,
    Math.abs(lift) > 0 && travelSpeed <= 3 ? 50 : 0,
    Math.abs(verticalSpeed) * 4,
  )
  const acceleration = clamp(
    (flight.altitude - height) * 5 - verticalSpeed * 4,
    -accelCap,
    accelCap,
  )
  // Distribute assisted lift over the rigid assembly: same net force/moment at its
  // combined centre of mass, without forcing the solver to transmit cruise-scale impulses.
  const accelerationVector = radial.scale(9.81 + acceleration)
  const direction = new Vec3(right, 0, -forward)
  if (direction.length() > 1) direction.normalize()
  const pace = space ? travelSpeed : v.cruiseSpeed / 3.6
  const target = heading.vmult(direction).scale(pace) // Includes diagonal input.
  const horizontal = body.velocity.vsub(radial.scale(verticalSpeed))
  const drive = target.vsub(horizontal).scale(1.8)
  // Compensate body drag so cruise speed reaches the commanded speed.
  if (forward || right) drive.vadd(horizontal.scale(-Math.log(1 - body.linearDamping)), drive)
  const maximum = space ? travelSpeed : forward || right ? 60 : 90
  if (drive.length() > maximum) drive.scale(maximum / drive.length(), drive)
  const assistedBodies = new Set([body, ...(environment.cargo ?? [])])
  for (const assisted of assistedBodies) {
    assisted.applyForce(accelerationVector.vadd(drive).scale(assisted.mass))
  }
  body.wakeUp()
}
