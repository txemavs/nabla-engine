/** Ajustes → Capas → Asfalto: live asphalt contrast slider (draw time; tile textures untouched). */
import {
  ASPHALT_CONTRAST_DEFAULT,
  ASPHALT_CONTRAST_MAX,
  ASPHALT_CONTRAST_MIN,
} from '@nabla/engine/render'
import type { GameRuntime } from '@nabla/engine/runtime/browser'
import { menuSection } from './menu.js'

export const ASPHALT_CONTRAST_STORAGE_KEY = 'nabla.asphaltContrast'

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function browserStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

/** A finite number clamped to the engine range, or undefined for missing / invalid input. */
function validContrast(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return undefined
  return Math.min(ASPHALT_CONTRAST_MAX, Math.max(ASPHALT_CONTRAST_MIN, n))
}

/**
 * Start value: URL `?asphaltContrast=` (one visit) > the player's stored slider value > the host
 * default (`NABLA_BOOT.asphaltContrast`) > 1 (unchanged).
 */
export function resolveAsphaltContrast(
  hostDefault: number | undefined,
  storage: StorageLike | undefined = browserStorage(),
  search: string = location.search,
): number {
  const url = validContrast(new URLSearchParams(search).get('asphaltContrast'))
  if (url !== undefined) return url
  let stored: string | null | undefined
  try {
    stored = storage?.getItem(ASPHALT_CONTRAST_STORAGE_KEY)
  } catch {
    stored = undefined
  }
  return validContrast(stored) ?? validContrast(hostDefault) ?? ASPHALT_CONTRAST_DEFAULT
}

/**
 * Slider «Contraste del asfalto» (×0.5–×2.5) plus «Por defecto», which returns to the host
 * default and forgets the stored value. Changes apply live; the released value is stored.
 */
export function bindAsphaltContrastSlider(
  runtime: GameRuntime,
  hostDefault?: number,
  storage: StorageLike | undefined = browserStorage(),
): HTMLFieldSetElement {
  const fallback = validContrast(hostDefault) ?? ASPHALT_CONTRAST_DEFAULT
  const group = menuSection('road-style', 'Asfalto')
  const label = document.createElement('label')
  const slider = document.createElement('input')
  slider.type = 'range'
  slider.id = 'asphalt-contrast'
  slider.min = String(ASPHALT_CONTRAST_MIN)
  slider.max = String(ASPHALT_CONTRAST_MAX)
  slider.step = '0.05'
  const output = document.createElement('output')
  output.htmlFor.add(slider.id)
  const show = () => {
    slider.value = String(runtime.asphaltContrast)
    output.textContent = `×${runtime.asphaltContrast.toFixed(2)}`
  }
  slider.addEventListener('input', () => {
    runtime.setAsphaltContrast(Number(slider.value))
    output.textContent = `×${runtime.asphaltContrast.toFixed(2)}`
  })
  slider.addEventListener('change', () => {
    try {
      storage?.setItem(ASPHALT_CONTRAST_STORAGE_KEY, String(runtime.asphaltContrast))
    } catch {
      /* private mode */
    }
  })
  const reset = document.createElement('button')
  reset.type = 'button'
  reset.textContent = 'Por defecto'
  reset.addEventListener('click', () => {
    runtime.setAsphaltContrast(fallback)
    try {
      storage?.removeItem(ASPHALT_CONTRAST_STORAGE_KEY)
    } catch {
      /* private mode */
    }
    show()
  })
  label.append('Contraste del asfalto ', slider, ' ', output)
  group.append(label, reset)
  show()
  // If the tabbed settings HUD already relocated Capas, keep this section visible there.
  const layersPane = document.getElementById('settings-pane-layers')
  if (layersPane && group.parentElement !== layersPane) layersPane.append(group)
  return group
}
