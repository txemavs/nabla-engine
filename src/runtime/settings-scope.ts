/**
 * Play modes with their own saved settings. PC mode keeps the plain `nabla.*` keys; each VR mode
 * stores every `nabla.*` key under `nabla.settings.<mode>.*`, so a headset session never
 * overwrites the PC settings (quality profile, layers, HUD, spawn…) nor the other VR mode's.
 *
 *   - `headset`: the game opened in the headset itself (Quest browser, or Link's in-headset
 *     browser), `?vr=headset`;
 *   - `headset-pc`: a PC browser driving a headset over Link / SteamVR, `?vr=pc`.
 *
 * Install the scope before any module reads storage (first import of the entry). Hosts can seed
 * per-mode defaults with `window.NABLA_SETTINGS_DEFAULTS = { headset: { 'nabla.quality': … } }`.
 */
export type PlayMode = 'pc' | 'headset' | 'headset-pc'
export type VRPlayMode = Exclude<PlayMode, 'pc'>

/** `?vr=` value of each VR mode. */
export const vrModeQuery: Readonly<Record<VRPlayMode, string>> = Object.freeze({
  headset: 'headset',
  'headset-pc': 'pc',
})

/** Mode chosen by the address (`?vr=headset` / `?vr=pc`), else PC. */
export function playModeFromSearch(search: string = globalThis.location?.search ?? ''): PlayMode {
  const vr = new URLSearchParams(search).get('vr')
  if (vr === 'headset') return 'headset'
  if (vr === 'pc') return 'headset-pc'
  return 'pc'
}

/** True in either VR mode. */
export const isVRMode = (mode: PlayMode): mode is VRPlayMode => mode !== 'pc'

/** Engine defaults of each VR mode, below the host's (`NABLA_SETTINGS_DEFAULTS`). */
export const engineModeDefaults: Readonly<Record<VRPlayMode, Readonly<Record<string, string>>>> =
  Object.freeze({
    // Standalone headset GPU: lowest profile, 70% eye buffer, full foveation, no shadows.
    headset: {
      'nabla.quality': 'minimal',
      'nabla.xr.quality.v1': JSON.stringify({
        scale: 0.7,
        foveation: 1,
        shadows: false,
        sparks: false,
        impactLimit: 32,
        casingLimit: 8,
        roadDetail: 4,
      }),
    },
    // PC GPU rendering both eyes for Link: balanced profile, native eye buffer, light foveation.
    'headset-pc': {
      'nabla.quality': 'balanced',
      'nabla.xr.quality.v1': JSON.stringify({ scale: 1, foveation: 0.3, shadows: false }),
    },
  })

/** Storage key used for `key` in `mode` (unchanged for PC and for non-`nabla.` keys). */
export function scopedKey(mode: PlayMode, key: string): string {
  if (mode === 'pc' || !key.startsWith('nabla.') || key.startsWith('nabla.settings.')) return key
  return `nabla.settings.${mode}.${key.slice('nabla.'.length)}`
}

interface ScopableStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

let installed: PlayMode | null = null

/** Active mode: the one installed by {@link installSettingsScope}, else read from the address. */
export function activePlayMode(): PlayMode {
  return installed ?? playModeFromSearch()
}

/**
 * Route `storage`'s `nabla.*` keys to `mode`'s namespace and seed that mode's defaults (engine,
 * then host) for keys it has never saved. PC mode leaves storage untouched. Idempotent.
 */
export function installSettingsScope(
  mode: PlayMode = playModeFromSearch(),
  storage: ScopableStorage | undefined = (() => {
    try {
      return globalThis.localStorage
    } catch {
      return undefined
    }
  })(),
  hostDefaults: Partial<Record<VRPlayMode, Record<string, string>>> | undefined = (
    globalThis as { NABLA_SETTINGS_DEFAULTS?: Partial<Record<VRPlayMode, Record<string, string>>> }
  ).NABLA_SETTINGS_DEFAULTS,
): PlayMode {
  // A PC page may switch once into a VR profile (the `casco` button); otherwise the first wins.
  if (installed && !(installed === 'pc' && mode !== 'pc')) return installed
  installed = mode
  if (mode === 'pc' || !storage) return mode
  const get = storage.getItem.bind(storage)
  const set = storage.setItem.bind(storage)
  const remove = storage.removeItem.bind(storage)
  // Own properties shadow Storage.prototype for this object only; every caller sees the scope.
  Object.defineProperties(storage, {
    getItem: { configurable: true, value: (key: string) => get(scopedKey(mode, String(key))) },
    setItem: {
      configurable: true,
      value: (key: string, value: string) => set(scopedKey(mode, String(key)), value),
    },
    removeItem: {
      configurable: true,
      value: (key: string) => remove(scopedKey(mode, String(key))),
    },
  })
  try {
    const seedFlag = scopedKey(mode, 'nabla.modeSeeded')
    if (get(seedFlag) === null) {
      for (const [key, value] of Object.entries({
        ...engineModeDefaults[mode],
        ...(hostDefaults?.[mode] ?? {}),
      }))
        if (get(scopedKey(mode, key)) === null) set(scopedKey(mode, key), value)
      set(seedFlag, '1')
    }
  } catch {
    /* Storage is optional. */
  }
  return mode
}
