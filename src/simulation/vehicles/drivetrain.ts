import type { PowertrainDefinition, WheeledDefinition } from './wheeled/contracts.js'
import { roadVehicleDefaults } from '../../config/simulation.js'

export interface DrivetrainState {
  /** Selector position: -1 R, 0 N or P (see `parked`), 1..n D (or M when `manual`). */
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
  /** Park: gear is 0 and the brakes hold the vehicle. Only the driver's W or S leaves it. */
  parked: boolean
  /** Seconds the vehicle has been stopped with the handbrake on and no pedal (N then P timers). */
  holdSeconds: number
  /** Increments on every gear change, automatic or not, and on every D/R/N/P engagement. */
  shiftCount: number
  /**
   * Increments only on changes the driver hears: D/R engagement and manual paddle shifts.
   * Automatic up/down shifts are silent; the audio layer plays one clack per increase.
   */
  clackCount: number
  /**
   * Start-up sequence after a driver gets in (`startIgnition`): `sweep` (needle self-test,
   * engine off), then `cranking` (starter motor), then `running`. Anything but `running`
   * keeps the selector in P and cuts drive torque.
   */
  ignition: IgnitionPhase
  /** Seconds spent in the current ignition phase. */
  ignitionElapsed: number
  /** Increments on every `startIgnition`; the audio layer plays one starter sound per increase. */
  ignitionCount: number
  /** Metres crept along the vehicle's forward axis since P started holding; see `parkHold*`. */
  parkOffset: number
}
/** See `DrivetrainState.ignition`. */
export type IgnitionPhase = 'sweep' | 'cranking' | 'running'
/** Every wheeled vehicle is created in P (gear 0, parked) with its engine running. */
export const createDrivetrain = (): DrivetrainState => ({
  gear: 0,
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
  parked: true,
  holdSeconds: 0,
  shiftCount: 0,
  clackCount: 0,
  ignition: 'running',
  ignitionElapsed: 0,
  ignitionCount: 0,
  parkOffset: 0,
})

/**
 * Select P: gear 0, parked, automatic mode, any pending D/R request and torque cut cleared.
 * The wheeled runtime then holds the vehicle with its full service brake until the driver's
 * W or S leaves P. Counts one shift when the selector actually moves; never a clack.
 */
export function engagePark(state: DrivetrainState): void {
  if (state.gear !== 0 || !state.parked) state.shiftCount++
  state.gear = 0
  state.parked = true
  state.manual = false
  state.pendingDirection = null
  state.directionRemaining = 0
  state.changingDirection = false
  state.holdSeconds = 0
  state.shiftRemaining = 0
  state.cooldown = 0
  state.force = 0
  state.load = 0
  state.burnout = false
  state.launchSlip = 0
}

/** Begin the start-up sequence: needle sweep, then cranking, then idle. Engine speed drops to 0. */
export function startIgnition(state: DrivetrainState): void {
  state.ignition = 'sweep'
  state.ignitionElapsed = 0
  state.ignitionCount++
  state.rpm = 0
}

/** True while the start-up sequence runs (`sweep` or `cranking`). */
export const isStarting = (state: DrivetrainState): boolean => state.ignition !== 'running'

/**
 * Advance the start-up sequence by `dt`. While it runs, P is kept, drive torque is zero and
 * engine speed follows the sequence (0 during the sweep, a cranking wobble, then the catch at
 * `ignitionFlare` x idle which the drivetrain settles to idle). Returns true while starting.
 */
export function stepIgnition(state: DrivetrainState, dt: number, idleRpm: number): boolean {
  if (state.ignition === 'running') return false
  state.ignitionElapsed += dt
  if (
    state.ignition === 'sweep' &&
    state.ignitionElapsed >= roadVehicleDefaults.ignitionSweepSeconds
  ) {
    state.ignition = 'cranking'
    state.ignitionElapsed -= roadVehicleDefaults.ignitionSweepSeconds
  }
  if (
    state.ignition === 'cranking' &&
    state.ignitionElapsed >= roadVehicleDefaults.ignitionCrankSeconds
  ) {
    state.ignition = 'running'
    state.ignitionElapsed = 0
    state.rpm = idleRpm * roadVehicleDefaults.ignitionFlare
    return false
  }
  engagePark(state)
  state.rpm = ignitionRpm(state)
  return true
}

/** Engine speed during the start-up sequence: 0 in the sweep, a pulsing starter speed while cranking. */
export function ignitionRpm(state: Pick<DrivetrainState, 'ignition' | 'ignitionElapsed'>): number {
  if (state.ignition !== 'cranking') return 0
  // Two compression strokes per crank revolution make the starter speed pulse.
  return (
    roadVehicleDefaults.crankingRpm * (1 + 0.25 * Math.sin(state.ignitionElapsed * Math.PI * 2 * 9))
  )
}

/**
 * Needle self-test position, 0..1: smooth (cosine) rise to full scale, a short hold, and a
 * smooth fall back to 0 over `ignitionSweepSeconds`. 0 outside the sweep phase.
 */
export function gaugeSweep(state: Pick<DrivetrainState, 'ignition' | 'ignitionElapsed'>): number {
  if (state.ignition !== 'sweep') return 0
  const t = Math.max(
    0,
    Math.min(1, state.ignitionElapsed / roadVehicleDefaults.ignitionSweepSeconds),
  )
  const ease = (u: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, u)))
  return t < 0.45 ? ease(t / 0.45) : t < 0.55 ? 1 : ease((1 - t) / 0.45)
}

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
  /** Standstill with the handbrake on and no pedal before D/R drops to N, seconds. */
  neutralSeconds: number
  /** Further time stopped in N with the handbrake on before P engages, seconds. */
  parkSeconds: number
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
    neutralSeconds: shift?.neutralSeconds ?? roadVehicleDefaults.neutralSeconds,
    parkSeconds: shift?.parkSeconds ?? roadVehicleDefaults.parkSeconds,
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
  // From N (not P) the driver may select the direction the vehicle is already rolling in.
  const along = state.gear === 0 && !state.parked && speed * requested > 0
  if (!along && Math.abs(speed) > roadVehicleDefaults.directionChangeSpeed) {
    state.pendingDirection = null
    state.directionRemaining = 0
    return true
  }
  if (state.pendingDirection !== requested) {
    state.pendingDirection = requested
    state.directionRemaining = along ? 0 : gearbox.directionSeconds
  }
  state.directionRemaining = Math.max(0, state.directionRemaining - dt)
  if (state.directionRemaining > 1e-8) return true
  state.gear = requested
  state.parked = false
  state.holdSeconds = 0
  state.pendingDirection = null
  state.directionRemaining = 0
  state.changingDirection = false
  state.shiftRemaining = gearbox.directionShiftSeconds
  state.cooldown = gearbox.cooldownSeconds
  state.shiftCount++
  state.clackCount++
  return false
}
/**
 * Realistic selector: stopped with the handbrake on and both pedals released, D/R drops to N
 * after `neutralSeconds`, and N to P after a further `parkSeconds`. Nothing here ever returns
 * to D or R: releasing the handbrake keeps N/P, and only `selectDriveDirection` (the driver's
 * W or S) leaves them. Reaching P is audible; the vehicle is then held by the brakes.
 */
export function selectNeutralOrPark(
  state: DrivetrainState,
  speed: number,
  throttle: number,
  handbrake: boolean,
  dt: number,
  gearbox: Pick<ResolvedGearbox, 'neutralSeconds' | 'parkSeconds'> = gearboxTuning(),
): void {
  const resting =
    handbrake &&
    Math.abs(throttle) < 0.01 &&
    Math.abs(speed) < roadVehicleDefaults.directionChangeSpeed
  if (!resting || state.parked) {
    state.holdSeconds = 0
    return
  }
  state.holdSeconds += dt
  if (state.gear !== 0) {
    if (state.holdSeconds < gearbox.neutralSeconds) return
    state.gear = 0
    state.holdSeconds = 0
    state.shiftCount++
  } else if (state.holdSeconds >= gearbox.parkSeconds) {
    state.parked = true
    state.holdSeconds = 0
    state.shiftCount++
    state.clackCount++
  }
}
/** Lowest forward gear whose coupled engine speed stays below the upshift point. */
export function gearForSpeed(
  spec: PowertrainDefinition,
  radius: number,
  speed: number,
  upshiftRpm: number,
): number {
  const wheelRpm = (Math.abs(speed) / (2 * Math.PI * radius)) * 60
  for (let g = 1; g < spec.ratios.length; g++)
    if (wheelRpm * spec.ratios[g - 1] * spec.finalDrive < upshiftRpm) return g
  return spec.ratios.length
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
    (state.gear !== -1 && state.gear !== 0 && (state.gear < 1 || state.gear > spec.ratios.length))
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
  selectNeutralOrPark(state, speed, throttle, handbrake, dt, gearbox)
  const fromNeutral = state.gear === 0
  const changingDirection = selectDriveDirection(state, speed, throttle, dt, gearbox)
  // Leaving N while rolling engages the gear that suits the road speed, not first.
  if (fromNeutral && state.gear === 1)
    state.gear = gearForSpeed(spec, radius, speed, gearbox.upshiftRpm)
  if (changingDirection) throttle = 0
  const reverse = state.gear < 0
  const wheelRpm = (Math.abs(speed) / (2 * Math.PI * radius)) * 60
  const maxRpm = spec.maxRpm ?? 6900
  const idleRpm = spec.idleRpm ?? roadVehicleDefaults.idleRpm
  let ratio =
    state.gear === 0 ? 0 : state.gear < 0 ? (spec.reverseRatio ?? 3.2) : spec.ratios[state.gear - 1]
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
    state.gear === 0 ||
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
  if (state.gear < 1 || state.shiftRemaining > 0) return false // not in N, P or R
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
  state.clackCount++
  return true
}
/** Closed-throttle pumping losses through the selected gear, fading before standstill. */
export function engineBrakingForce(
  state: DrivetrainState,
  spec: PowertrainDefinition,
  radius: number,
  speed: number,
): number {
  if (state.gear === 0) return 0
  const ratio = state.gear < 0 ? 3.2 : spec.ratios[state.gear - 1]
  const torque = 12 + Math.max(0, state.rpm - 900) * 0.007
  return (
    ((-Math.sign(speed) * torque * ratio * spec.finalDrive * 0.85) / radius) *
    Math.min(1, Math.abs(speed) / 2)
  )
}
