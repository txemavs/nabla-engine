import { normalizeActionCamSettings, type ActionCamSettings } from './action-cam-settings.js'
export interface ActionCamMotion {
  side: number
  up: number
  pitch: number
  roll: number
}
const neutral = (): ActionCamMotion => ({ side: 0, up: 0, pitch: 0, roll: 0 })
/** Distance-driven foot rhythm; bounded head tilt, eased starts/stops and quieter aiming. */
export class ActionCam {
  private tuning = normalizeActionCamSettings({})
  get settings(): ActionCamSettings {
    return { ...this.tuning }
  }
  setSettings(settings: Partial<ActionCamSettings>): void {
    this.tuning = normalizeActionCamSettings({ ...this.tuning, ...settings })
  }
  resetSettings(): void {
    this.tuning = normalizeActionCamSettings({})
  }
  private phase = 0
  private strength = 0
  private lean = 0
  private lastYaw: number | undefined
  private aimScale = 1
  private motion = neutral()
  reset(): void {
    this.phase = this.strength = this.lean = 0
    this.lastYaw = undefined
    this.aimScale = 1
    this.motion = neutral()
  }
  step(
    dt: number,
    input: { speed: number; grounded: boolean; right: number; yaw: number; aim: number },
  ): ActionCamMotion {
    if (dt <= 0) return { ...this.motion }
    dt = Math.min(dt, 0.1)
    const tuning = this.tuning
    const blend = 1 - Math.exp(-tuning.response * dt)
    const speed = input.grounded ? Math.max(0, Math.min(tuning.maxSpeed, input.speed)) : 0
    this.strength += (Math.min(1.5, speed / tuning.referenceSpeed) - this.strength) * blend
    this.phase = (this.phase + (speed * dt * Math.PI * 2) / tuning.strideMetres) % (Math.PI * 2)
    const turn =
      this.lastYaw === undefined
        ? 0
        : Math.atan2(Math.sin(input.yaw - this.lastYaw), Math.cos(input.yaw - this.lastYaw)) / dt
    this.lastYaw = input.yaw
    const wantedLean =
      Math.max(
        -tuning.maxTurnRollRadians,
        Math.min(tuning.maxTurnRollRadians, -turn * tuning.turnLeanSeconds),
      ) -
      Math.max(-1, Math.min(1, input.right)) * tuning.strafeRollRadians
    this.lean += (wantedLean - this.lean) * blend
    this.aimScale +=
      (1 - Math.max(0, Math.min(1, input.aim)) * (1 - tuning.aimedScale) - this.aimScale) * blend
    const amplitude = this.strength * this.aimScale
    this.motion = {
      side: Math.sin(this.phase) * tuning.swayMetres * amplitude,
      up: (Math.cos(this.phase * 2) - 1) * 0.5 * tuning.bobMetres * amplitude,
      pitch: Math.sin(this.phase * 2) * tuning.stepPitchRadians * amplitude,
      roll: (Math.sin(this.phase) * tuning.stepRollRadians + this.lean) * amplitude,
    }
    return { ...this.motion }
  }
}
