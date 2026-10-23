/** Menu slider for the world gravity multiplier (0.5×–3×, 1× = 9.81 m/s²), applied live and stored. */
import type { GameRuntime } from '@nabla/engine/runtime/browser'
import { simulationDefaults } from '@nabla/engine/config/simulation'
import { menuSection } from './menu.js'
import { t } from '@nabla/engine/i18n'

export const GRAVITY_SCALE_STORAGE_KEY = 'nabla.gravityScale'
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

function describe(scale: number): string {
  return `×${scale.toFixed(1)} (${(simulationDefaults.gravity * scale).toFixed(1)} m/s²)`
}

/** Gravity slider in Settings → Options → Driving. */
export function bindGravityScaleSlider(runtime: GameRuntime, storage = browserStorage()): void {
  const { min, max } = simulationDefaults.gravityScaleRange
  const group = menuSection('driving-extras', t('settings.recovery-and-physics'))
  const label = document.createElement('label')
  label.title = t('settings.gravity-hint')
  const input = document.createElement('input')
  input.type = 'range'
  input.id = 'gravity-scale'
  input.min = String(min)
  input.max = String(max)
  input.step = String(STEP)
  const output = document.createElement('output')
  const sync = (scale: number) => {
    input.value = String(scale)
    output.textContent = describe(scale)
    input.setAttribute('aria-valuetext', output.textContent)
  }
  input.addEventListener('input', () => {
    const used = runtime.setGravityScale(Number(input.value))
    saveGravityScale(used, storage)
    sync(used)
  })
  label.append(t('settings.gravity') + ' ', input, ' ', output)
  group.append(label)
  sync(runtime.gravityScale)
}
