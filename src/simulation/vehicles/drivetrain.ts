import type { PowertrainDefinition, WheeledDefinition } from './wheeled/contracts.js'

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
})
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
  const reverse = throttle < 0 && speed < 0.8
  if (reverse) state.gear = -1
  else if (state.gear < 0 && speed > -0.8) state.gear = 1
  const wheelRpm = (Math.abs(speed) / (2 * Math.PI * radius)) * 60
  let ratio = state.gear < 0 ? 3.2 : spec.ratios[state.gear - 1]
  const coupled = wheelRpm * ratio * spec.finalDrive
  if (!state.manual && state.gear > 0 && !state.burnout && state.cooldown === 0) {
    const previous = state.gear
    if (coupled > 6400 && state.gear < spec.ratios.length) state.gear++
    else if (coupled < 2300 && state.gear > 1) state.gear--
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
  const targetRpm = Math.min(6900, Math.max(900, launch, wheelRpm * ratio * spec.finalDrive))
  state.rpm += (targetRpm - state.rpm) * (1 - Math.exp(-dt * 16))
  state.load = Math.abs(throttle) * (state.shiftRemaining > 0 ? 0.15 : 1)
  // Torque plateau, then constant-power falloff. 400 CV = 294.2 kW at the crank.
  const torque = Math.min(spec.torqueNm, (spec.powerCv * 735.49875) / ((state.rpm * Math.PI) / 30))
  const wheelForce = (torque * ratio * spec.finalDrive * 0.9) / radius
  const powerLimit = (spec.powerCv * 735.49875 * 0.9) / Math.max(1, Math.abs(speed))
  state.force = Math.sign(throttle) * state.load * Math.min(wheelForce, powerLimit)
  if (coupled > 7000 || (reverse && Math.abs(speed) > 12)) state.force = 0
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
