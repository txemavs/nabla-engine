/** Ajustes → Vídeo → Postproceso: «Filtrado anisotrópico» for the asphalt and road markings. */
import type { GameRuntime } from '@nabla/engine/runtime/browser'

export const ANISOTROPY_STORAGE_KEY = 'nabla.anisotropy'
export const ANISOTROPY_OPTIONS = [1, 2, 4, 8, 16] as const
export const ANISOTROPY_DEFAULT = 8

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function browserStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

/** Stored choice when it is one of the options, else the default (8). */
export function resolveAnisotropy(storage: StorageLike | undefined = browserStorage()): number {
  let stored: number
  try {
    stored = Number(storage?.getItem(ANISOTROPY_STORAGE_KEY))
  } catch {
    stored = NaN
  }
  return (ANISOTROPY_OPTIONS as readonly number[]).includes(stored) ? stored : ANISOTROPY_DEFAULT
}

/** Select ×1/×2/×4/×8/×16 (above the GPU maximum disabled), applied live and stored. */
export function bindAnisotropySelect(
  runtime: GameRuntime,
  group: HTMLElement,
  storage: StorageLike | undefined = browserStorage(),
): HTMLSelectElement {
  const max = runtime.maxAnisotropy
  const select = document.createElement('select')
  select.id = 'anisotropy'
  for (const value of ANISOTROPY_OPTIONS) {
    const option = document.createElement('option')
    option.value = String(value)
    option.textContent = `×${value}`
    option.disabled = value > max
    select.append(option)
  }
  const apply = (value: number) => {
    const used = runtime.setAnisotropy(value)
    select.value = String([...ANISOTROPY_OPTIONS].reverse().find((option) => option <= used) ?? 1)
  }
  select.addEventListener('change', () => {
    apply(Number(select.value))
    try {
      storage?.setItem(ANISOTROPY_STORAGE_KEY, select.value)
    } catch {
      /* private mode */
    }
  })
  const label = document.createElement('label')
  label.append('Filtrado anisotrópico ', select)
  group.append(label)
  apply(resolveAnisotropy(storage))
  return select
}

export const GROUND_DETAIL_STORAGE_KEY = 'nabla.groundDetailCells'
export const GROUND_DETAIL_OPTIONS = [
  [1, '1 (~1 km)'],
  [2, '2 (~2 km)'],
  [3, '3 (~3 km)'],
] as const

/** Stored ground detail distance (1–3 cells), else 1. */
export function resolveGroundDetail(storage: StorageLike | undefined = browserStorage()): number {
  let stored: number
  try {
    stored = Number(storage?.getItem(GROUND_DETAIL_STORAGE_KEY))
  } catch {
    stored = NaN
  }
  return [1, 2, 3].includes(stored) ? stored : 1
}

/**
 * «Distancia de detalle del suelo»: cells around the player that get the full-resolution ground
 * photo (asphalt and road markings). Applied live and stored. More cells cost GPU memory (~85 MB each).
 */
export function bindGroundDetailSelect(
  runtime: GameRuntime,
  group: HTMLElement,
  storage: StorageLike | undefined = browserStorage(),
): HTMLSelectElement {
  const select = document.createElement('select')
  select.id = 'ground-detail'
  for (const [value, text] of GROUND_DETAIL_OPTIONS) {
    const option = document.createElement('option')
    option.value = String(value)
    option.textContent = text
    select.append(option)
  }
  select.addEventListener('change', () => {
    select.value = String(runtime.setGroundDetailCells(Number(select.value)))
    try {
      storage?.setItem(GROUND_DETAIL_STORAGE_KEY, select.value)
    } catch {
      /* private mode */
    }
  })
  const label = document.createElement('label')
  label.append('Distancia de detalle del suelo ', select)
  group.append(label)
  select.value = String(runtime.setGroundDetailCells(resolveGroundDetail(storage)))
  return select
}
