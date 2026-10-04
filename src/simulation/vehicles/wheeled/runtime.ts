import { Body, RaycastVehicle, Vec3 } from '../../physics.js'
import {
  createDrivetrain,
  stepDrivetrain,
  shiftGear,
  engineBrakingForce,
  type DrivetrainState,
} from '../drivetrain.js'
import {
  normalizeHubs,
  type HubDefinition,
  type WheeledDefinition,
  type WheeledInput,
  type WheeledTelemetry,
  type WheelContactSnapshot,
  type WheelVector,
} from './contracts.js'
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))

/** Borrowed body/rig in the host's single world; this module never steps or owns that world. */
export interface WheeledVehicle {
  body: Body
  raycast: RaycastVehicle
  definition: WheeledDefinition
  /** Normalized hub configurations derived from definition. */
  hubConfigs: HubDefinition[]
  steer: number
  drivetrain: DrivetrainState
}
/** Create a wheeled rig around a supplied body. Host attaches it with raycast.addToWorld(world). */
export function createWheeledVehicle(body: Body, definition: WheeledDefinition): WheeledVehicle {
  const positive = (value: number) => Number.isFinite(value) && value > 0
  const spec = definition.powertrain
  const hubConfigs = normalizeHubs(definition)
  if (
    !positive(body.mass) ||
    hubConfigs.length < 2 ||
    !hubConfigs.every(
      (hub) =>
        hub.position.length === 3 &&
        hub.position.every(Number.isFinite) &&
        (hub.radius === undefined || positive(hub.radius)),
    ) ||
    ![
      definition.wheelRadius,
      definition.suspensionRest,
      definition.stiffness,
      definition.engineForce,
      definition.brakeForce,
      definition.suspensionTravel ?? 0.3,
    ].every(positive) ||
    (spec &&
      (![spec.powerCv, spec.torqueNm, spec.finalDrive, spec.grip].every(positive) ||
        !spec.ratios.length ||
        !spec.ratios.every(positive)))
  )
    throw new Error('Invalid wheeled vehicle definition')
  const car = new RaycastVehicle({
    chassisBody: body,
    indexRightAxis: 0,
    indexUpAxis: 1,
    indexForwardAxis: 2,
  })
  if (definition.powertrain) body.linearDamping = 0
  for (const hub of hubConfigs) {
    const [x, y, z] = hub.position
    const radius = hub.radius ?? definition.wheelRadius
    car.addWheel({
      chassisConnectionPointLocal: new Vec3(x, y + definition.suspensionRest, z),
      directionLocal: new Vec3(0, -1, 0),
      axleLocal: new Vec3(1, 0, 0),
      radius,
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

  return { body, raycast: car, definition, hubConfigs, steer: 0, drivetrain: createDrivetrain() }
}
/** A docked car must share the carrier's damping; the host decides attachment/mode. */
export function syncWheeledDamping(v: WheeledVehicle, dockedDamping?: number): void {
  if (v.definition.powertrain) v.body.linearDamping = dockedDamping ?? 0
}

/** Check if a hub is steered based on normalized config. */
function isSteered(v: WheeledVehicle, i: number): boolean {
  return v.hubConfigs[i]?.steered ?? false
}

/** Check if a hub is driven based on normalized config. */
function isDriven(v: WheeledVehicle, i: number): boolean {
  return v.hubConfigs[i]?.driven ?? false
}

/** Check if a hub is a rear hub (Z > 0, behind center). Used for handbrake/burnout logic. */
function isRearHub(v: WheeledVehicle, i: number): boolean {
  const hub = v.hubConfigs[i]
  return hub ? hub.position[2] > 0 : i >= 2
}

/** Count driven hubs for force distribution. */
function drivenHubCount(v: WheeledVehicle): number {
  return v.hubConfigs.filter((h) => h.driven).length
}

/** Check if all driven hubs are on the same axle (for AWD launch logic). */
function hasAllWheelDrive(v: WheeledVehicle): boolean {
  const driven = v.hubConfigs.filter((h) => h.driven)
  if (driven.length < 2) return false
  const hasFront = driven.some((h) => h.position[2] < 0)
  const hasRear = driven.some((h) => h.position[2] > 0)
  return hasFront && hasRear
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
  const target =
    active && powered ? (-input.steering * 0.45) / (1 + v.body.velocity.length() * 0.035) : 0
  v.steer += clamp(target - v.steer, -dt * 1.8, dt * 1.8)
  const forward = v.body.quaternion.vmult(new Vec3(0, 0, -1))
  const speed = v.body.velocity.dot(forward)
  const opposing = active && input.throttle * speed < -0.8
  const tune = v.definition.powertrain
  const aggressiveLaunch =
    !!tune &&
    hasAllWheelDrive(v) &&
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
    const velocity = v.body.velocity
    const magnitude = velocity.length()
    const rolling = v.raycast.wheelInfos.some((wheel) => wheel.isInContact)
      ? 0.012 * v.body.mass * 9.81
      : 0
    v.body.applyForce(velocity.scale(-0.42 * magnitude - rolling / Math.max(1, magnitude)))
  }
  const numHubs = v.hubConfigs.length
  const numDriven = drivenHubCount(v)
  for (let i = 0; i < numHubs; i++) {
    const steered = isSteered(v, i)
    const driven = isDriven(v, i)
    const rear = isRearHub(v, i)

    v.raycast.setSteeringValue(steered ? v.steer : 0, i)

    const rearShare = v.drivetrain.burnout
      ? 1
      : active && input.handbrake
        ? 0.7
        : 0.55 + v.drivetrain.launchSlip * 0.15
    const share = hasAllWheelDrive(v)
      ? (rear ? rearShare : 1 - rearShare) / Math.max(1, numDriven / 2)
      : 1 / Math.max(1, numDriven)
    v.raycast.applyEngineForce(
      driven ? (tune ? v.drivetrain.force * share : throttle * v.definition.engineForce) : 0,
      i,
    )
    if (tune) {
      const desiredGrip =
        active && input.handbrake && rear
          ? 0.7
          : rear
            ? tune.grip * (1 - v.drivetrain.launchSlip * 0.6)
            : tune.grip
      const wheel = v.raycast.wheelInfos[i]
      wheel.frictionSlip += (desiredGrip - wheel.frictionSlip) * Math.min(1, dt * 8)
    }
    const brake = !active
      ? v.definition.brakeForce * 0.4
      : input.handbrake
        ? v.definition.brakeForce * (rear ? 1.5 : 0.4)
        : opposing
          ? v.definition.brakeForce
          : 0
    v.raycast.setBrake(
      tune && v.drivetrain.burnout ? (steered ? v.definition.brakeForce * 4 : 0) : brake,
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
    const rear = isRearHub(v, i)
    return {
      wheelCenter: tuple(wheel.worldTransform.position),
      contactPoint: contact ? point : null,
      contactNormal: contact ? [normal.x / length, normal.y / length, normal.z / length] : null,
      slip:
        contact && tireEffects
          ? Math.max(
              lateralSlip,
              rear ? v.drivetrain.launchSlip : 0,
              active && input.handbrake && rear ? Math.min(1, v.body.velocity.length() / 5) : 0,
            )
          : 0,
      suspensionLength: wheel.suspensionLength,
      isInContact: contact,
    }
  })
}
