/**
 * Arcade vehicle control policy.
 *
 * Clean port of Agency vehicleControl.ts — named units, no hidden ω multiplies.
 * Computes steering, engine force, brakes from input + tune.
 *
 * Axes: Y-up, +Z forward. Engine force is negative (pushes chassis backward,
 * wheels push ground forward → car moves +Z).
 */
import type { Body } from 'cannon-es'
import { Vec3 } from 'cannon-es'
import type { VehicleGear, VehicleInput, VehicleTune } from './vehicleDef.js'
import {
  BRAKE_TO_REVERSE_MPS,
  HANDBRAKE_FRONT,
  HANDBRAKE_REAR,
  TURBO_FORCE_N,
  TURBO_MIN_SPEED_MPS,
  TURBO_WOT,
  ROLLOVER_ROLL_DEG,
  ROLLOVER_UP_DOT,
  ROLLOVER_HOLD_FRAMES,
  ANTI_ROLL_BAR_N_PER_M,
} from './vehicleDef.js'

export function resolveGear(
  throttle: number,
  forwardSpeed: number,
  brakeToReverse = BRAKE_TO_REVERSE_MPS,
): VehicleGear {
  const t = Math.max(-1, Math.min(1, throttle))
  if (t > 0.04) return 'forward'
  if (t < -0.04) return forwardSpeed > brakeToReverse ? 'braking' : 'reverse'
  return 'idle'
}

/** Tail lamps: foot brake while rolling, or Space handbrake. */
export function brakesLit(gear: VehicleGear, handbrake: boolean): boolean {
  return handbrake || gear === 'braking'
}

export interface ControlForces {
  steerRad: number
  engine: number
  frontBrake: number
  rearBrake: number
}

export function controlForces(
  gear: VehicleGear,
  throttle: number,
  steer: number,
  speed: number,
  tune: VehicleTune,
  handbrake = false,
  turbo = false,
): ControlForces {
  const t = Math.max(-1, Math.min(1, throttle))
  const s = Math.max(-1, Math.min(1, steer))

  const blend = Math.min(1, Math.abs(speed) / 12)
  const lock = tune.steerRest + (tune.maxSteer - tune.steerRest) * blend
  const steerRad = -s * lock

  const extra =
    turbo && gear === 'forward' && t >= TURBO_WOT && speed >= TURBO_MIN_SPEED_MPS
      ? TURBO_FORCE_N
      : 0

  if (handbrake) {
    return {
      steerRad,
      engine: t > 0.04 ? -t * tune.maxForce : 0,
      frontBrake: tune.brake * HANDBRAKE_FRONT,
      rearBrake: tune.brake * HANDBRAKE_REAR,
    }
  }
  if (gear === 'forward') {
    return { steerRad, engine: -(t * tune.maxForce + extra), frontBrake: 0, rearBrake: 0 }
  }
  if (gear === 'braking') {
    return { steerRad, engine: 0, frontBrake: tune.brake * 0.35, rearBrake: tune.brake }
  }
  if (gear === 'reverse') {
    return { steerRad, engine: -t * tune.reverseForce, frontBrake: 0, rearBrake: 0 }
  }
  return { steerRad, engine: 0, frontBrake: 1.4, rearBrake: 4 }
}

/** Restoring torque on local pitch/roll rate (N·m per rad/s). */
export function applyAntiRoll(chassis: Body, antiRollNm: number): void {
  const inv = chassis.quaternion.inverse()
  const local = inv.vmult(chassis.angularVelocity)
  const torqueLocal = new Vec3(-local.x * antiRollNm, 0, -local.z * antiRollNm)
  chassis.applyTorque(chassis.quaternion.vmult(torqueLocal))
}

/** Pair bar: push the extended side down, the compressed side up. */
export function applyAntiRollBar(
  chassis: Body,
  pairs: { left: { length: number; world: Vec3 }; right: { length: number; world: Vec3 } }[],
  stiffness = ANTI_ROLL_BAR_N_PER_M,
): void {
  if (stiffness <= 0) return
  const up = chassis.quaternion.vmult(new Vec3(0, 1, 0))
  for (const pair of pairs) {
    const force = (pair.left.length - pair.right.length) * stiffness
    chassis.applyForce(new Vec3(-up.x * force, -up.y * force, -up.z * force), pair.left.world)
    chassis.applyForce(new Vec3(up.x * force, up.y * force, up.z * force), pair.right.world)
  }
}

/** Body +Y vs world +Y. 1 = upright, −1 = on the roof. */
export function chassisUpDot(q: { x: number; y: number; z: number; w: number }): number {
  const xx = q.x * q.x
  const zz = q.z * q.z
  return 1 - 2 * (xx + zz)
}

export function isInverted(rollDeg: number, quat: { x: number; y: number; z: number; w: number }): boolean {
  return Math.abs(rollDeg) > ROLLOVER_ROLL_DEG || chassisUpDot(quat) < ROLLOVER_UP_DOT
}

export class RolloverWatch {
  frames = 0

  tick(inverted: boolean): boolean {
    if (!inverted) {
      this.frames = 0
      return false
    }
    this.frames += 1
    return this.frames >= ROLLOVER_HOLD_FRAMES
  }

  reset(): void {
    this.frames = 0
  }
}

export interface VehicleControls {
  setSteer: (rad: number) => void
  setEngine: (force: number) => void
  setBrake: (front: number, rear: number) => void
  chassis: Body
}

export function applyVehicleInput(
  controls: VehicleControls,
  input: VehicleInput,
  tune: VehicleTune,
  forwardSpeed: number,
): { gear: VehicleGear; engine: number; steerRad: number } {
  const gear = resolveGear(input.throttle, forwardSpeed)
  const forces = controlForces(
    gear,
    input.throttle,
    input.steer,
    forwardSpeed,
    tune,
    Boolean(input.handbrake),
    Boolean(input.turbo),
  )
  controls.setSteer(forces.steerRad)
  controls.setEngine(forces.engine)
  controls.setBrake(forces.frontBrake, forces.rearBrake)
  applyAntiRoll(controls.chassis, tune.antiRollNm)
  return { gear, engine: forces.engine, steerRad: forces.steerRad }
}
