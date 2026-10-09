/**
 * «Sombras: activadas / desactivadas» (live on/off, saved as `nabla.shadowsEnabled`) and
 * «Sombras: corrección de rayas» in Ajustes → Calidad: a live slider on the engine's shadow bias
 * factor (`runtime.setShadowBias`, 0–300 %, 100 % = the tuned default) with a reset button.
 *
 * Initial value, highest first: the player's saved choice (localStorage) > the host default from
 * boot (URL `?shadowBias=`, `window.NABLA_BOOT.shadowBias`, `VITE_NABLA_BOOT`,
 * `VITE_NABLA_SHADOW_BIAS`) > 1. «Restablecer» forgets the saved choice and returns to the host default.
 */
import type { GameRuntime } from '@nabla/engine/runtime/browser'
import { normalizeShadowBias, shadowBiasRange } from '@nabla/engine/config/shadows'
import { menuSection } from './menu.js'

export const SHADOW_BIAS_STORAGE_KEY = 'nabla.shadowBias'

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function browserStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

/** The host's default factor (boot value, else 1), clamped to the engine range. */
export function hostShadowBias(bootValue: number | undefined): number {
  return bootValue === undefined ? shadowBiasRange.default : normalizeShadowBias(bootValue)
}

/** Initial factor: saved player choice > host default (boot: URL / NABLA_BOOT / VITE) > 1. */
export function resolveShadowBias(
  bootValue: number | undefined,
  storage: StorageLike | undefined = browserStorage(),
): number {
  const stored = storage?.getItem(SHADOW_BIAS_STORAGE_KEY)
  if (stored !== null && stored !== undefined && stored.trim() !== '' && Number.isFinite(+stored))
    return normalizeShadowBias(Number(stored))
  return hostShadowBias(bootValue)
}

export function saveShadowBias(
  value: number | null,
  storage: StorageLike | undefined = browserStorage(),
): void {
  try {
    if (value === null) storage?.removeItem(SHADOW_BIAS_STORAGE_KEY)
    else storage?.setItem(SHADOW_BIAS_STORAGE_KEY, String(normalizeShadowBias(value)))
  } catch {
    /* private mode */
  }
}

export const SHADOWS_ENABLED_STORAGE_KEY = 'nabla.shadowsEnabled'

/** Saved on/off choice for shadows; on unless the player turned them off. */
export function resolveShadowsEnabled(
  storage: StorageLike | undefined = browserStorage(),
): boolean {
  try {
    return storage?.getItem(SHADOWS_ENABLED_STORAGE_KEY) !== '0'
  } catch {
    return true
  }
}

const percent = (value: number) => `${Math.round(value * 100)} %`

/** Slider + reset in a «Sombras» section shown under the Calidad tab. */
export function bindShadowBiasControl(
  runtime: GameRuntime,
  bootValue: number | undefined,
  storage = browserStorage(),
): void {
  const group = menuSection('quality-shadows', 'Sombras')
  // «Sombras: activadas / desactivadas»: live, saved as `nabla.shadowsEnabled` ('1' / '0').
  const toggleLabel = document.createElement('label')
  const toggle = document.createElement('input')
  toggle.type = 'checkbox'
  toggle.id = 'shadows-enabled'
  const toggleText = document.createElement('span')
  const showToggle = () => {
    toggle.checked = runtime.shadowsEnabled
    toggleText.textContent = runtime.shadowsEnabled ? 'Sombras: activadas' : 'Sombras: desactivadas'
  }
  runtime.setShadowsEnabled(resolveShadowsEnabled(storage))
  toggle.addEventListener('change', () => {
    runtime.setShadowsEnabled(toggle.checked)
    try {
      storage?.setItem(SHADOWS_ENABLED_STORAGE_KEY, toggle.checked ? '1' : '0')
    } catch {
      /* private mode */
    }
    showToggle()
  })
  toggleLabel.append(toggle, ' ', toggleText)
  group.append(toggleLabel)
  showToggle()
  const label = document.createElement('label')
  label.title =
    'Elimina las rayas finas de las sombras sobre el terreno y los edificios. Más alto: menos rayas, ' +
    'pero las sombras pueden separarse un poco de su objeto. 100 % es el valor recomendado.'
  const output = document.createElement('output')
  output.id = 'shadow-bias-label'
  const slider = document.createElement('input')
  slider.type = 'range'
  slider.id = 'shadow-bias'
  slider.min = String(shadowBiasRange.min * 100)
  slider.max = String(shadowBiasRange.max * 100)
  slider.step = '5'
  const reset = document.createElement('button')
  reset.type = 'button'
  reset.id = 'shadow-bias-reset'
  reset.textContent = 'Restablecer'
  const sync = () => {
    slider.value = String(Math.round(runtime.shadowBias * 100))
    output.textContent = percent(runtime.shadowBias)
  }
  slider.addEventListener('input', () => {
    runtime.setShadowBias(Number(slider.value) / 100)
    output.textContent = percent(runtime.shadowBias)
  })
  slider.addEventListener('change', () => saveShadowBias(runtime.shadowBias, storage))
  reset.addEventListener('click', () => {
    saveShadowBias(null, storage)
    runtime.setShadowBias(hostShadowBias(bootValue))
    sync()
  })
  label.append('Sombras: corrección de rayas ', output, slider)
  const note = document.createElement('p')
  note.textContent =
    'Se aplica al momento. Sube el valor si ves rayas; bájalo si las sombras flotan.'
  group.append(label, reset, note)
  sync()
  // If the tabbed settings HUD already exists, keep this section under Calidad.
  const qualityPane = document.getElementById('settings-pane-quality')
  if (qualityPane && group.parentElement !== qualityPane) qualityPane.append(group)
}
