import type { GameCameraSettings } from '../config/camera.js'
export interface CameraMotionPreferences {
  autoCenter: boolean
  autoCenterDelayMs: number
  autoCenterBlendMs: number
  modeTransitionMs: number
}
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>
/** Only framing recovery and ordinary view transitions; physical camera safety stays unchanged. */
export class RuntimeCameraMotionPreferences {
  private value: CameraMotionPreferences
  constructor(private readonly state: { settings: GameCameraSettings }) {
    const camera = state.settings
    this.value = {
      autoCenter: camera.autoCenterEnabled !== false,
      autoCenterDelayMs: camera.autoCenterDelayMs,
      autoCenterBlendMs: camera.autoCenterBlendMs,
      modeTransitionMs: camera.modeTransitionMs,
    }
  }
  get settings(): CameraMotionPreferences {
    return { ...this.value }
  }
  restore(storage: StoragePort): void {
    try {
      this.apply(JSON.parse(storage.getItem('nabla.cameraMotion') ?? '{}'))
    } catch {
      /* Optional storage. */
    }
  }
  private apply(patch: Partial<CameraMotionPreferences> | null): void {
    if (!patch || typeof patch !== 'object') return
    if (typeof patch.autoCenter === 'boolean') this.value.autoCenter = patch.autoCenter
    for (const [key, max] of [
      ['autoCenterDelayMs', 30000],
      ['autoCenterBlendMs', 5000],
      ['modeTransitionMs', 3000],
    ] as const) {
      const value = patch[key]
      if (typeof value === 'number' && Number.isFinite(value))
        this.value[key] = Math.max(0, Math.min(max, value))
    }
    this.state.settings.autoCenterEnabled = this.value.autoCenter
    this.state.settings.autoCenterDelayMs = this.value.autoCenterDelayMs
    this.state.settings.autoCenterBlendMs = this.value.autoCenterBlendMs
    this.state.settings.modeTransitionMs = this.value.modeTransitionMs
  }
  set(patch: Partial<CameraMotionPreferences>, storage: StoragePort): CameraMotionPreferences {
    this.apply(patch)
    try {
      storage.setItem('nabla.cameraMotion', JSON.stringify(this.value))
    } catch {
      /* Live preferences still work. */
    }
    return this.settings
  }
}
