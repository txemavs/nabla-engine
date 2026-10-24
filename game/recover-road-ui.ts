import { pageSettingsStorage } from '@nabla/engine/runtime/settings-scope'
/** Menu toggle for the vehicle reset (recover key): nearest road/vía (default on) vs upright in place. */
import type { GameRuntime } from '@nabla/engine/runtime/browser'
import { menuSection } from './menu.js'
import { t } from '@nabla/engine/i18n'
import { inputBindings, keyLabel } from '@nabla/engine/config/controls'

export const RECOVER_TO_ROAD_STORAGE_KEY = 'nabla.recoverToRoad'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function browserStorage(): StorageLike | undefined {
  try {
    return pageSettingsStorage()
  } catch {
    return undefined
  }
}

/** Resolve initial preference like the flip cinematic: localStorage > boot (URL/NABLA_BOOT) > on. */
export function resolveRecoverToRoadEnabled(
  bootValue: boolean | undefined,
  storage: StorageLike | undefined = browserStorage(),
): boolean {
  const stored = storage?.getItem(RECOVER_TO_ROAD_STORAGE_KEY)
  if (stored === '0' || stored === 'false') return false
  if (stored === '1' || stored === 'true') return true
  return bootValue !== false
}

export function saveRecoverToRoadEnabled(
  enabled: boolean,
  storage: StorageLike | undefined = browserStorage(),
): void {
  try {
    storage?.setItem(RECOVER_TO_ROAD_STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    /* private mode */
  }
}

/** Checkbox in Settings → Options → Driving (shares the section with gravity). */
export function bindRecoverToRoadToggle(runtime: GameRuntime, storage = runtime.settings): void {
  const group = menuSection('driving-extras', t('settings.recovery-and-physics'))
  const label = document.createElement('label')
  const key = inputBindings.recover.keys.map(keyLabel).join(' / ')
  label.title = t('settings.recover-road.title', { key })
  const box = document.createElement('input')
  box.type = 'checkbox'
  box.id = 'recover-to-road'
  box.checked = runtime.recoverToRoadEnabled
  box.addEventListener('change', () => {
    runtime.setRecoverToRoadEnabled(box.checked)
    saveRecoverToRoadEnabled(box.checked, storage)
  })
  label.append(box, ' ' + t('settings.recover-road', { key }))
  group.append(label)
}
