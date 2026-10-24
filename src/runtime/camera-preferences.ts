import { actionCamTuning, normalViewTuning } from '../config/gameplay-tuning.js'
import type { ActionCam } from './action-cam.js'
import type { ActionCamSettings } from './action-cam-settings.js'
import {
  cameraFovFor,
  readCameraFovOffset,
  writeCameraFovOffset,
  type CameraFovBase,
  type CameraFovStorage,
} from './camera-fov.js'

type CameraState = { bodycam?: boolean; settings: CameraFovBase }
type PreferenceStorage = CameraFovStorage | null | undefined

/** Per-runtime preferences; motion, view transitions and XR remain with their existing owners. */
export class RuntimeCameraPreferences {
  private base: CameraFovBase = { firstPersonFov: 70, chaseFov: 48 }
  private offset = 0
  actionCamEnabled = actionCamTuning.enabled

  constructor(
    private readonly state: CameraState,
    private readonly actionCam: Pick<ActionCam, 'settings' | 'setSettings' | 'resetSettings'>,
  ) {}

  /** Called within the runtime's existing shared preference-read error boundary. */
  restoreActionCamEnabled(storage: PreferenceStorage): void {
    this.actionCamEnabled =
      (storage?.getItem('nabla.actionCam') ?? String(actionCamTuning.enabled)) === 'true'
  }

  restoreActionCamSettings(storage: PreferenceStorage): void {
    try {
      this.actionCam.setSettings(JSON.parse(storage?.getItem('nabla.actionCamSettings') ?? '{}'))
    } catch {
      // Keep defaults when storage is unavailable or invalid.
    }
  }

  /** Capture authored FOVs after camera options are applied; restoring never writes storage. */
  restoreView(storage: PreferenceStorage): void {
    this.state.bodycam =
      (storage?.getItem('nabla.bodycam') ?? String(normalViewTuning.enabled)) === 'true'
    this.base = {
      firstPersonFov: this.state.settings.firstPersonFov,
      chaseFov: this.state.settings.chaseFov,
    }
    this.applyFov(readCameraFovOffset(storage))
  }

  get fovOffset(): number {
    return this.offset
  }

  private applyFov(offset: number): void {
    const fov = cameraFovFor(this.base, offset)
    this.offset = fov.chaseFov - this.base.chaseFov
    Object.assign(this.state.settings, fov)
  }

  setFovOffset(offset: number, storage: PreferenceStorage): number {
    this.applyFov(offset)
    writeCameraFovOffset(storage, this.offset)
    return this.offset
  }

  get actionCamSettings(): ActionCamSettings {
    return this.actionCam.settings
  }

  setActionCamSettings(settings: Partial<ActionCamSettings>, storage: PreferenceStorage): void {
    this.actionCam.setSettings(settings)
    this.remember(storage, 'nabla.actionCamSettings', JSON.stringify(this.actionCam.settings))
  }

  resetActionCamSettings(storage: PreferenceStorage): void {
    this.actionCam.resetSettings()
    this.remember(storage, 'nabla.actionCamSettings', JSON.stringify(this.actionCam.settings))
  }

  setActionCamEnabled(enabled: boolean, storage: PreferenceStorage): void {
    this.actionCamEnabled = enabled
    this.remember(storage, 'nabla.actionCam', String(enabled))
  }

  get bodycamEnabled(): boolean {
    return !!this.state.bodycam
  }

  setBodycamEnabled(enabled: boolean, storage: PreferenceStorage, resetMotion: () => void): void {
    this.state.bodycam = enabled
    resetMotion()
    this.remember(storage, 'nabla.bodycam', String(enabled))
  }

  private remember(storage: PreferenceStorage, key: string, value: string): void {
    try {
      storage?.setItem(key, value)
    } catch {
      // Live preferences remain valid when persistence is unavailable.
    }
  }
}
