import { controlDefaults } from '../config/controls.js'

export interface InputPreferences {
  /** Multiplier of the legacy radians-per-pixel sensitivity. */
  mouseSensitivity: number
  invertMouseY: boolean
  gamepadDeadzone: number
  steeringRiseSeconds: number
  steeringReleaseSeconds: number
}
export const inputPreferenceDefaults: Readonly<InputPreferences> = Object.freeze({
  mouseSensitivity: 1,
  invertMouseY: false,
  gamepadDeadzone: controlDefaults.gamepadDeadzone,
  steeringRiseSeconds: controlDefaults.steeringRiseSeconds,
  steeringReleaseSeconds: controlDefaults.steeringReleaseSeconds,
})
type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void }

/** Owns input tuning without mutating shared defaults or USB/XR calibration. */
export class RuntimeInputPreferences {
  private value: InputPreferences = { ...inputPreferenceDefaults }
  get settings(): InputPreferences {
    return { ...this.value }
  }
  restore(storage: Storage): void {
    try {
      this.apply(JSON.parse(storage.getItem('nabla.input') ?? '{}'))
    } catch {
      /* Optional storage. */
    }
  }
  private apply(patch: Partial<InputPreferences> | null): void {
    if (!patch || typeof patch !== 'object') return
    for (const [key, min, max] of [
      ['mouseSensitivity', 0.1, 4],
      ['gamepadDeadzone', 0, 0.5],
      ['steeringRiseSeconds', 0.01, 2],
      ['steeringReleaseSeconds', 0.01, 2],
    ] as const) {
      const value = patch[key]
      if (typeof value === 'number' && Number.isFinite(value))
        this.value[key] = Math.max(min, Math.min(max, value))
    }
    if (typeof patch.invertMouseY === 'boolean') this.value.invertMouseY = patch.invertMouseY
  }
  set(patch: Partial<InputPreferences>, storage: Storage): InputPreferences {
    this.apply(patch)
    try {
      storage.setItem('nabla.input', JSON.stringify(this.value))
    } catch {
      /* Keep live settings. */
    }
    return this.settings
  }
  mouseDelta(x: number, y: number): { yaw: number; pitch: number } {
    const sensitivity = controlDefaults.mouseSensitivity * this.value.mouseSensitivity
    return { yaw: -x * sensitivity, pitch: y * sensitivity * (this.value.invertMouseY ? -1 : 1) }
  }
}
