import { pageSettingsStorage } from '@nabla/engine/runtime/settings-scope'
/** Menu toggle «Simulated fire»: lingering fire and trees catching fire (default on). */
import { t } from '@nabla/engine/i18n'
import type { GameRuntime } from '@nabla/engine/runtime/browser'
import { menuSection } from './menu.js'

export const SIMULATED_FIRE_STORAGE_KEY = 'nabla.simFire'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function browserStorage(): StorageLike | undefined {
  try {
    return pageSettingsStorage()
  } catch {
    return undefined
  }
}

function flag(value: string | null | undefined): boolean | undefined {
  if (value === '0' || value === 'false') return false
  if (value === '1' || value === 'true') return true
  return undefined
}

/** Initial preference: localStorage > host boot config > on. Config lives in code, not in the URL. */
export function resolveSimulatedFireEnabled(
  bootValue: boolean | undefined,
  storage: StorageLike | undefined = browserStorage(),
): boolean {
  return flag(storage?.getItem(SIMULATED_FIRE_STORAGE_KEY)) ?? bootValue !== false
}

export function saveSimulatedFireEnabled(
  enabled: boolean,
  storage: StorageLike | undefined = browserStorage(),
): void {
  try {
    storage?.setItem(SIMULATED_FIRE_STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    /* private mode */
  }
}

/** Settings → Effects → «Simulated fire». Applies immediately. */
export function bindSimulatedFireToggle(runtime: GameRuntime, storage = runtime.settings): void {
  const group = menuSection('settings-simulated-fire', t('settings.simulated-fire'))
  const label = document.createElement('label')
  label.className = 'inline'
  const box = document.createElement('input')
  box.type = 'checkbox'
  box.checked = runtime.simulatedFireEnabled
  box.addEventListener('change', () => {
    runtime.setSimulatedFireEnabled(box.checked)
    saveSimulatedFireEnabled(box.checked, storage)
  })
  label.append(box, ' ' + t('settings.simulated-fire-enable'))
  label.title = t('settings.simulated-fire-hint')
  group.append(label)
}
