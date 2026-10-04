import type { PowertrainDefinition, WheeledDefinition } from './wheeled/contracts.js'

export type DrivetrainProfile = 'gasoline' | 'diesel'

export interface DrivetrainTuning {
  idleRpm: number
  redlineRpm: number
  upshiftRpm: number
  downshiftRpm: number
  maxRpmOvershoot: number
  reverseRatio: number
  shiftTime: number
  shiftCooldown: number
  brakingTorqueBase: number
  brakingTorquePerRpm: number
}

const GASOLINE_TUNING: DrivetrainTuning = {
  idleRpm: 900,
  redlineRpm: 6900,
  upshiftRpm: 6400,
  downshiftRpm: 2300,
  maxRpmOvershoot: 7000,
  reverseRatio: 3.2,
  shiftTime: 0.09,
  shiftCooldown: 0.45,
  brakingTorqueBase: 12,
  brakingTorquePerRpm: 0.007,
}

const DIESEL_TUNING: DrivetrainTuning = {
  idleRpm: 550,
  redlineRpm: 2100,
  upshiftRpm: 1800,
  downshiftRpm: 1100,
  maxRpmOvershoot: 2200,
  reverseRatio: 14.0,
  shiftTime: 0.18,
  shiftCooldown: 0.6,
  brakingTorqueBase: 80,
  brakingTorquePerRpm: 0.04,
}

export function getDrivetrainTuning(profile?: DrivetrainProfile): DrivetrainTuning {
  return profile === 'diesel' ? DIESEL_TUNING : GASOLINE_TUNING
}

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

export function createDrivetrain(profile?: DrivetrainProfile): DrivetrainState {
  const tuning = getDrivetrainTuning(profile)
  return {
    gear: 1,
    manual: false,
    rpm: tuning.idleRpm,
    shiftRemaining: 0,
    cooldown: 0,
    force: 0,
    load: 0,
    burnout: false,
    launchSlip: 0,
  }
}
export function isDriven(axle: WheeledDefinition['drivenWheels'], wheel: number): boolean {
  return axle === 'all' || (axle === 'front' ? wheel < 2 : wheel >= 2)
}

/**
 * Fixed-step drivetrain simulation with profile-aware tuning.
 * Gasoline: DSG-style with high-revving characteristics (900-6900 RPM).
 * Diesel: Heavy-duty truck characteristics (550-2100 RPM), stronger engine braking.
 */
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
  const tuning = getDrivetrainTuning(spec.profile)

  if (
    !Number.isInteger(state.gear) ||
    (state.gear !== -1 && (state.gear < 1 || state.gear > spec.ratios.length))
  ) {
    Object.assign(state, createDrivetrain(spec.profile))
  }
  state.cooldown = Math.max(0, state.cooldown - dt)
  state.shiftRemaining = Math.max(0, state.shiftRemaining - dt)

  const isDiesel = spec.profile === 'diesel'
  state.burnout = !isDiesel && handbrake && throttle > 0.5 && Math.abs(speed) < 3
  state.launchSlip =
    !isDiesel && aggressiveLaunch && throttle > 0.5 && !handbrake && speed > -0.8
      ? Math.max(0, Math.min(1, (15 - Math.abs(speed)) / 10))
      : 0

  const reverse = throttle < 0 && speed < 0.8
  if (reverse) state.gear = -1
  else if (state.gear < 0 && speed > -0.8) state.gear = 1

  const wheelRpm = (Math.abs(speed) / (2 * Math.PI * radius)) * 60
  let ratio = state.gear < 0 ? tuning.reverseRatio : spec.ratios[state.gear - 1]
  const coupled = wheelRpm * ratio * spec.finalDrive

  if (!state.manual && state.gear > 0 && !state.burnout && state.cooldown === 0) {
    const previous = state.gear
    if (coupled > tuning.upshiftRpm && state.gear < spec.ratios.length) state.gear++
    else if (coupled < tuning.downshiftRpm && state.gear > 1) state.gear--
    if (state.gear !== previous) {
      state.shiftRemaining = tuning.shiftTime
      state.cooldown = tuning.shiftCooldown
      ratio = spec.ratios[state.gear - 1]
    }
  }

  const launchRpm = isDiesel
    ? tuning.idleRpm + Math.abs(throttle) * (tuning.redlineRpm - tuning.idleRpm) * 0.6
    : state.burnout
      ? 5700
      : state.launchSlip > 0
        ? 2400 + state.launchSlip * 1800
        : Math.abs(throttle) * 2400

  const targetRpm = Math.min(
    tuning.redlineRpm,
    Math.max(tuning.idleRpm, launchRpm, wheelRpm * ratio * spec.finalDrive),
  )
  state.rpm += (targetRpm - state.rpm) * (1 - Math.exp(-dt * (isDiesel ? 8 : 16)))
  state.load = Math.abs(throttle) * (state.shiftRemaining > 0 ? 0.15 : 1)

  const torque = Math.min(spec.torqueNm, (spec.powerCv * 735.49875) / ((state.rpm * Math.PI) / 30))
  const wheelForce = (torque * ratio * spec.finalDrive * 0.9) / radius
  const powerLimit = (spec.powerCv * 735.49875 * 0.9) / Math.max(1, Math.abs(speed))
  state.force = Math.sign(throttle) * state.load * Math.min(wheelForce, powerLimit)

  const maxReverseSpeed = isDiesel ? 25 : 12
  if (coupled > tuning.maxRpmOvershoot || (reverse && Math.abs(speed) > maxReverseSpeed))
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
  const tuning = getDrivetrainTuning(spec.profile)
  state.manual = true
  if (state.gear < 1 || state.shiftRemaining > 0) return false
  const gear = state.gear + direction
  if (gear < 1 || gear > spec.ratios.length) return false
  const rpm =
    (Math.abs(speed) / (2 * Math.PI * radius)) * 60 * spec.ratios[gear - 1] * spec.finalDrive
  if (rpm > tuning.redlineRpm * 0.95) return false
  state.gear = gear
  state.shiftRemaining = tuning.shiftTime
  state.cooldown = tuning.shiftCooldown
  return true
}

/** Closed-throttle pumping losses through the selected gear, fading before standstill. */
export function engineBrakingForce(
  state: DrivetrainState,
  spec: PowertrainDefinition,
  radius: number,
  speed: number,
): number {
  const tuning = getDrivetrainTuning(spec.profile)
  const ratio = state.gear < 0 ? tuning.reverseRatio : spec.ratios[state.gear - 1]
  const torque =
    tuning.brakingTorqueBase + Math.max(0, state.rpm - tuning.idleRpm) * tuning.brakingTorquePerRpm
  return (
    ((-Math.sign(speed) * torque * ratio * spec.finalDrive * 0.85) / radius) *
    Math.min(1, Math.abs(speed) / 2)
  )
}
