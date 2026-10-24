import { pageSettingsStorage } from '@nabla/engine/runtime/settings-scope'
export const HEADLAMP_SHADOWS_KEY = 'nabla.headlamp-shadows-v2'

/** Restore shader-affecting preferences before play() warms the scene and mirrors. */
export function restoreStartupLightSettings(
  runtime: { setHeadlampShadows(enabled: boolean): void },
  storage: Pick<Storage, 'getItem'> | undefined = undefined,
): void {
  let enabled = false
  try {
    enabled = (storage ?? pageSettingsStorage())?.getItem(HEADLAMP_SHADOWS_KEY) === 'true'
  } catch {
    // Storage may be unavailable; flashlight shadows default to off.
  }
  runtime.setHeadlampShadows(enabled)
}
