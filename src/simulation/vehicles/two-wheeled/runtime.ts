/**
 * Minimal single-track (motorcycle) controller on the shared Rapier world. Phase 1:
 *
 * - one rigid chassis body and two Rapier ray-cast wheels (front, rear) with their own radii;
 * - the handlebar turns about the raked steering axis; the ground steer angle follows from it;
 * - a lean controller tracks the steady-turn lean for the current speed and steer, with a
 *   disturbance observer for the tyre and gravity roll moments, and a low-speed balance assist
 *   that keeps a stopped or crawling machine upright (configurable, never fake wheel contacts);
 * - separate front (negative throttle) and rear (handbrake input) brakes;
 * - the shared automatic gearbox and engine model (`drivetrain.ts`) on the rear wheel.
 *
 * Not modelled yet: countersteering dynamics, tyre camber/profile, rider weight shift, clutch,
 * combined (CBS) braking, wheelies and stoppies (a guard cuts power when the front lifts).
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
import type { TwoWheeledPose, TwoWheeledState, TwoWheeledTuning } from './contracts.js'

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
    wheelieGuard: d.wheelieGuard,
    dragFactor: d.dragFactor,
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
      frontBrake: 0,
      rearBrake: 0,
      wheelieCut: false,
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
  state.disturbance = 0
  state.previousLean = null
  state.previousLeanRate = null
  state.previousCommand = 0
  state.wheelieCut = false
}

/**
 * Apply one fixed tick of steering, drive, brakes and lean control; call before the world step.
 * Input: `throttle` > 0 accelerates, < 0 is the front brake (there is no reverse gear);
 * `handbrake` is the rear brake; `steering` is the bar demand (+1 full right).
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

  // Handlebar about the steering axis; the ground angle follows through the rake.
  const barTarget =
    active && powered
      ? handlebarTarget(input.steering, speed, {
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
  const throttle = active && powered && !starting ? Math.max(0, input.throttle) : 0
  state.frontBrake = active ? Math.max(0, -input.throttle) : 0
  state.rearBrake = active && input.handbrake ? 1 : 0
  if (tune) {
    stepDrivetrain(v.drivetrain, tune, rearRadius, speed, throttle, state.rearBrake > 0, dt)
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

  // Phase-1 wheelie guard: no drive while the front tyre is off the ground under power.
  state.wheelieCut = tuning.wheelieGuard && throttle > 0 && rearContact && !frontContact
  const drive = state.wheelieCut ? 0 : v.drivetrain.force
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
  v.raycast.setBrake(
    burnout
      ? tuning.frontBrakeForce * 2
      : Math.max(hold, state.frontBrake * tuning.frontBrakeForce),
    FRONT,
  )
  v.raycast.setBrake(burnout ? 0 : Math.max(hold, state.rearBrake * tuning.rearBrakeForce), REAR)

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
  if (!state.fallen && Math.abs(state.lean) > tuning.fallLean) state.fallen = true
  else if (state.fallen && Math.abs(state.lean) < tuning.maxLean * 0.5) state.fallen = false
  if (!balanceActive(speed, state.fallen, tuning.balanceAssist, tuning.balanceSpeed)) {
    state.targetLean = 0
    state.disturbance = 0
    state.previousLeanRate = null
    state.previousCommand = 0
    return
  }
  state.targetLean = targetLean({
    speed,
    groundSteer: state.groundSteer,
    wheelbase: state.wheelbase,
    gravity,
    maxLean: tuning.maxLean,
  })
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
    rearRoll: controller?.wheelRotation(REAR) ?? 0,
    lean: v.twoWheeled.lean,
    fallen: v.twoWheeled.fallen,
  }
}
