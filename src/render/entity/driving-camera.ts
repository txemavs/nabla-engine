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
