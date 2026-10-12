import { normalViewTuning } from '../config/gameplay-tuning.js'
/** Bounded free aim; camera catch-up preserves the total viewing direction. */
export class BodycamAim {
  enabled = false
  yaw = 0
  pitch = 0
  reset(): void {
    this.yaw = 0
    this.pitch = 0
  }
  move(yaw: number, pitch: number): { yaw: number; pitch: number } {
    const y = this.yaw + yaw,
      p = this.pitch + pitch
    this.yaw = Math.max(
      -normalViewTuning.yawLimitRadians,
      Math.min(normalViewTuning.yawLimitRadians, y),
    )
    this.pitch = Math.max(
      -normalViewTuning.pitchLimitRadians,
      Math.min(normalViewTuning.pitchLimitRadians, p),
    )
    return { yaw: y - this.yaw, pitch: p - this.pitch }
  }
  step(dt: number, aiming: boolean): { yaw: number; pitch: number } {
    const follow =
      1 -
      Math.exp(
        -Math.max(0, Math.min(0.1, dt)) *
          (aiming ? normalViewTuning.aimedFollowRate : normalViewTuning.followRate),
      )
    const yaw = this.yaw * follow,
      pitch = this.pitch * follow
    this.yaw -= yaw
    this.pitch -= pitch
    return { yaw, pitch }
  }
}
