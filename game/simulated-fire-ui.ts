/** Menu toggle «Fuego simulado»: lingering fire and trees catching fire (default on). */
import type { GameRuntime } from '@nabla/engine/runtime/browser'
import { menuSection } from './menu.js'

export const SIMULATED_FIRE_STORAGE_KEY = 'nabla.simFire'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function browserStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

function flag(value: string | null | undefined): boolean | undefined {
  if (value === '0' || value === 'false') return false
  if (value === '1' || value === 'true') return true
  return undefined
}

/**
 * Initial preference: URL `?simFire=0|1` (benchmarks) > localStorage > NABLA_BOOT > on.
 */
export function resolveSimulatedFireEnabled(
  bootValue: boolean | undefined,
  storage: StorageLike | undefined = browserStorage(),
  search: string = globalThis.location?.search ?? '',
): boolean {
  return (
    flag(new URLSearchParams(search).get('simFire')) ??
    flag(storage?.getItem(SIMULATED_FIRE_STORAGE_KEY)) ??
    bootValue !== false
  )
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

/** Checkbox in Ajustes → Opciones → Efectos: «Fuego simulado». Applies immediately. */
export function bindSimulatedFireToggle(runtime: GameRuntime, storage = browserStorage()): void {
  const group = menuSection('effects', 'Efectos')
  const label = document.createElement('label')
  const box = document.createElement('input')
  box.type = 'checkbox'
  box.checked = runtime.simulatedFireEnabled
  box.addEventListener('change', () => {
    runtime.setSimulatedFireEnabled(box.checked)
    saveSimulatedFireEnabled(box.checked, storage)
  })
  label.append(box, ' Fuego simulado')
  label.title = 'Fuego que se consume poco a poco y prende los árboles (sí/no)'
  group.append(label)
}
