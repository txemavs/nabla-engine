import { simulationDefaults, roadVehicleDefaults } from '../../../config/simulation.js'
import { Body, RaycastVehicle, Vec3 } from '../../physics.js'
import {
  createDrivetrain,
  isDriven,
  stepDrivetrain,
  shiftGear,
  engineBrakingForce,
  selectDriveDirection,
  type DrivetrainState,
} from '../drivetrain.js'
import type {
  WheeledDefinition,
  WheeledInput,
  WheeledTelemetry,
  WheelContactSnapshot,
  WheelVector,
} from './contracts.js'
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))

/** Borrowed body/rig in the host's single world; this module never steps or owns that world. */
export interface WheeledVehicle {
  body: Body
  raycast: RaycastVehicle
  definition: WheeledDefinition
  steer: number
  drivetrain: DrivetrainState
}
/** Create a four-wheel rig around a supplied body. Host attaches it with raycast.addToWorld(world). */
export function createWheeledVehicle(body: Body, definition: WheeledDefinition): WheeledVehicle {
  const positive = (value: number) => Number.isFinite(value) && value > 0
  const spec = definition.powertrain
  if (
    !positive(body.mass) ||
    (definition.hubs.length !== 4 && !(definition.passive && definition.hubs.length === 6)) ||
    !definition.hubs.every((hub) => hub.length === 3 && hub.every(Number.isFinite)) ||
    ![
      definition.wheelRadius,
      definition.suspensionRest,
      definition.stiffness,
      definition.engineForce,
      definition.brakeForce,
      definition.suspensionTravel ?? 0.3,
    ].every(positive) ||
    ![undefined, 'front', 'rear', 'all'].includes(definition.drivenWheels) ||
    (spec &&
      (![spec.powerCv, spec.torqueNm, spec.finalDrive, spec.grip].every(positive) ||
        !spec.ratios.length ||
        !spec.ratios.every(positive) ||
        [spec.idleRpm, spec.maxRpm, spec.reverseRatio, spec.maxSpeedKmh].some(
          (value) => value !== undefined && !positive(value),
        ) ||
        (spec.idleRpm ?? 900) >= (spec.maxRpm ?? 6900)))
  )
    throw new Error('Invalid wheeled vehicle definition')
  const car = new RaycastVehicle({
    chassisBody: body,
    indexRightAxis: 0,
    indexUpAxis: 1,
    indexForwardAxis: 2,
  })
  // Tuned road cars already model aerodynamic drag below. Generic rigid-body
  // damping adds a large speed-proportional brake and hides the engine power.
  if (definition.powertrain || definition.passive) body.linearDamping = 0
  // Front is -Z; all hubs and suspension dimensions are body-local metres.
  for (const [x, y, z] of definition.hubs) {
    car.addWheel({
      chassisConnectionPointLocal: new Vec3(x, y + definition.suspensionRest, z),
      directionLocal: new Vec3(0, -1, 0),
      axleLocal: new Vec3(1, 0, 0),
      radius: definition.wheelRadius,
      suspensionRestLength: definition.suspensionRest,
      suspensionStiffness: definition.stiffness,
      dampingRelaxation: 2.3,
      dampingCompression: 4.4,
      frictionSlip: 4.5,
      rollInfluence: 0.04,
      maxSuspensionForce: 100000,
      maxSuspensionTravel: definition.suspensionTravel ?? 0.3,
    })
  }

  return { body, raycast: car, definition, steer: 0, drivetrain: createDrivetrain() }
}
/** A docked car must share the carrier's damping; the host decides attachment/mode. */
export function syncWheeledDamping(v: WheeledVehicle, dockedDamping?: number): void {
  if (v.definition.powertrain) v.body.linearDamping = dockedDamping ?? 0
}
/** Apply one fixed tick of forces/steering; call before the shared world's step. */
export function stepWheeledVehicle(
  v: WheeledVehicle,
  input: WheeledInput,
  dt: number,
  active = true,
  powered = true,
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
  if (v.definition.passive) {
    const velocity = v.body.velocity,
      speed = velocity.length()
    if (v.raycast.wheelInfos.some((wheel) => wheel.isInContact))
      v.body.applyForce(
        velocity.scale((-0.012 * v.body.mass * simulationDefaults.gravity) / Math.max(1, speed)),
      )
    for (let i = 0; i < v.raycast.wheelInfos.length; i++) {
      v.raycast.setSteeringValue(0, i)
      v.raycast.applyEngineForce(0, i)
      v.raycast.setBrake(!active || input.handbrake ? v.definition.brakeForce : 0, i)
    }
    return
  }
  const target =
    active && powered ? (-input.steering * 0.45) / (1 + v.body.velocity.length() * 0.035) : 0
  v.steer += clamp(target - v.steer, -dt * 1.8, dt * 1.8)
  const forward = v.body.quaternion.vmult(new Vec3(0, 0, -1))
  const speed = v.body.velocity.dot(forward)
  const opposing = active && input.throttle * speed < -0.8
  const driven = (i: number) => isDriven(v.definition.drivenWheels, i)
  const tune = v.definition.powertrain
  const aggressiveLaunch =
    !!tune &&
    v.definition.drivenWheels === 'all' &&
    active &&
    powered &&
    input.launch &&
    input.throttle >= 0 &&
    !input.handbrake &&
    speed > -0.8
  const throttle = active && powered && !opposing ? (aggressiveLaunch ? 1 : input.throttle) : 0
  if (tune) {
    stepDrivetrain(
      v.drivetrain,
      tune,
      v.definition.wheelRadius,
      speed,
      throttle,
      active && input.handbrake,
      dt,
      aggressiveLaunch,
    )
    if (
      powered &&
      Math.abs(throttle) < 0.01 &&
      v.drivetrain.shiftRemaining === 0 &&
      v.raycast.wheelInfos.some((w) => w.isInContact)
    ) {
      const retention = engineBrakingForce(v.drivetrain, tune, v.definition.wheelRadius, speed)
      v.body.applyForce(forward.scale(clamp(retention, -v.body.mass * 2.5, v.body.mass * 2.5)))
    }
    // Aerodynamic drag in the direction of travel; zero extra force on parked cars.
    const velocity = v.body.velocity
    const magnitude = velocity.length()
    const rolling = v.raycast.wheelInfos.some((wheel) => wheel.isInContact)
      ? 0.012 * v.body.mass * simulationDefaults.gravity
      : 0
    v.body.applyForce(velocity.scale(-0.42 * magnitude - rolling / Math.max(1, magnitude)))
  } else {
    const changing = selectDriveDirection(v.drivetrain, speed, throttle, dt)
    v.drivetrain.force = changing ? 0 : throttle * v.definition.engineForce
    v.drivetrain.load = changing ? 0 : Math.abs(throttle)
    v.drivetrain.rpm +=
      ((powered ? roadVehicleDefaults.idleRpm + v.drivetrain.load * 1800 : 0) - v.drivetrain.rpm) *
      Math.min(1, dt * 8)
  }
  for (let i = 0; i < 4; i++) {
    v.raycast.setSteeringValue(i < 2 ? v.steer : 0, i)
    const rearShare = v.drivetrain.burnout
      ? 1
      : active && input.handbrake
        ? 0.7
        : 0.55 + v.drivetrain.launchSlip * 0.15
    const share =
      v.definition.drivenWheels === 'all' ? (i < 2 ? 1 - rearShare : rearShare) / 2 : 0.5
    v.raycast.applyEngineForce(
      driven(i) ? (tune ? v.drivetrain.force * share : v.drivetrain.force) : 0,
      i,
    )
    if (tune) {
      const desiredGrip =
        active && input.handbrake && i >= 2
          ? 0.7
          : i >= 2
            ? tune.grip * (1 - v.drivetrain.launchSlip * 0.6)
            : tune.grip
      const wheel = v.raycast.wheelInfos[i]
      wheel.frictionSlip += (desiredGrip - wheel.frictionSlip) * Math.min(1, dt * 8)
    }
    const brake = !active
      ? v.definition.brakeForce * 0.4
      : input.handbrake
        ? v.definition.brakeForce * (i >= 2 ? 1.5 : 0.4)
        : opposing || v.drivetrain.pendingDirection !== null
          ? v.definition.brakeForce
          : 0
    v.raycast.setBrake(
      tune && v.drivetrain.burnout ? (i < 2 ? v.definition.brakeForce * 4 : 0) : brake,
      i,
    )
  }
}
/** Gear requests return domain results; UI messages belong to the facade/host. */
export function shiftWheeledVehicle(
  v: WheeledVehicle,
  direction: -1 | 1,
): 'shifted' | 'protected' | 'unavailable' {
  const spec = v.definition.powertrain
  if (!spec) return 'unavailable'
  const speed = v.body.velocity.dot(v.body.quaternion.vmult(new Vec3(0, 0, -1)))
  return shiftGear(v.drivetrain, spec, v.definition.wheelRadius, speed, direction)
    ? 'shifted'
    : 'protected'
}
export function automaticWheeledTransmission(v: WheeledVehicle): boolean {
  if (!v.definition.powertrain) return false
  v.drivetrain.manual = false
  return true
}
export function wheeledTelemetry(
  v: WheeledVehicle,
  input: WheeledInput,
  active: boolean,
  tireEffects = true,
): WheeledTelemetry {
  const signedSpeed = v.body.velocity.dot(v.body.quaternion.vmult(new Vec3(0, 0, -1)))
  return {
    speedMps: v.body.velocity.length(),
    signedSpeedMps: signedSpeed,
    steer: v.steer,
    rpm: v.drivetrain.rpm,
    gear: v.drivetrain.gear,
    manualTransmission: v.drivetrain.manual,
    engineLoad: v.drivetrain.load,
    braking: active && (input.handbrake || input.throttle * signedSpeed < -0.8),
    reversing:
      active && (signedSpeed < -0.15 || (input.throttle < 0 && Math.abs(signedSpeed) <= 0.15)),
    tireSlip: !tireEffects
      ? 0
      : active && v.drivetrain.burnout
        ? 1
        : Math.min(
            1,
            Math.abs(v.body.velocity.dot(v.body.quaternion.vmult(new Vec3(1, 0, 0)))) / 6,
          ),
  }
}
const tuple = (v: Vec3): WheelVector => [v.x, v.y, v.z]
export function wheelContacts(
  v: WheeledVehicle,
  input: WheeledInput,
  active: boolean,
  tireEffects = true,
): WheelContactSnapshot[] {
  const lateralSlip = wheeledTelemetry(v, input, active, tireEffects).tireSlip
  return v.raycast.wheelInfos.map((wheel, i) => {
    const normal = wheel.raycastResult.hitNormalWorld
    const length = normal.length()
    const point = tuple(wheel.raycastResult.hitPointWorld)
    const contact =
      wheel.isInContact && Number.isFinite(length) && length > 1e-8 && point.every(Number.isFinite)
    return {
      wheelCenter: tuple(wheel.worldTransform.position),
      contactPoint: contact ? point : null,
      contactNormal: contact ? [normal.x / length, normal.y / length, normal.z / length] : null,
      slip:
        contact && tireEffects
          ? Math.max(
              lateralSlip,
              i >= 2 ? v.drivetrain.launchSlip : 0,
              active && input.handbrake && i >= 2 ? Math.min(1, v.body.velocity.length() / 5) : 0,
            )
          : 0,
      suspensionLength: wheel.suspensionLength,
      isInContact: contact,
    }
  })
}
