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
  /** True while an opposite-direction request waits for the vehicle to stop. */
  changingDirection: boolean
  /** Increments on every gear change and D/R engagement; the audio layer plays one clack each. */
  shiftCount: number
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
  changingDirection: false,
  shiftCount: 0,
})

/** Gearbox feel with every default applied; see `GearboxTuning` and `roadVehicleDefaults`. */
export interface ResolvedGearbox {
  seconds: number
  cooldownSeconds: number
  upshiftRpm: number
  downshiftRpm: number
  /** Manual reductions that would exceed this engine speed are refused. */
  overrevRpm: number
  torqueFraction: number
  rpmResponse: number
  launchRpm: number
  directionSeconds: number
  directionShiftSeconds: number
  /** maxRpm relative to the 6,900 rpm road car the burnout constants were written for. */
  rpmScale: number
}
export function gearboxTuning(spec?: PowertrainDefinition): ResolvedGearbox {
  const shift = spec?.shift
  const maxRpm = spec?.maxRpm ?? 6900
  const rpmScale = maxRpm / 6900
  return {
    seconds: shift?.seconds ?? roadVehicleDefaults.gearShiftSeconds,
    cooldownSeconds: shift?.cooldownSeconds ?? roadVehicleDefaults.gearShiftCooldownSeconds,
    upshiftRpm: shift?.upshiftRpm ?? maxRpm * (6400 / 6900),
    downshiftRpm: shift?.downshiftRpm ?? maxRpm / 3,
    overrevRpm: maxRpm * (6500 / 6900),
    torqueFraction: shift?.torqueFraction ?? roadVehicleDefaults.gearShiftTorqueFraction,
    rpmResponse: shift?.rpmResponse ?? roadVehicleDefaults.engineRpmResponse,
    launchRpm: shift?.launchRpm ?? roadVehicleDefaults.launchRpm * rpmScale,
    directionSeconds: shift?.directionSeconds ?? roadVehicleDefaults.directionChangeSeconds,
    directionShiftSeconds:
      shift?.directionShiftSeconds ?? roadVehicleDefaults.directionShiftSeconds,
    rpmScale,
  }
}

/**
 * Brake-then-shift direction selector. An opposite pedal never engages D/R while the vehicle
 * is still rolling: the caller keeps braking (returns true) until `|speed|` drops below
 * `directionChangeSpeed`, the vehicle then stays planted for `directionSeconds`, and only
 * then the gear flips, a clack is counted and torque stays cut for `directionShiftSeconds`.
 * Releasing the pedal or rolling again restarts the dwell, so there is no rebound.
 * Returns true while the request is being held back.
 */
export function selectDriveDirection(
  state: DrivetrainState,
  speed: number,
  throttle: number,
  dt: number,
  gearbox: Pick<
    ResolvedGearbox,
    'directionSeconds' | 'directionShiftSeconds' | 'cooldownSeconds'
  > = gearboxTuning(),
): boolean {
  const requested = throttle > 0.01 ? 1 : throttle < -0.01 ? -1 : 0
  state.changingDirection = false
  if (!requested || requested === Math.sign(state.gear)) {
    state.pendingDirection = null
    state.directionRemaining = 0
    return false
  }
  state.changingDirection = true
  if (Math.abs(speed) > roadVehicleDefaults.directionChangeSpeed) {
    state.pendingDirection = null
    state.directionRemaining = 0
    return true
  }
  if (state.pendingDirection !== requested) {
    state.pendingDirection = requested
    state.directionRemaining = gearbox.directionSeconds
  }
  state.directionRemaining = Math.max(0, state.directionRemaining - dt)
  if (state.directionRemaining > 1e-8) return true
  state.gear = requested
  state.pendingDirection = null
  state.directionRemaining = 0
  state.changingDirection = false
  state.shiftRemaining = gearbox.directionShiftSeconds
  state.cooldown = gearbox.cooldownSeconds
  state.shiftCount++
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
  const gearbox = gearboxTuning(spec)
  const changingDirection = selectDriveDirection(state, speed, throttle, dt, gearbox)
  if (changingDirection) throttle = 0
  const reverse = state.gear < 0
  const wheelRpm = (Math.abs(speed) / (2 * Math.PI * radius)) * 60
  const maxRpm = spec.maxRpm ?? 6900
  const idleRpm = spec.idleRpm ?? roadVehicleDefaults.idleRpm
  let ratio = state.gear < 0 ? (spec.reverseRatio ?? 3.2) : spec.ratios[state.gear - 1]
  const coupled = wheelRpm * ratio * spec.finalDrive
  if (!state.manual && state.gear > 0 && !state.burnout && state.cooldown === 0) {
    const previous = state.gear
    if (coupled > gearbox.upshiftRpm && state.gear < spec.ratios.length) state.gear++
    else if (coupled < gearbox.downshiftRpm && state.gear > 1) state.gear--
    if (state.gear !== previous) {
      state.shiftRemaining = gearbox.seconds
      state.cooldown = gearbox.cooldownSeconds
      state.shiftCount++
      ratio = spec.ratios[state.gear - 1]
    }
  }
  const launch = state.burnout
    ? 5700 * gearbox.rpmScale
    : state.launchSlip > 0
      ? (2400 + state.launchSlip * 1800) * gearbox.rpmScale
      : // An explicit launchRpm models a launch only: tall gears show the real coupled speed.
        spec.shift?.launchRpm === undefined || Math.abs(state.gear) === 1
        ? Math.abs(throttle) * gearbox.launchRpm
        : 0
  const targetRpm = Math.min(maxRpm, Math.max(idleRpm, launch, wheelRpm * ratio * spec.finalDrive))
  state.rpm += (targetRpm - state.rpm) * (1 - Math.exp(-dt * gearbox.rpmResponse))
  state.load = Math.abs(throttle) * (state.shiftRemaining > 0 ? gearbox.torqueFraction : 1)
  // Torque plateau, then constant-power falloff. 400 CV = 294.2 kW at the crank.
  const torque = Math.min(spec.torqueNm, (spec.powerCv * 735.49875) / ((state.rpm * Math.PI) / 30))
  const wheelForce = (torque * ratio * spec.finalDrive * 0.9) / radius
  const powerLimit = (spec.powerCv * 735.49875 * 0.9) / Math.max(1, Math.abs(speed))
  state.force =
    Math.sign(throttle) *
    state.load *
    Math.min(wheelForce, powerLimit, spec.maxWheelForceN ?? Infinity)
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
  const gearbox = gearboxTuning(spec)
  if (rpm > gearbox.overrevRpm) return false
  state.gear = gear
  state.shiftRemaining = gearbox.seconds
  state.cooldown = gearbox.cooldownSeconds
  state.shiftCount++
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
