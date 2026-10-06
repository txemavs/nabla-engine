/** Menu toggle for the R reset: nearest road/vía (default on) vs upright in place. */
import type { GameRuntime } from '@nabla/engine/runtime/browser'
import { menuSection } from './menu.js'

export const RECOVER_TO_ROAD_STORAGE_KEY = 'nabla.recoverToRoad'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function browserStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage
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

/** Checkbox in its own «Conducción» section (shown under the Posición tab). */
export function bindRecoverToRoadToggle(runtime: GameRuntime, storage = browserStorage()): void {
  const group = menuSection('driving-extras', 'Conducción')
  const label = document.createElement('label')
  label.title =
    'Al pulsar R el vehículo se endereza sobre la carretera más cercana. Desactivado: se endereza donde está.'
  const box = document.createElement('input')
  box.type = 'checkbox'
  box.id = 'recover-to-road'
  box.checked = runtime.recoverToRoadEnabled
  box.addEventListener('change', () => {
    runtime.setRecoverToRoadEnabled(box.checked)
    saveRecoverToRoadEnabled(box.checked, storage)
  })
  label.append(box, ' R: reaparecer en la vía más cercana')
  group.append(label)
  const positionPane = document.getElementById('settings-pane-position')
  if (positionPane && group.parentElement !== positionPane) positionPane.append(group)
}
