/**
 * Single-track (motorcycle) controller on the shared Rapier world.
 *
 * Phase 1:
 * - one rigid chassis body and two Rapier ray-cast wheels (front, rear) with their own radii;
 * - the handlebar turns about the raked steering axis; the ground steer angle follows from it;
 * - a lean controller tracks the steady-turn lean for the current speed and steer, with a
 *   disturbance observer for the tyre and gravity roll moments, and a low-speed balance assist
 *   that keeps a stopped or crawling machine upright (configurable, never fake wheel contacts);
 * - hand lever (negative throttle) and foot pedal (handbrake input) brakes;
 * - the shared automatic gearbox and engine model (`drivetrain.ts`) on the rear wheel.
 *
 * Phase 2:
 * - wheelies and stoppies come from the physics (forces at the contacts, below the centre of
 *   mass); a configurable assist fades drive / front brake near the limit and adds a restoring
 *   pitch torque past it, so they stay recoverable (`pitch.ts`);
 * - rider counterweight: the rider input moves the chassis centre of mass (`rider.ts`), which
 *   changes load transfer, the wheelie/stoppie thresholds and the lean needed in a turn;
 * - optional combined brakes (Dual CBS style): each control feeds both wheels (`brakes.ts`).
 *
 * Not modelled yet: countersteering dynamics, tyre camber/profile, clutch.
 */
import {
  simulationDefaults,
  roadVehicleDefaults,
  twoWheeledDefaults,
} from '../../../config/simulation.js'
import { Body, RaycastVehicle, Vec3 } from '../../physics.js'
import {
  createDrivetrain,
  stepDrivetrain,
  engineBrakingForce,
  selectDriveDirection,
  gearboxTuning,
  stepIgnition,
  ignitionRpm,
} from '../drivetrain.js'
import { holdInPark, isValidPowertrain, type WheeledVehicle } from '../wheeled/runtime.js'
import type { WheeledDefinition, WheeledInput } from '../wheeled/contracts.js'
import {
  balanceActive,
  groundSteerAngle,
  handlebarTarget,
  leanAcceleration,
  leanControlFrequency,
  leanRate as measureLeanRate,
  measureLean,
  steeringRakeCosine,
  targetLean,
  updateDisturbance,
} from './balance.js'
import { independentBrakes, stepCombinedBrakes, validBrakeSplit } from './brakes.js'
import type { TwoWheeledPose, TwoWheeledState, TwoWheeledTuning } from './contracts.js'
import { measurePitch, pitchAssist } from './pitch.js'
import {
  autoRiderInput,
  autoTuckDepth,
  tuckTarget,
  hangOffLean,
  riderCentreOfMass,
  riderTarget,
  stepRider,
  stepRiderControl,
} from './rider.js'

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))
const FRONT = 0,
  REAR = 1

/** A wheeled vehicle whose rig has two wheels and a lean controller. */
export interface TwoWheeledVehicle extends WheeledVehicle {
  twoWheeled: TwoWheeledState
}

/** Resolve a definition's tuning against `twoWheeledDefaults`. */
export function twoWheeledTuning(definition: WheeledDefinition): TwoWheeledTuning {
  const g = definition.twoWheeled
  if (!g) throw new Error('Not a two-wheeled definition')
  const d = twoWheeledDefaults
  return {
    maxLean: g.maxLean ?? d.maxLean,
    fallLean: g.fallLean ?? d.fallLean,
    balanceSpeed: g.balanceSpeed ?? d.balanceSpeed,
    balanceAssist: g.balanceAssist ?? d.balanceAssist,
    leanResponse: g.leanResponse ?? d.leanResponse,
    assistResponse: g.assistResponse ?? d.assistResponse,
    leanDampingRatio: d.leanDampingRatio,
    maxLeanAcceleration: g.maxLeanAcceleration ?? d.maxLeanAcceleration,
    disturbanceResponse: d.disturbanceResponse,
    steerRate: g.steerRate ?? d.steerRate,
    frontBrakeForce: g.frontBrakeForce ?? d.frontBrakeForce,
    rearBrakeForce: g.rearBrakeForce ?? d.rearBrakeForce,
    frictionSlip: g.frictionSlip ?? d.frictionSlip,
    dampingRelaxation: d.dampingRelaxation,
    dampingCompression: d.dampingCompression,
    dragFactor: d.dragFactor,
    pitchAssist: { ...d.pitchAssist, ...g.pitchAssist },
    rider: g.rider
      ? {
          seat: [...g.rider.seat],
          mass: g.rider.mass ?? d.rider.mass,
          lateral: g.rider.lateral ?? d.rider.lateral,
          forward: g.rider.forward ?? d.rider.forward,
          back: g.rider.back ?? d.rider.back,
          rate: g.rider.rate ?? d.rider.rate,
          steer: g.rider.steer ?? d.rider.steer,
          auto: { ...d.rider.auto, ...g.rider.auto },
          tuck: { ...d.rider.tuck, ...g.rider.tuck },
        }
      : null,
    brakes: g.cbs ? { ...d.cbs, ...g.cbs } : { ...independentBrakes },
    combinedBrakes: Boolean(g.cbs),
    clutchKick: { ...d.clutchKick, ...g.clutchKick },
    hooligan: { ...d.hooligan, ...g.hooligan },
    crashPitch: g.crashPitch ?? d.crashPitch,
  }
}

/**
 * Create a two-wheel rig around a supplied body. The host attaches it with
 * `raycast.addToWorld(world)` and owns the world. Spawns in P (held by the brakes) unless
 * `parked` is false, like `createWheeledVehicle`.
 */
export function createTwoWheeledVehicle(
  body: Body,
  definition: WheeledDefinition,
  options: { parked?: boolean } = {},
): TwoWheeledVehicle {
  const positive = (value: number) => Number.isFinite(value) && value > 0
  const geometry = definition.twoWheeled
  const tuning = geometry ? twoWheeledTuning(definition) : null
  if (
    !geometry ||
    !tuning ||
    !positive(body.mass) ||
    definition.hubs.length !== 2 ||
    definition.passive ||
    !definition.hubs.every((hub) => hub.length === 3 && hub.every(Number.isFinite)) ||
    !(definition.hubs[FRONT][2] < definition.hubs[REAR][2]) ||
    ![
      definition.wheelRadius,
      geometry.rearWheelRadius,
      geometry.steerLimit,
      definition.suspensionRest,
      definition.stiffness,
      definition.engineForce,
      definition.brakeForce,
      definition.suspensionTravel ?? 0.3,
      tuning.maxLean,
      tuning.fallLean,
      tuning.leanResponse,
      tuning.assistResponse,
      tuning.maxLeanAcceleration,
      tuning.steerRate,
      tuning.frontBrakeForce,
      tuning.rearBrakeForce,
      tuning.frictionSlip,
    ].every(positive) ||
    !(tuning.fallLean > tuning.maxLean) ||
    !(tuning.balanceSpeed >= 0) ||
    !(tuning.pitchAssist.wheelieMaxAngle > tuning.pitchAssist.wheelieSoftAngle) ||
    !(tuning.pitchAssist.stoppieMaxAngle > tuning.pitchAssist.stoppieSoftAngle) ||
    !(tuning.pitchAssist.wheelieNeutralAngle > 0) ||
    !(tuning.pitchAssist.stoppieNeutralAngle > 0) ||
    !validBrakeSplit(tuning.brakes) ||
    (tuning.rider &&
      (!tuning.rider.seat.every(Number.isFinite) ||
        !positive(tuning.rider.rate) ||
        !(tuning.rider.mass > 0 && tuning.rider.mass < body.mass))) ||
    (definition.powertrain && !isValidPowertrain(definition.powertrain))
  )
    throw new Error('Invalid two-wheeled vehicle definition')
  const rakeCosine = steeringRakeCosine(geometry.steeringAxis)
  const axisLength = Math.hypot(...geometry.steeringAxis)
  const raycast = new RaycastVehicle({
    chassisBody: body,
    indexRightAxis: 0,
    indexUpAxis: 1,
    indexForwardAxis: 2,
  })
  // As for road cars, the powertrain models drag itself; generic damping would hide power.
  if (definition.powertrain) body.linearDamping = 0
  definition.hubs.forEach(([x, y, z], i) =>
    raycast.addWheel({
      chassisConnectionPointLocal: new Vec3(x, y + definition.suspensionRest, z),
      directionLocal: new Vec3(0, -1, 0),
      axleLocal: new Vec3(1, 0, 0),
      radius: i === FRONT ? definition.wheelRadius : geometry.rearWheelRadius,
      suspensionRestLength: definition.suspensionRest,
      suspensionStiffness: definition.stiffness,
      dampingRelaxation: tuning.dampingRelaxation,
      dampingCompression: tuning.dampingCompression,
      frictionSlip: tuning.frictionSlip,
      maxSuspensionForce: 100000,
      maxSuspensionTravel: definition.suspensionTravel ?? 0.3,
    }),
  )
  const drivetrain = createDrivetrain()
  if (options.parked === false) Object.assign(drivetrain, { gear: 1, parked: false })
  if (tuning.rider)
    body.setCenterOfMass(
      ...riderCentreOfMass(tuning.rider.seat, [0, 0], tuning.rider.mass, body.mass),
    )
  return {
    body,
    raycast,
    definition,
    steer: 0,
    drivetrain,
    twoWheeled: {
      geometry,
      tuning,
      rakeCosine,
      steeringAxis: geometry.steeringAxis.map((v) => v / axisLength) as [number, number, number],
      wheelbase: Math.abs(definition.hubs[REAR][2] - definition.hubs[FRONT][2]),
      handlebar: 0,
      groundSteer: 0,
      lean: 0,
      targetLean: 0,
      fallen: false,
      lever: 0,
      pedal: 0,
      frontBrake: 0,
      rearBrake: 0,
      brakeLink: { linkedFront: 0, linkedRear: 0 },
      pitch: 0,
      pitchRate: 0,
      pitchReference: 0,
      previousPitch: null,
      wheelieScale: 1,
      stoppieScale: 1,
      riderShift: [0, 0],
      riderControl: { manualShare: 0, manualHold: 0 },
      acceleration: 0,
      previousSpeed: null,
      tuck: 0,
      tuckAuto: 0,
      hooligan: 'none',
      rearSpin: 0,
      rearSpinAngle: 0,
      crashed: false,
      slideClock: 0,
      comHeight: 0,
      clutchKick: 0,
      launchHeld: false,
      disturbance: 0,
      previousLean: null,
      previousLeanRate: null,
      previousCommand: 0,
    },
  }
}

/** Forget transient controller state, e.g. after an R reset uprighted the chassis. */
export function resetTwoWheeled(state: TwoWheeledState): void {
  state.handlebar = 0
  state.groundSteer = 0
  state.targetLean = 0
  state.fallen = false
  state.crashed = false
  state.tuck = 0
  state.tuckAuto = 0
  state.hooligan = 'none'
  state.rearSpin = 0
  state.riderControl = { manualShare: 0, manualHold: 0 }
  state.acceleration = 0
  state.previousSpeed = null
  state.disturbance = 0
  state.previousLean = null
  state.previousLeanRate = null
  state.previousCommand = 0
  state.previousPitch = null
  state.pitch = 0
  state.pitchRate = 0
  state.wheelieScale = 1
  state.stoppieScale = 1
  state.brakeLink.linkedFront = 0
  state.brakeLink.linkedRear = 0
  state.clutchKick = 0
}

/**
 * Apply one fixed tick of rider, steering, drive, brakes, pitch assist and lean control; call
 * before the world step. Input: `throttle` > 0 accelerates, < 0 is the hand lever (front brake,
 * or both wheels with CBS; there is no reverse gear); `handbrake` is the foot pedal (rear brake,
 * or both with CBS); `steering` is the bar demand (+1 full right); `rider` is the counterweight.
 * `gravityUp` is the local vertical (radial on a planet).
 */
export function stepTwoWheeledVehicle(
  v: TwoWheeledVehicle,
  input: WheeledInput,
  dt: number,
  active = true,
  powered = true,
  gravityUp: Vec3 = new Vec3(0, 1, 0),
  gravity: number = simulationDefaults.gravity,
): void {
  if (
    !Number.isFinite(dt) ||
    dt < 0 ||
    !Number.isFinite(input.throttle) ||
    !Number.isFinite(input.steering) ||
    Math.abs(input.throttle) > 1 ||
    Math.abs(input.steering) > 1
  )
    throw new Error('Expected finite nonnegative tick and normalized wheeled input')
  if (dt === 0) return
  const state = v.twoWheeled,
    tuning = state.tuning
  const forward = v.body.quaternion.vmult(new Vec3(0, 0, -1))
  const up = v.body.quaternion.vmult(new Vec3(0, 1, 0))
  const speed = v.body.velocity.dot(forward)
  const tune = v.definition.powertrain
  const rearRadius = state.geometry.rearWheelRadius
  const wheels = v.raycast.wheelInfos
  const contact = (i: number) => v.raycast.controller?.wheelIsInContact(i) ?? wheels[i].isInContact
  const frontContact = contact(FRONT),
    rearContact = contact(REAR)

  // Longitudinal acceleration, low-passed (~0.15 s) for the automatic rider.
  if (state.previousSpeed !== null) {
    const raw = (speed - state.previousSpeed) / dt
    state.acceleration += (raw - state.acceleration) * Math.min(1, dt / 0.15)
  }
  state.previousSpeed = speed

  // Shift hooligan modifier: assists, combined brakes and automatic fore-aft rider moves off.
  const hooligan = tuning.hooligan.enabled && active && powered && input.launch && !state.crashed

  // Rider counterweight: the rider moves at a finite rate and carries the centre of mass along.
  // The keys drive it when pressed; otherwise the automatic rider does (see `autoRiderInput`).
  const rider = tuning.rider
  if (rider) {
    let target: [number, number] = [0, 0]
    if (active && powered) {
      const keys = input.rider ?? { right: 0, forward: 0 }
      const pressed = Math.abs(keys.right) > 0.01 || Math.abs(keys.forward) > 0.01
      state.riderControl = stepRiderControl(state.riderControl, pressed, rider.auto, dt)
      const auto = autoRiderInput(
        {
          lean: state.lean,
          maxLean: tuning.maxLean,
          steering: input.steering,
          acceleration: state.acceleration,
          gravity,
          throttle: Math.max(0, input.throttle),
          lever: Math.max(0, -input.throttle),
        },
        rider.auto,
      )
      // With Shift held the rider stays put fore and aft unless the keys move them.
      if (hooligan) auto[1] = 0
      const share = state.riderControl.manualShare
      // Tuck behind the screen: automatic eased ramp with hysteresis, or the forward key at speed.
      const kmh = Math.abs(speed) * 3.6
      state.tuckAuto = autoTuckDepth(
        state.tuckAuto,
        kmh,
        Math.max(0, -state.acceleration / gravity),
        rider.tuck,
      )
      const tuckGoal = tuckTarget(state.tuckAuto, keys.forward, kmh, share, rider.tuck)
      const tuckStep = dt / Math.max(1e-3, rider.tuck.seconds)
      state.tuck += clamp(tuckGoal - state.tuck, -tuckStep, tuckStep)
      target = riderTarget(
        keys.right * share + auto[0] * (1 - share),
        keys.forward * share + auto[1] * (1 - share),
        rider,
      )
    } else {
      state.riderControl = { manualShare: 0, manualHold: 0 }
      state.tuckAuto = 0
      state.tuck = Math.max(0, state.tuck - dt / Math.max(1e-3, rider.tuck.seconds))
    }
    state.riderShift = stepRider(state.riderShift, target, rider, dt)
    v.body.setCenterOfMass(
      ...riderCentreOfMass(rider.seat, state.riderShift, rider.mass, v.body.mass),
    )
  }
  state.comHeight = centreOfMassHeight(v)
  measureGroundPitch(v, dt, forward, frontContact, rearContact, gravityUp)
  // Shift held (assists off): looping a wheelie or going over the front is a crash until R.
  // The chassis angle against the horizontal is used, since the wheel rays lose the ground first.
  const nose = Math.asin(clamp(forward.dot(gravityUp), -1, 1))
  if (hooligan && (Math.abs(nose) > tuning.crashPitch || up.dot(gravityUp) < 0))
    state.crashed = true

  // Handlebar about the steering axis; the ground angle follows through the rake. A sideways
  // rider shift adds a little body steering towards that side.
  // Only key-driven shifts steer: the automatic rider follows the turn instead of starting one.
  const bodySteer =
    rider && rider.lateral > 0
      ? (rider.steer * state.riderShift[0] * state.riderControl.manualShare) / rider.lateral
      : 0
  const barTarget =
    active && powered
      ? handlebarTarget(clamp(input.steering + bodySteer, -1, 1), speed, {
          steerLimit: state.geometry.steerLimit,
          maxLean: tuning.maxLean,
          rakeCosine: state.rakeCosine,
          wheelbase: state.wheelbase,
          gravity,
        })
      : 0
  state.handlebar += clamp(
    barTarget - state.handlebar,
    -tuning.steerRate * dt,
    tuning.steerRate * dt,
  )
  state.handlebar = clamp(state.handlebar, -state.geometry.steerLimit, state.geometry.steerLimit)
  state.groundSteer = groundSteerAngle(state.handlebar, state.rakeCosine)
  v.steer = state.handlebar

  // Start-up sequence after entering: P is kept and the controls do nothing until it ends.
  const starting = stepIgnition(v.drivetrain, dt, tune?.idleRpm ?? roadVehicleDefaults.idleRpm)
  const throttle =
    active && powered && !starting && !state.crashed ? Math.max(0, input.throttle) : 0
  state.lever = active ? clamp(Math.max(-input.throttle, input.lever ?? 0), 0, 1) : 0
  state.pedal = active && input.handbrake ? 1 : 0
  const brakes = stepCombinedBrakes(
    state.brakeLink,
    state.lever,
    state.pedal,
    hooligan ? independentBrakes : tuning.brakes,
    dt,
  )
  const hoo = tuning.hooligan
  const riderBack = rider && rider.back > 0 ? clamp(state.riderShift[1] / rider.back, 0, 1) : 0
  const burnoutShare = clamp(1 - (Math.abs(speed) - hoo.burnoutSpeed) / hoo.burnoutFade, 0, 1)
  state.hooligan = !hooligan
    ? 'none'
    : throttle > 0.3 && state.lever > 0.3 && state.pedal > 0 && Math.abs(speed) < 2
      ? 'stationary-burnout'
      : throttle > 0.3 && state.lever < 0.05 && riderBack >= hoo.wheelieRiderBack
        ? 'wheelie'
        : throttle > 0.3 && state.lever < 0.05 && state.pedal === 0 && burnoutShare > 0
          ? 'burnout'
          : state.lever > 0.3 && throttle < 0.05
            ? 'stoppie'
            : 'none'
  if (tune) {
    stepDrivetrain(v.drivetrain, tune, rearRadius, speed, throttle, state.pedal > 0, dt)
    if (
      powered &&
      throttle < 0.01 &&
      v.drivetrain.shiftRemaining === 0 &&
      (frontContact || rearContact)
    ) {
      const retention = engineBrakingForce(v.drivetrain, tune, rearRadius, speed)
      v.body.applyForce(forward.scale(clamp(retention, -v.body.mass * 2.5, v.body.mass * 2.5)))
    }
  } else {
    const gearbox = gearboxTuning()
    const changing = selectDriveDirection(v.drivetrain, speed, throttle, dt, gearbox)
    v.drivetrain.shiftRemaining = Math.max(0, v.drivetrain.shiftRemaining - dt)
    const share = v.drivetrain.shiftRemaining > 0 ? gearbox.torqueFraction : 1
    v.drivetrain.force = changing ? 0 : throttle * v.definition.engineForce * share
    v.drivetrain.load = changing ? 0 : throttle * share
    v.drivetrain.rpm +=
      ((powered ? roadVehicleDefaults.idleRpm + v.drivetrain.load * 1800 : 0) - v.drivetrain.rpm) *
      Math.min(1, dt * 8)
  }
  if (v.drivetrain.ignition === 'cranking') v.drivetrain.rpm = ignitionRpm(v.drivetrain)
  // Aerodynamic drag and rolling resistance (`dragFactor` is an unverified placeholder).
  {
    const velocity = v.body.velocity
    const magnitude = velocity.length()
    const rolling =
      frontContact || rearContact ? 0.012 * v.body.mass * simulationDefaults.gravity : 0
    v.body.applyForce(
      velocity.scale(-tuning.dragFactor * magnitude - rolling / Math.max(1, magnitude)),
    )
  }
  holdInPark(v, forward, speed, dt)

  // Wheelie / stoppie assist: fade the lifting force near the limit, restore past it.
  const assist = tuning.pitchAssist
  let pitchAcceleration = 0
  state.wheelieScale = 1
  state.stoppieScale = 1
  // With a rider model the assist allows the full wheelie (stoppie) only as far as the rider
  // has moved back (forward); a centred rider gets a small lift at most.
  const back = rider && rider.back > 0 ? clamp(state.riderShift[1] / rider.back, 0, 1) : 1
  const ahead = rider && rider.forward > 0 ? clamp(-state.riderShift[1] / rider.forward, 0, 1) : 1
  const blend = (neutral: number, full: number, share: number) => neutral + (full - neutral) * share
  // The Shift modifier turns both assists off.
  if (rearContact && !frontContact && assist.wheelie && !hooligan) {
    const out = pitchAssist({
      angle: state.pitch,
      rate: state.pitchRate,
      softAngle: assist.wheelieSoftAngle * back,
      maxAngle: blend(assist.wheelieNeutralAngle, assist.wheelieMaxAngle, back),
      floor: 0,
      response: assist.response,
      dampingRatio: assist.dampingRatio,
      landingRate: assist.landingRate,
      anticipation: assist.anticipation,
    })
    state.wheelieScale = out.scale
    pitchAcceleration = out.acceleration
  } else if (frontContact && !rearContact && assist.stoppie && !hooligan) {
    const out = pitchAssist({
      angle: -state.pitch,
      rate: -state.pitchRate,
      softAngle: assist.stoppieSoftAngle * ahead,
      maxAngle: blend(assist.stoppieNeutralAngle, assist.stoppieMaxAngle, ahead),
      floor: assist.stoppieMinBrake,
      response: assist.response,
      dampingRatio: assist.dampingRatio,
      landingRate: assist.landingRate,
      anticipation: assist.anticipation,
    })
    state.stoppieScale = out.scale
    pitchAcceleration = -out.acceleration
  }
  // Shift wheelie / stoppie: no assist and no angle limit. The rider feathers throttle (lever)
  // so the pitch keeps rising at about `wheelieRate` (`stoppieRate`): release Shift (or the
  // throttle / lever) to bring it back down; held too long it loops or goes over the front.
  const rise =
    // Near vertical the rear ray loses the ground first; keep pushing past the balance point.
    state.hooligan === 'wheelie' && (rearContact || nose > 0.8)
      ? hoo.wheelieRate
      : state.hooligan === 'stoppie' && frontContact && (!rearContact || Math.abs(speed) > 1)
        ? -hoo.stoppieRate
        : 0
  state.frontBrake =
    brakes.front * state.stoppieScale * (state.hooligan === 'stoppie' ? hoo.stoppieBrake : 1)
  state.rearBrake = brakes.rear
  if (pitchAcceleration !== 0) {
    // Nose up is a positive rotation about the chassis +X (right) axis.
    const right = v.body.quaternion.vmult(new Vec3(1, 0, 0))
    v.body.applyTorque(right.scale(v.body.inertia.x * pitchAcceleration))
  }
  if (rise !== 0) {
    // Steer the pitch rate (about chassis +X) towards the rise the rider holds.
    const right = v.body.quaternion.vmult(new Vec3(1, 0, 0))
    const w = v.body.angularVelocity
    const current = w.dot(right)
    const change = (rise - current) * Math.min(1, hoo.riseResponse * dt)
    w.set(w.x + right.x * change, w.y + right.y * change, w.z + right.z * change)
  }
  // Clutch kick: on the Shift press with the throttle open in a low gear, a short burst of
  // extra drive (the engine's stored energy) that fades out linearly.
  const kick = tuning.clutchKick
  const launch = active && powered && input.launch
  if (
    launch &&
    !state.launchHeld &&
    throttle > 0.5 &&
    kick.gain > 0 &&
    kick.seconds > 0 &&
    v.drivetrain.gear >= 1 &&
    v.drivetrain.gear <= kick.maxGear &&
    rearContact
  )
    state.clutchKick = kick.seconds
  state.launchHeld = launch
  const kickShare =
    state.clutchKick > 0 && throttle > 0.5 ? (kick.gain * state.clutchKick) / kick.seconds : 0
  state.clutchKick = throttle > 0.5 ? Math.max(0, state.clutchKick - dt) : 0
  // Wheelspin: the rear surface speed runs ahead of the road in a burnout; the engine follows
  // the wheel, smoke and marks follow the slip, and only part of the drive reaches the road.
  const spinTarget =
    rearContact && (state.hooligan === 'burnout' || state.hooligan === 'stationary-burnout')
      ? hoo.spinSpeed * throttle * (state.hooligan === 'burnout' ? burnoutShare : 1)
      : 0
  state.rearSpin += clamp(spinTarget - state.rearSpin, -hoo.spinRate * dt, hoo.spinRate * dt)
  if (!rearContact) state.rearSpin = 0
  state.rearSpinAngle += (state.rearSpin / rearRadius) * dt
  const spinShare = hoo.spinSpeed > 0 ? clamp(state.rearSpin / hoo.spinSpeed, 0, 1) : 0
  if (tune && spinShare > 0.05) {
    const gear = Math.max(1, v.drivetrain.gear)
    const wheelRpm = ((Math.abs(speed) + state.rearSpin) / (2 * Math.PI * rearRadius)) * 60
    const coupled = wheelRpm * tune.ratios[Math.min(gear, tune.ratios.length) - 1] * tune.finalDrive
    const target = Math.min(tune.maxRpm ?? 6900, Math.max(v.drivetrain.rpm, coupled))
    v.drivetrain.rpm += (target - v.drivetrain.rpm) * (1 - Math.exp(-dt * 10))
    v.drivetrain.launchSlip = Math.max(v.drivetrain.launchSlip, spinShare)
  }
  const stationary = state.hooligan === 'stationary-burnout'
  const drive = stationary
    ? 0
    : v.drivetrain.force *
      (1 + kickShare) *
      state.wheelieScale *
      (state.hooligan === 'wheelie' ? hoo.wheelieDrive : 1) *
      (1 - (1 - hoo.burnoutTraction) * spinShare)
  // The spinning rear steps out a little: a gentle yaw wiggle while it slides.
  state.slideClock = state.hooligan === 'burnout' ? state.slideClock + dt : 0
  if (state.hooligan === 'burnout' && spinShare > 0.05 && hoo.slide > 0) {
    const yaw = Math.sin(state.slideClock * 2 * Math.PI * 0.8) * hoo.slide * spinShare
    v.body.applyTorque(gravityUp.scale(v.body.inertia.y * yaw))
  }
  v.raycast.setSteeringValue(state.groundSteer, FRONT)
  v.raycast.setSteeringValue(0, REAR)
  v.raycast.applyEngineForce(0, FRONT)
  v.raycast.applyEngineForce(drive, REAR)
  const hold = !active
    ? v.definition.brakeForce * (v.drivetrain.parked ? 1 : 0.4)
    : v.drivetrain.parked || v.drivetrain.changingDirection
      ? v.definition.brakeForce
      : 0
  const burnout = Boolean(tune) && v.drivetrain.burnout
  if (stationary) {
    // Front locked, the bike held in place; the rear spins on the spot (rearSpin).
    v.raycast.setBrake(tuning.frontBrakeForce * 2, FRONT)
    v.raycast.setBrake(v.definition.brakeForce, REAR)
  } else {
    v.raycast.setBrake(
      burnout
        ? tuning.frontBrakeForce * 2
        : Math.max(hold, state.frontBrake * tuning.frontBrakeForce),
      FRONT,
    )
    v.raycast.setBrake(burnout ? 0 : Math.max(hold, state.rearBrake * tuning.rearBrakeForce), REAR)
  }

  stepLean(v, dt, speed, forward, up, gravityUp, gravity)
}

/** Lean measurement, fall detection and the balance torque for one tick. */
function stepLean(
  v: TwoWheeledVehicle,
  dt: number,
  speed: number,
  forward: Vec3,
  up: Vec3,
  gravityUp: Vec3,
  gravity: number,
): void {
  const state = v.twoWheeled,
    tuning = state.tuning
  const measured = measureLean(
    [forward.x, forward.y, forward.z],
    [up.x, up.y, up.z],
    [gravityUp.x, gravityUp.y, gravityUp.z],
  )
  // Differentiate the measured lean. The body's reported angular velocity can carry a roll
  // component the integrated orientation does not show (observed with the ray-cast wheels),
  // which would bias the damping term; the first tick after a reset falls back to it.
  const w = v.body.angularVelocity
  const rate =
    state.previousLean !== null
      ? (measured.lean - state.previousLean) / dt
      : measureLeanRate([w.x, w.y, w.z], measured.heading)
  state.previousLean = measured.lean
  state.lean = measured.lean
  if (state.crashed) state.fallen = true
  else if (!state.fallen && Math.abs(state.lean) > tuning.fallLean) state.fallen = true
  else if (state.fallen && Math.abs(state.lean) < tuning.maxLean * 0.5) state.fallen = false
  if (!balanceActive(speed, state.fallen, tuning.balanceAssist, tuning.balanceSpeed)) {
    state.targetLean = 0
    state.disturbance = 0
    state.previousLeanRate = null
    state.previousCommand = 0
    return
  }
  // The whole machine plus rider takes the steady-turn lean; a rider shifted sideways moves the
  // centre of mass off the bike's plane, so the bike itself leans that much less (or more).
  state.targetLean =
    targetLean({
      speed,
      groundSteer: state.groundSteer,
      wheelbase: state.wheelbase,
      gravity,
      maxLean: tuning.maxLean,
    }) + hangOffLean(v.body.centerOfMass.x, state.comHeight)
  if (state.previousLeanRate !== null)
    state.disturbance = updateDisturbance(
      state.disturbance,
      (rate - state.previousLeanRate) / dt,
      state.previousCommand,
      dt,
      tuning.disturbanceResponse,
      tuning.maxLeanAcceleration * 3,
    )
  const command = leanAcceleration({
    lean: state.lean,
    leanRate: rate,
    target: state.targetLean,
    frequency: leanControlFrequency(speed, tuning),
    dampingRatio: tuning.leanDampingRatio,
    disturbance: state.disturbance,
    maxAcceleration: tuning.maxLeanAcceleration,
  })
  state.previousLeanRate = rate
  state.previousCommand = command
  // A sleeping, balanced machine stays asleep; anything else gets the balance torque.
  if (v.body.raw?.isSleeping() && Math.abs(command) < 1e-3) return
  // Left-positive roll is a rotation about −heading (the chassis +Z, pointing backwards).
  const [hx, hy, hz] = measured.heading
  const inertia = v.body.inertia.z
  v.body.applyTorque(new Vec3(-hx, -hy, -hz).scale(inertia * command))
}

/**
 * Height of the centre of mass above the ground under the wheels in contact (chassis frame,
 * along the suspension direction), metres. Falls back to the unloaded geometry in the air.
 */
function centreOfMassHeight(v: TwoWheeledVehicle): number {
  const wheels = v.raycast.wheelInfos
  const controller = v.raycast.controller
  const grounds: number[] = []
  wheels.forEach((wheel, i) => {
    const touching = controller?.wheelIsInContact(i) ?? wheel.isInContact
    const length = controller?.wheelSuspensionLength(i) ?? wheel.suspensionRestLength
    const ground = wheel.connection.y - length - wheel.radius
    if (touching || !controller) grounds.push(ground)
  })
  const fallback = wheels.map(
    (wheel) => wheel.connection.y - wheel.suspensionRestLength - wheel.radius,
  )
  const list = grounds.length ? grounds : fallback
  const ground = list.reduce((sum, value) => sum + value, 0) / list.length
  return Math.max(0.05, v.body.centerOfMass.y - ground)
}

/**
 * Ground-relative pitch for the wheelie / stoppie assist: the chassis forward axis against the
 * contact normal of the wheel that is still down (both: their mean), minus the squat measured
 * while both wheels touch. In the air there is no ground reference and the pitch holds.
 */
function measureGroundPitch(
  v: TwoWheeledVehicle,
  dt: number,
  forward: Vec3,
  frontContact: boolean,
  rearContact: boolean,
  gravityUp: Vec3,
): void {
  const state = v.twoWheeled
  const controller = v.raycast.controller
  const normalOf = (i: number): [number, number, number] => {
    const n = controller?.wheelContactNormal(i)
    return n ? [n.x, n.y, n.z] : [gravityUp.x, gravityUp.y, gravityUp.z]
  }
  if (!frontContact && !rearContact) {
    state.pitchRate = 0
    state.previousPitch = null
    return
  }
  let normal: [number, number, number]
  if (frontContact && rearContact) {
    const a = normalOf(FRONT),
      b = normalOf(REAR)
    normal = [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
  } else normal = normalOf(frontContact ? FRONT : REAR)
  const raw = measurePitch([forward.x, forward.y, forward.z], normal)
  if (frontContact && rearContact) {
    // Track the squat / dive with both wheels down so `pitch` reads zero on the ground.
    state.pitchReference =
      state.previousPitch === null
        ? raw
        : state.pitchReference + (raw - state.pitchReference) * (1 - Math.exp(-dt / 0.4))
  }
  const pitch = raw - state.pitchReference
  state.pitchRate = state.previousPitch === null ? 0 : (pitch - state.previousPitch) / dt
  state.previousPitch = pitch
  state.pitch = pitch
}

/** Visual articulation for the presentation rig (`render/vehicle-presentation/motorcycle-rig.ts`). */
export function twoWheeledPose(v: TwoWheeledVehicle): TwoWheeledPose {
  const controller = v.raycast.controller
  const wheels = v.raycast.wheelInfos
  const compression = (i: number) =>
    wheels[i].suspensionRestLength -
    (controller?.wheelSuspensionLength(i) ?? wheels[i].suspensionRestLength)
  return {
    steeringAngle: v.twoWheeled.handlebar,
    // The ray-cast wheel moves along chassis −Y; a telescopic fork slides along the head axis.
    frontCompression: compression(FRONT) / v.twoWheeled.rakeCosine,
    rearCompression: compression(REAR),
    frontRoll: controller?.wheelRotation(FRONT) ?? 0,
    // Wheelspin turns the rear faster than the road (same sign as forward rolling).
    rearRoll: (controller?.wheelRotation(REAR) ?? 0) + WHEEL_ROLL_SIGN * v.twoWheeled.rearSpinAngle,
    lean: v.twoWheeled.lean,
    fallen: v.twoWheeled.fallen,
    pitch: v.twoWheeled.pitch,
    riderShift: [...v.twoWheeled.riderShift],
    rearWheelSpeed: roadSpeed(v) + v.twoWheeled.rearSpin,
    roadSpeed: roadSpeed(v),
    tuck: v.twoWheeled.tuck,
    hooligan: v.twoWheeled.hooligan,
    crashed: v.twoWheeled.crashed,
  }
}

/** Sign of the ray-cast wheel rotation when rolling forwards (matches `wheelRotation`). */
const WHEEL_ROLL_SIGN = -1
/** Forward road speed of the chassis, m/s. */
function roadSpeed(v: TwoWheeledVehicle): number {
  return v.body.velocity.dot(v.body.quaternion.vmult(new Vec3(0, 0, -1)))
}
