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
