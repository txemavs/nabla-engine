import type { Vehicle } from '../../entity/vehicle/vehicle.js'
import { Vec3 } from '../physics.js'
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
/** One fixed step of buoyancy, propulsion and hull damping. Depth is relative to the keel. */
export function stepBoat(
  v: Vehicle,
  active: boolean,
  input: { forward: number; right: number; brake: boolean },
  up: Vec3,
  depth: number,
  dt: number,
): void {
  const body = v.body
  const wet = clamp(depth / 0.55, 0, 1.6)
  body.applyForce(up.scale(wet * body.mass * 9.81 * 1.22))
  const vertical = body.velocity.dot(up)
  if (wet > 0) body.applyForce(up.scale(-vertical * body.mass * 2.2))
  const forward = body.quaternion.vmult(new Vec3(0, 0, -1))
  const right = body.quaternion.vmult(new Vec3(1, 0, 0))
  const speed = body.velocity.dot(forward)
  const powered = active && v.helm !== 'off' && wet > 0.12
  const braking = active && input.brake
  const lock = 0.62 / (1 + Math.max(0, speed) / 16)
  const helmTarget = powered && !braking ? -input.right * lock : 0
  v.steer += clamp(helmTarget - v.steer, -dt * 0.28, dt * 0.28)
  const throttle = powered && !braking ? input.forward : 0
  const spool = braking ? 1.4 : throttle === 0 ? 0.35 : 0.55
  v.prop += clamp(throttle - v.prop, -dt * spool, dt * spool)
  const thrust = v.prop * v.definition.engineForce * (v.prop < 0 ? 0.35 : 1) * clamp(wet, 0, 1)
  const motor = body.pointToWorldFrame(new Vec3(0, 0, 2.35))
  body.applyForce(
    body.quaternion.vmult(new Vec3(Math.sin(v.steer) * thrust, 0, -Math.cos(v.steer) * thrust)),
    motor.vsub(body.position),
  )
  if (wet > 0.05) {
    const flatRight = right.vsub(up.scale(right.dot(up)))
    if (flatRight.lengthSquared() > 1e-6) flatRight.normalize()
    const bite = 0.5 + clamp(Math.abs(speed) / 14, 0, 1)
    const hydro = (localZ: number, gain: number) => {
      const at = body.quaternion.vmult(new Vec3(0, -0.15, localZ))
      const vel = new Vec3()
      body.getVelocityAtWorldPoint(body.position.vadd(at), vel)
      body.applyForce(flatRight.scale(-vel.dot(flatRight) * body.mass * gain), at)
    }
    hydro(-2.05, bite * 0.28)
    hydro(1.9, bite * 0.62)
    const plane = clamp((Math.abs(speed) - 7) / 7, 0, 1)
    const quad = (24 - 16 * plane) * speed * Math.abs(speed)
    const wall = Math.sign(speed) * 0.01 * speed ** 4
    const hump =
      Math.sign(speed || 1) *
      7500 *
      Math.exp(-((Math.abs(speed) - 6) ** 2) / 16) *
      clamp(Math.abs(speed) / 1.5, 0, 1)
    const drag = (quad + wall + hump) * clamp(wet, 0, 1)
    const keel = body.quaternion.vmult(new Vec3(0, -0.06, 0.4))
    body.applyForce(forward.scale(-drag), keel)
    const yawRate = body.angularVelocity.dot(up)
    body.torque.vadd(up.scale(-yawRate * (700 + Math.abs(speed) * 110)), body.torque)
    const hullUp = body.quaternion.vmult(new Vec3(0, 1, 0))
    body.torque.vadd(hullUp.cross(up).scale(body.mass * 10), body.torque)
    const pitchAxis = body.quaternion.vmult(new Vec3(1, 0, 0))
    body.torque.vadd(pitchAxis.scale(-body.angularVelocity.dot(pitchAxis) * 2800), body.torque)
    const rollAxis = body.quaternion.vmult(new Vec3(0, 0, 1))
    body.torque.vadd(rollAxis.scale(-body.angularVelocity.dot(rollAxis) * 1800), body.torque)
    if (braking && Math.abs(speed) > 0.4) body.applyForce(forward.scale(-Math.sign(speed) * 1600))
  }
  body.wakeUp()
}
