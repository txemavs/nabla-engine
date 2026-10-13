import { jumpControlTuning as tuning } from '../../config/gameplay-tuning.js'
import { Vec3 } from '../physics.js'
import type { WheeledVehicle } from './wheeled/runtime.js'
import type { WheeledInput } from './wheeled/contracts.js'

/** Orient an occupied road vehicle during a jump, without adding translational force. */
export function stepJumpControl(v: WheeledVehicle, input: WheeledInput, active: boolean): void {
  if (!active || v.definition.passive || !v.raycast.wheelInfos.length) return
  if (
    v.raycast.wheelInfos.some(
      (wheel, i) => v.raycast.controller?.wheelIsInContact(i) ?? wheel.isInContact,
    )
  )
    return
  const rider = v.definition.twoWheeled ? input.rider : undefined
  const pedal = input.handbrake || (input.lever ?? 0) > 0 ? -1 : input.throttle
  const pitch =
    pedal * tuning.pitchAcceleration - (rider?.forward ?? 0) * tuning.riderPitchAcceleration
  const yaw = -input.steering * tuning.yawAcceleration
  const roll =
    -input.steering * tuning.rollAcceleration - (rider?.right ?? 0) * tuning.riderRollAcceleration
  const commands = [pitch, yaw, roll]
  const inertia = [v.body.inertia.x, v.body.inertia.y, v.body.inertia.z]
  for (let axis = 0; axis < 3; axis++) {
    const command = commands[axis]
    if (!Number.isFinite(command) || command === 0) continue
    const local = new Vec3(axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0)
    const world = v.body.quaternion.vmult(local)
    // Limit only extra acceleration in the current direction, never erase a tumble.
    if (v.body.angularVelocity.dot(world) * Math.sign(command) >= tuning.maxAssistedRate) continue
    v.body.applyTorque(world.scale(inertia[axis] * command))
  }
}
