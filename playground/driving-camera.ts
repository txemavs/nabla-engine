import { Euler, MathUtils, Quaternion, Vector3 } from 'three'

/** One rigid seat anchor for the driver's eyes and visible monitor. */
export function driverHeadPose(
  driver: readonly number[],
  rotation: readonly number[],
  isCarrier: boolean,
  yaw = 0,
  pitch = 0.05,
): { position: Vector3; quaternion: Quaternion } {
  const body = new Quaternion().fromArray(rotation)
  return {
    position: new Vector3(0, isCarrier ? -0.1 : -0.15, isCarrier ? 0.2 : -0.26)
      .applyQuaternion(body)
      .add(new Vector3().fromArray(driver)),
    quaternion: body.multiply(new Quaternion().setFromEuler(new Euler(-pitch, yaw, 0, 'YXZ'))),
  }
}

/** Brief manual-look grace, then speed-aware damping and bounded corner anticipation. */
export function followDrivingHeading(
  yaw: number,
  heading: number,
  turnRate: number,
  speed: number,
  elapsed: number,
  sinceLookMs: number,
): number {
  const resume = MathUtils.smoothstep(sinceLookMs, 900, 1400)
  const anticipation = MathUtils.clamp(turnRate * 0.22, -0.3, 0.3)
  const wanted = heading + anticipation * MathUtils.smoothstep(speed, 1, 8)
  const error = Math.atan2(Math.sin(wanted - yaw), Math.cos(wanted - yaw))
  return (
    yaw +
    error *
      (1 - Math.exp(-(7 + Math.min(speed / 5, 5)) * Math.min(Math.max(elapsed, 0), 0.1))) *
      resume
  )
}

/** Filter suspension noise before it can change camera framing or anticipated yaw. */
export class DrivingTelemetry {
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
    const alpha = 1 - Math.exp(-5 * Math.min(Math.max(elapsed, 0), 0.1))
    this.speed += (speed - this.speed) * alpha
    this.turnRate += (turnRate - this.turnRate) * alpha
  }
}
