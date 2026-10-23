/**
 * Menu slider for the world gravity, shown in m/s² and stored as the existing multiplier
 * (0.5×–3×, 1× = standard gravity), applied live.
 */
import type { GameRuntime } from '@nabla/engine/runtime/browser'
import { simulationDefaults } from '@nabla/engine/config/simulation'
import { menuSection } from './menu.js'
import { t } from '@nabla/engine/i18n'

export const GRAVITY_SCALE_STORAGE_KEY = 'nabla.gravityScale'
/** Slider step in m/s². */
const STEP = 0.1

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function browserStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

/** Stored multiplier when it is inside the supported range, else 1. */
export function resolveGravityScale(storage: StorageLike | undefined = browserStorage()): number {
  const { min, max, default: fallback } = simulationDefaults.gravityScaleRange
  let raw: string | null | undefined
  try {
    raw = storage?.getItem(GRAVITY_SCALE_STORAGE_KEY)
  } catch {
    raw = null
  }
  const stored = raw == null || raw === '' ? NaN : Number(raw)
  return Number.isFinite(stored) && stored >= min && stored <= max ? stored : fallback
}

export function saveGravityScale(
  scale: number,
  storage: StorageLike | undefined = browserStorage(),
): void {
  try {
    storage?.setItem(GRAVITY_SCALE_STORAGE_KEY, String(scale))
  } catch {
    /* private mode */
  }
}

/** m/s² ↔ the stored multiplier of the standard gravity. */
export const gravityFromScale = (scale: number): number => scale * simulationDefaults.gravity
export const scaleFromGravity = (metresPerSecond2: number): number =>
  metresPerSecond2 / simulationDefaults.gravity

function describe(scale: number): string {
  return `${gravityFromScale(scale).toFixed(1)} m/s² (×${scale.toFixed(2)})`
}

/** Gravity slider in Ajustes → Simulación → Tiempo, in m/s². */
export function bindGravityScaleSlider(runtime: GameRuntime, storage = browserStorage()): void {
  const { min, max } = simulationDefaults.gravityScaleRange
  const group = menuSection('settings-simulation-time', t('settings.time'))
  const label = document.createElement('label')
  label.title = t('settings.gravity-hint')
  const input = document.createElement('input')
  input.type = 'range'
  input.id = 'gravity-scale'
  input.min = gravityFromScale(min).toFixed(1)
  input.max = gravityFromScale(max).toFixed(1)
  input.step = String(STEP)
  const output = document.createElement('output')
  const sync = (scale: number) => {
    input.value = gravityFromScale(scale).toFixed(1)
    output.textContent = describe(scale)
    input.setAttribute('aria-valuetext', output.textContent)
  }
  input.addEventListener('input', () => {
    const scale = Math.min(max, Math.max(min, scaleFromGravity(Number(input.value))))
    const used = runtime.setGravityScale(scale)
    saveGravityScale(used, storage)
    sync(used)
  })
  label.append(t('settings.gravity') + ' ', input, ' ', output)
  group.append(label)
  sync(runtime.gravityScale)
}
