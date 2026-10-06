import { cameraRecovery, gameCameraDefaults, type GameCameraSettings } from '../../config/camera.js'
import { Euler, MathUtils, Quaternion, Vector3 } from 'three'

const carEyes: readonly number[] = [0, -0.15, -0.36]

/** One rigid seat anchor for the driver's eyes and visible monitor. */
export function driverHeadPose(
  driver: readonly number[],
  rotation: readonly number[],
  isCarrier: boolean,
  yaw = 0,
  pitch = gameCameraDefaults.headPitch,
  offset?: readonly number[],
  eyeRotation?: readonly number[],
): { position: Vector3; quaternion: Quaternion } {
  const body = new Quaternion().fromArray(rotation)
  // Cars saved before the 10 cm forward shift still store the old eye.
  const eyes =
    !isCarrier && offset?.[0] === 0 && offset[1] === -0.15 && offset[2] === -0.26
      ? carEyes
      : (offset ?? (isCarrier ? [0, -0.1, 0.2] : carEyes))
  return {
    position: new Vector3()
      .fromArray(eyes)
      .applyQuaternion(body)
      .add(new Vector3().fromArray(driver)),
    quaternion: body
      .multiply(new Quaternion().fromArray(eyeRotation ?? [0, 0, 0, 1]))
      .multiply(new Quaternion().setFromEuler(new Euler(-pitch, yaw, 0, 'YXZ'))),
  }
}

/** Configurable manual-look grace, then speed-aware damping and bounded corner anticipation. */
export function followDrivingHeading(
  yaw: number,
  heading: number,
  turnRate: number,
  speed: number,
  elapsed: number,
  sinceLookMs: number,
  settings: Readonly<GameCameraSettings> = gameCameraDefaults,
): number {
  const resume = cameraRecovery(sinceLookMs, settings)
  const anticipation = MathUtils.clamp(
    turnRate * settings.turnAnticipationSeconds,
    -settings.maxTurnAnticipation,
    settings.maxTurnAnticipation,
  )
  const wanted =
    heading +
    anticipation *
      MathUtils.smoothstep(speed, settings.anticipationMinSpeed, settings.anticipationFullSpeed)
  const error = Math.atan2(Math.sin(wanted - yaw), Math.cos(wanted - yaw))
  return (
    yaw +
    error *
      (1 -
        Math.exp(
          -(
            settings.headingDamping +
            Math.min(speed / settings.speedDampingDivisor, settings.maxSpeedDamping)
          ) * Math.min(Math.max(elapsed, 0), settings.maxStepSeconds),
        )) *
      resume
  )
}

/** Filter suspension noise before it can change camera framing or anticipated yaw. */
export class DrivingTelemetry {
  /** Use the owning camera settings for telemetry filtering. */
  constructor(private readonly settings: Readonly<GameCameraSettings> = gameCameraDefaults) {}
  speed = 0
  turnRate = 0
  private vehicleId: string | null = null
  update(id: string | null, speed: number, turnRate: number, elapsed: number, reset = false): void {
    if (id !== this.vehicleId || reset) {
      this.vehicleId = id
      this.speed = speed
      this.turnRate = 0
      return
    }
    const alpha =
      1 -
      Math.exp(
        -this.settings.telemetryDamping *
          Math.min(Math.max(elapsed, 0), this.settings.maxStepSeconds),
      )
    this.speed += (speed - this.speed) * alpha
    this.turnRate += (turnRate - this.turnRate) * alpha
  }
}

/** Overhead view: local ground normal below the camera, vehicle nose toward screen top. */
export function overheadDrivingPose(
  position: readonly number[],
  rotation: readonly number[],
  height: number,
  groundUp = new Vector3(0, 1, 0),
  lookAhead = 0,
): { position: Vector3; up: Vector3; target: Vector3 } {
  const body = new Quaternion().fromArray(rotation)
  const normal = groundUp.clone().normalize()
  const up = new Vector3(0, 0, -1).applyQuaternion(body).projectOnPlane(normal)
  if (up.lengthSq() < 1e-6) up.crossVectors(normal, new Vector3(1, 0, 0).applyQuaternion(body))
  up.normalize()
  const target = new Vector3().fromArray(position).addScaledVector(up, lookAhead)
  return {
    position: target.clone().addScaledVector(normal, height),
    target,
    up,
  }
}

/**
 * On-foot overhead height: `footMapHeight` × zoom (0.75–3× by default, so about 13–54 m),
 * plus the same speed allowance as driving. Unlike the vehicle map, zooming in below the
 * base height is allowed because a walking player fills very little of the frame.
 */
export function overheadFootHeight(
  speed: number,
  zoom = 1,
  settings: Readonly<GameCameraSettings> = gameCameraDefaults,
): number {
  return MathUtils.clamp(
    (settings.footMapHeight + Math.max(0, speed) * settings.mapSpeedSeconds) *
      MathUtils.clamp(zoom, settings.mapMinZoom, settings.mapMaxZoom),
    settings.footMapHeight * settings.mapMinZoom,
    settings.mapMaxHeight,
  )
}

/** Driving map: roughly 30 m ahead at rest, with two seconds of extra road at speed. */
export function overheadDrivingHeight(
  speed: number,
  zoom = 1,
  settings: Readonly<GameCameraSettings> = gameCameraDefaults,
): number {
  return MathUtils.clamp(
    (settings.mapHeight + Math.max(0, speed) * settings.mapSpeedSeconds) *
      MathUtils.clamp(zoom, settings.mapMinZoom, settings.mapMaxZoom),
    settings.mapHeight,
    settings.mapMaxHeight,
  )
}

const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle))
const identity = new Quaternion()

/**
 * One exact step of a critically damped spring: `error` (value minus target) and its rate after
 * `dt` seconds at natural frequency `omega`. Unconditionally stable for any step length.
 */
export function criticalStep(
  error: number,
  errorRate: number,
  omega: number,
  dt: number,
): [error: number, errorRate: number] {
  const decay = Math.exp(-omega * dt)
  const k = errorRate + omega * error
  return [(error + k * dt) * decay, (errorRate - k * omega * dt) * decay]
}

/** World direction of a ground-frame heading (chase-yaw convention: 0 looks along -Z). */
export function headingDirection(heading: number, frame: Quaternion | null = null): Vector3 {
  return new Vector3(-Math.sin(heading), 0, -Math.cos(heading)).applyQuaternion(frame ?? identity)
}

/**
 * Roll-independent, smoothed horizontal heading of a vehicle for the exterior cameras.
 *
 * The raw chassis heading is useless in a rollover: projecting the nose onto the ground
 * collapses when it points up or down, flips by 180 degrees as the car goes over, and the
 * chassis spins far faster than a camera should turn. This tracker therefore:
 *
 * - aims at the chassis forward axis projected onto the ground plane while the car is upright;
 * - detects tumbling (up axis leaning past `tumbleUprightness`, nose steeply up or down, or the
 *   up axis swinging faster than `tumbleTiltRate`) and leaves it only after
 *   `tumbleSettleSeconds` upright and calm (hysteresis);
 * - while tumbling, aims along the line of horizontal travel (the nearer of its two
 *   directions) above `tumbleTrackSpeed` and otherwise holds the last heading;
 * - follows the aim with a critically damped spring (`mapHeadingResponse`, with yaw-rate
 *   feed-forward so steady turns have no lag) and clamps the turn rate (`mapMaxYawRate`);
 *   while tumbling it switches to the much calmer `tumbleHeadingResponse` /
 *   `tumbleMaxYawRate` and eases back over `tumbleRecoverySeconds` after the car settles.
 *
 * Headings are measured in the player frame (identity on open ground), in the chase-yaw
 * convention `atan2(-forward.x, -forward.z)`.
 */
export class GroundHeading {
  /** Smoothed heading, radians. */
  heading = 0
  /** Heading rate, radians per second. */
  rate = 0
  /** Heading the tracker aims for: the upright chassis heading, or the tumble aim. */
  target = 0
  /** True from the first sign of a rollover until the car has settled upright. */
  tumbling = false
  /** 0 while tumbling, rising to 1 over `tumbleRecoverySeconds` after it settles. */
  calm = 1
  private id: string | null = null
  private readonly up = new Vector3(0, 1, 0)
  private readonly position = new Vector3()
  private readonly velocity = new Vector3()
  private tiltRate = 0
  private settled = 0
  private targetRate = 0
  private tracking = false

  constructor(private readonly settings: Readonly<GameCameraSettings> = gameCameraDefaults) {}

  /** Forget the vehicle; the next `update` seeds the heading from the chassis. */
  clear(): void {
    this.id = null
  }

  /**
   * Advance with the vehicle's interpolated pose. `frame` is the player frame rotation (null on
   * open ground); `dt` is seconds. A new vehicle id re-seeds every filter.
   */
  update(
    id: string,
    position: readonly number[],
    rotation: readonly number[],
    frame: Quaternion | null,
    dt: number,
  ): void {
    const s = this.settings
    const inverse = (frame ?? identity).clone().invert()
    const body = inverse.clone().multiply(new Quaternion().fromArray(rotation))
    const forward = new Vector3(0, 0, -1).applyQuaternion(body)
    const up = new Vector3(0, 1, 0).applyQuaternion(body)
    const local = new Vector3().fromArray(position).applyQuaternion(inverse)
    const flat = Math.hypot(forward.x, forward.z)
    const chassis = Math.atan2(-forward.x, -forward.z)
    if (id !== this.id) {
      this.id = id
      this.heading = this.target = chassis
      this.rate = this.targetRate = this.tiltRate = this.settled = 0
      this.tumbling = false
      this.calm = 1
      this.tracking = true
      this.up.copy(up)
      this.position.copy(local)
      this.velocity.set(0, 0, 0)
      return
    }
    const step = Math.min(Math.max(dt, 0), s.maxStepSeconds)
    if (step <= 0) return

    // Horizontal travel, low-passed so impacts do not yank the aim.
    const travel = local.clone().sub(this.position).divideScalar(step)
    travel.y = 0
    this.position.copy(local)
    this.velocity.lerp(travel, 1 - Math.exp(-8 * step))
    // How fast the up axis swings (roll and pitch; yaw leaves it alone), peak-held.
    const swing = this.up.angleTo(up) / step
    this.up.copy(up)
    this.tiltRate = Math.max(swing, this.tiltRate * Math.exp(-8 * step))

    const upset = up.y < s.tumbleUprightness || flat < 0.5 || this.tiltRate > s.tumbleTiltRate
    const steady =
      up.y > MathUtils.lerp(s.tumbleUprightness, 1, 0.6) &&
      flat > 0.7 &&
      this.tiltRate < s.tumbleTiltRate / 2
    if (upset) {
      this.tumbling = true
      this.settled = 0
    } else if (this.tumbling) {
      this.settled = steady ? this.settled + step : 0
      if (this.settled >= s.tumbleSettleSeconds) this.tumbling = false
    }
    this.calm = this.tumbling
      ? 0
      : s.tumbleRecoverySeconds > 0
        ? Math.min(1, this.calm + step / s.tumbleRecoverySeconds)
        : 1

    const previous = this.target
    if (!this.tumbling) {
      this.target = chassis
      this.targetRate = this.tracking
        ? MathUtils.clamp(wrapAngle(chassis - previous) / step, -s.mapMaxYawRate, s.mapMaxYawRate)
        : 0
      this.tracking = true
    } else {
      this.tracking = false
      this.targetRate = 0
      if (Math.hypot(this.velocity.x, this.velocity.z) > s.tumbleTrackSpeed) {
        const along = Math.atan2(-this.velocity.x, -this.velocity.z)
        this.target =
          Math.abs(wrapAngle(along - this.heading)) <= Math.PI / 2
            ? along
            : wrapAngle(along + Math.PI)
      }
    }

    // Ease-in back to the driving response so the post-crash turn to the new nose is gentle.
    const blend = this.calm * this.calm
    const omega = MathUtils.lerp(s.tumbleHeadingResponse, s.mapHeadingResponse, blend)
    const maxRate = MathUtils.lerp(s.tumbleMaxYawRate, s.mapMaxYawRate, blend)
    // Error against where the aim was at the start of the step (it moves at targetRate).
    const start = this.target - this.targetRate * step
    const [error, errorRate] = criticalStep(
      wrapAngle(this.heading - start),
      this.rate - this.targetRate,
      omega,
      step,
    )
    const delta = MathUtils.clamp(
      wrapAngle(this.target + error - this.heading),
      -maxRate * step,
      maxRate * step,
    )
    this.heading = wrapAngle(this.heading + delta)
    this.rate = MathUtils.clamp(this.targetRate + errorRate, -maxRate, maxRate)
  }
}

/**
 * Critically damped 3D follower with velocity feed-forward: tracks a moving point with no lag
 * at constant velocity while filtering jolts (rollover impacts, bounces). Jumps of more than
 * 50 m (teleports, vehicle changes) snap.
 */
export class CriticalFollow {
  /** Smoothed position. */
  readonly position = new Vector3()
  /** Smoothed velocity, m/s. */
  readonly velocity = new Vector3()
  private readonly last = new Vector3()
  private readonly feed = new Vector3()
  private ready = false

  /** Snap to `target` with zero velocity. */
  reset(target?: Vector3): void {
    this.ready = !!target
    if (!target) return
    this.position.copy(target)
    this.last.copy(target)
    this.velocity.set(0, 0, 0)
    this.feed.set(0, 0, 0)
  }

  /** Advance toward `target` over `dt` seconds (capped at `maxStep`) at response `omega`. */
  update(target: Vector3, dt: number, omega: number, maxStep = gameCameraDefaults.maxStepSeconds) {
    if (!this.ready || this.last.distanceTo(target) > 50) {
      this.reset(target)
      return this.position
    }
    const step = Math.min(Math.max(dt, 0), maxStep)
    if (step <= 0) return this.position
    const travel = target.clone().sub(this.last).divideScalar(step)
    this.last.copy(target)
    this.feed.lerp(travel, 1 - Math.exp(-10 * step))
    const start = target.clone().addScaledVector(this.feed, -step)
    for (const axis of ['x', 'y', 'z'] as const) {
      const [error, errorRate] = criticalStep(
        this.position[axis] - start[axis],
        this.velocity[axis] - this.feed[axis],
        omega,
        step,
      )
      this.position[axis] = target[axis] + error
      this.velocity[axis] = this.feed[axis] + errorRate
    }
    return this.position
  }
}
