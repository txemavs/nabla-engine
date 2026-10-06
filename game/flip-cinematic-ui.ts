/** Menu toggle for the post-flip cinematic camera (default on). */
import type { GameRuntime } from '@nabla/engine/runtime/browser'
import { menuSection } from './menu.js'

export const FLIP_CINEMATIC_STORAGE_KEY = 'nabla.flipCinematic'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function browserStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

/** Resolve initial preference: URL (via boot) > localStorage > NABLA_BOOT > on. */
export function resolveFlipCinematicEnabled(
  bootValue: boolean | undefined,
  storage: StorageLike | undefined = browserStorage(),
): boolean {
  const stored = storage?.getItem(FLIP_CINEMATIC_STORAGE_KEY)
  if (stored === '0' || stored === 'false') return false
  if (stored === '1' || stored === 'true') return true
  return bootValue !== false
}

export function saveFlipCinematicEnabled(
  enabled: boolean,
  storage: StorageLike | undefined = browserStorage(),
): void {
  try {
    storage?.setItem(FLIP_CINEMATIC_STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    /* private mode */
  }
}

/** Checkbox under Capas: "Cámara cinematográfica al volcar". */
export function bindFlipCinematicToggle(runtime: GameRuntime, storage = browserStorage()): void {
  const group = menuSection('camera-extras', 'Cámara')
  const label = document.createElement('label')
  const box = document.createElement('input')
  box.type = 'checkbox'
  box.checked = runtime.flipCinematicEnabled
  box.addEventListener('change', () => {
    runtime.setFlipCinematicEnabled(box.checked)
    saveFlipCinematicEnabled(box.checked, storage)
  })
  label.append(box, ' Cámara cinematográfica al volcar')
  group.append(label)
  // If the tabbed settings HUD already relocated Capas, keep this section visible there.
  const layersPane = document.getElementById('settings-pane-layers')
  if (layersPane && group.parentElement !== layersPane) layersPane.append(group)
}
