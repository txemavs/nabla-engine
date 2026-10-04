import type { PowertrainDefinition, WheeledDefinition } from './wheeled/contracts.js'
import { roadVehicleDefaults } from '../../config/simulation.js'

export interface DrivetrainState {
  gear: number
  manual: boolean
  rpm: number
  shiftRemaining: number
  cooldown: number
  force: number
  load: number
  burnout: boolean
  launchSlip: number
  pendingDirection: -1 | 1 | null
  directionRemaining: number
}
export const createDrivetrain = (): DrivetrainState => ({
  gear: 1,
  manual: false,
  rpm: 900,
  shiftRemaining: 0,
  cooldown: 0,
  force: 0,
  load: 0,
  burnout: false,
  launchSlip: 0,
  pendingDirection: null,
  directionRemaining: 0,
})

/** Keep the selected direction at idle; opposite input must be held for a full safe-stop delay. */
export function selectDriveDirection(
  state: DrivetrainState,
  speed: number,
  throttle: number,
  dt: number,
): boolean {
  const requested = throttle > 0.01 ? 1 : throttle < -0.01 ? -1 : 0
  if (!requested || requested === Math.sign(state.gear)) {
    state.pendingDirection = null
    state.directionRemaining = 0
    return false
  }
  if (Math.abs(speed) > roadVehicleDefaults.directionChangeSpeed) {
    state.pendingDirection = null
    state.directionRemaining = 0
    return true
  }
  if (state.pendingDirection !== requested) {
    state.pendingDirection = requested
    state.directionRemaining = roadVehicleDefaults.directionChangeSeconds
  }
  state.directionRemaining = Math.max(0, state.directionRemaining - dt)
  if (state.directionRemaining > 1e-8) return true
  state.gear = requested
  state.pendingDirection = null
  state.directionRemaining = 0
  return false
}
export function isDriven(axle: WheeledDefinition['drivenWheels'], wheel: number): boolean {
  return axle === 'all' || (axle === 'front' ? wheel < 2 : wheel >= 2)
}
/** Fixed-step, deliberately forgiving DSG-style clutch; no dependency on asset names or Studio. */
export function stepDrivetrain(
  state: DrivetrainState,
  spec: PowertrainDefinition,
  radius: number,
  speed: number,
  throttle: number,
  handbrake: boolean,
  dt: number,
  aggressiveLaunch = false,
): void {
  // Reverse is a separate ratio, never an index in the forward gear array.
  // Reject a stale/invalid gear before it can introduce NaN forces into Rapier.
  if (
    !Number.isInteger(state.gear) ||
    (state.gear !== -1 && (state.gear < 1 || state.gear > spec.ratios.length))
  ) {
    Object.assign(state, createDrivetrain())
  }
  state.cooldown = Math.max(0, state.cooldown - dt)
  state.shiftRemaining = Math.max(0, state.shiftRemaining - dt)
  state.burnout = handbrake && throttle > 0.5 && Math.abs(speed) < 3
  state.launchSlip =
    aggressiveLaunch && throttle > 0.5 && !handbrake && speed > -0.8
      ? Math.max(0, Math.min(1, (15 - Math.abs(speed)) / 10))
      : 0
  const changingDirection = selectDriveDirection(state, speed, throttle, dt)
  if (changingDirection) throttle = 0
  const reverse = state.gear < 0
  const wheelRpm = (Math.abs(speed) / (2 * Math.PI * radius)) * 60
  const maxRpm = spec.maxRpm ?? 6900
  const idleRpm = spec.idleRpm ?? roadVehicleDefaults.idleRpm
  let ratio = state.gear < 0 ? (spec.reverseRatio ?? 3.2) : spec.ratios[state.gear - 1]
  const coupled = wheelRpm * ratio * spec.finalDrive
  if (!state.manual && state.gear > 0 && !state.burnout && state.cooldown === 0) {
    const previous = state.gear
    if (coupled > maxRpm * (6400 / 6900) && state.gear < spec.ratios.length) state.gear++
    else if (coupled < maxRpm / 3 && state.gear > 1) state.gear--
    if (state.gear !== previous) {
      state.shiftRemaining = 0.09
      state.cooldown = 0.45
      ratio = spec.ratios[state.gear - 1]
    }
  }
  const launch = state.burnout
    ? 5700
    : state.launchSlip > 0
      ? 2400 + state.launchSlip * 1800
      : Math.abs(throttle) * 2400
  const targetRpm = Math.min(maxRpm, Math.max(idleRpm, launch, wheelRpm * ratio * spec.finalDrive))
  state.rpm += (targetRpm - state.rpm) * (1 - Math.exp(-dt * 16))
  state.load = Math.abs(throttle) * (state.shiftRemaining > 0 ? 0.15 : 1)
  // Torque plateau, then constant-power falloff. 400 CV = 294.2 kW at the crank.
  const torque = Math.min(spec.torqueNm, (spec.powerCv * 735.49875) / ((state.rpm * Math.PI) / 30))
  const wheelForce = (torque * ratio * spec.finalDrive * 0.9) / radius
  const powerLimit = (spec.powerCv * 735.49875 * 0.9) / Math.max(1, Math.abs(speed))
  state.force = Math.sign(throttle) * state.load * Math.min(wheelForce, powerLimit)
  if (
    changingDirection ||
    coupled > maxRpm + 100 ||
    (reverse && Math.abs(speed) > 12) ||
    (spec.maxSpeedKmh !== undefined && speed * 3.6 >= spec.maxSpeedKmh)
  )
    state.force = 0
}

/** A paddle enters manual mode; reject unsafe reductions instead of over-revving. */
export function shiftGear(
  state: DrivetrainState,
  spec: PowertrainDefinition,
  radius: number,
  speed: number,
  direction: -1 | 1,
): boolean {
  state.manual = true
  if (state.gear < 1 || state.shiftRemaining > 0) return false
  const gear = state.gear + direction
  if (gear < 1 || gear > spec.ratios.length) return false
  const rpm =
    (Math.abs(speed) / (2 * Math.PI * radius)) * 60 * spec.ratios[gear - 1] * spec.finalDrive
  if (rpm > 6500) return false
  state.gear = gear
  state.shiftRemaining = 0.09
  state.cooldown = 0.45
  return true
}
/** Closed-throttle pumping losses through the selected gear, fading before standstill. */
export function engineBrakingForce(
  state: DrivetrainState,
  spec: PowertrainDefinition,
  radius: number,
  speed: number,
): number {
  const ratio = state.gear < 0 ? 3.2 : spec.ratios[state.gear - 1]
  const torque = 12 + Math.max(0, state.rpm - 900) * 0.007
  return (
    ((-Math.sign(speed) * torque * ratio * spec.finalDrive * 0.85) / radius) *
    Math.min(1, Math.abs(speed) / 2)
  )
}
