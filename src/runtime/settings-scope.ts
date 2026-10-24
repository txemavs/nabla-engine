/**
 * Play modes with their own saved settings. PC mode keeps the plain `nabla.*` keys; each VR mode
 * stores every `nabla.*` key under `nabla.settings.<mode>.*`, so a headset session never
 * overwrites the PC settings (quality profile, layers, HUD, spawn…) nor the other VR mode's.
 *
 *   - `headset`: the game opened in the headset itself (Quest browser, or Link's in-headset
 *     browser), `?vr=headset`;
 *   - `headset-pc`: a PC browser driving a headset over Link / SteamVR, `?vr=pc`.
 *
 * The page entry selects its default scope; runtimes own independent stores. Hosts can seed
 * per-mode defaults with `window.NABLA_SETTINGS_DEFAULTS = { headset: { 'nabla.quality': … } }`.
 */
import { registerPreferenceKey } from './settings-backup.js'
import { trafficSignsStorageKey } from './traffic-signs-host.js'

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

/** Storage surface accepted from a host. Enumeration enables eager snapshots. */
export interface SettingsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  readonly length?: number
  key?(index: number): string | null
}
export type SettingsDefaults = Partial<Record<VRPlayMode, Record<string, string>>>
export interface SettingsStoreOptions {
  /** Host signs key captured for this owner; null disables signs, omission uses the legacy page default. */
  trafficSignsStorageKey?: string | null
  mode?: PlayMode
  /** Omit for browser storage; null disables persistence. */
  storage?: SettingsStorage | null
  hostDefaults?: SettingsDefaults
  /** Optional persistent identity for independent runtimes in the same mode. */
  namespace?: string
  /** Page compatibility helpers read live; runtimes use snapshots (the default). */
  snapshot?: boolean
}

function browserStorage(): SettingsStorage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}
function hostDefaults(): SettingsDefaults | undefined {
  return (globalThis as { NABLA_SETTINGS_DEFAULTS?: SettingsDefaults }).NABLA_SETTINGS_DEFAULTS
}

/** A runtime-owned view: never patches Storage, and keeps working when persistence fails. */
export class SettingsStore implements Storage {
  readonly trafficSignsStorageKey: string | null
  private currentMode: PlayMode
  private readonly defaults: SettingsDefaults | undefined
  get mode(): PlayMode {
    return this.currentMode
  }
  private readonly backend: SettingsStorage | null | undefined
  private readonly values = new Map<string, string | null>()
  private readonly captured = new Map<string, string>()
  private readonly snapshot: boolean
  private enumerated = false
  private readonly namespace?: string
  constructor(options: SettingsStoreOptions = {}) {
    const signsKey =
      options.trafficSignsStorageKey === undefined
        ? (trafficSignsStorageKey() ?? null)
        : options.trafficSignsStorageKey
    if (signsKey !== null) registerPreferenceKey(signsKey)
    this.trafficSignsStorageKey = signsKey
    this.currentMode = options.mode ?? activePlayMode()
    this.defaults = options.hostDefaults ?? hostDefaults()
    this.backend = options.storage === undefined ? browserStorage() : options.storage
    this.namespace = options.namespace
    this.snapshot = options.snapshot !== false
    this.capture()
  }
  /** Explicitly change only this owner's profile (for PC → headset entry). */
  switchMode(mode: PlayMode): void {
    if (mode === this.mode) return
    this.currentMode = mode
    this.values.clear()
    this.captured.clear()
    this.enumerated = false
    this.capture()
  }
  private capture(): void {
    try {
      if (this.backend?.key && typeof this.backend.length === 'number') {
        for (let i = 0; i < this.backend.length; i++) {
          const key = this.backend.key(i)
          if (key !== null) {
            const value = this.backend.getItem(key)
            if (value !== null) this.captured.set(key, value)
          }
        }
        this.enumerated = true
      }
    } catch {
      /* Fall back to guarded per-key reads. */
    }
    if (this.mode !== 'pc' && this.getItem('nabla.modeSeeded') === null) {
      for (const [key, value] of Object.entries({
        ...engineModeDefaults[this.mode],
        ...this.defaults?.[this.mode],
      }))
        if (this.getItem(key) === null) this.setItem(key, value)
      this.setItem('nabla.modeSeeded', '1')
    }
  }
  private physical(key: string): string {
    const scoped = scopedKey(this.mode, key)
    return this.namespace === undefined
      ? scoped
      : 'nabla.settings.instances.' + encodeURIComponent(this.namespace) + '.' + scoped
  }
  private readPhysical(key: string): string | null {
    if (this.snapshot && this.enumerated) return this.captured.get(key) ?? null
    try {
      return this.backend?.getItem(key) ?? null
    } catch {
      return null
    }
  }
  getItem(key: string): string | null {
    key = String(key)
    if (this.values.has(key)) return this.values.get(key) ?? null
    const physical = this.physical(key)
    let value = this.readPhysical(physical)
    // New named instances inherit the existing mode's preferences, without rewriting them.
    if (value === null && this.namespace !== undefined)
      value = this.readPhysical(scopedKey(this.mode, key))
    if (this.snapshot) this.values.set(key, value)
    return value
  }
  setItem(key: string, value: string): void {
    key = String(key)
    value = String(value)
    this.values.set(key, value)
    this.captured.set(this.physical(key), value)
    try {
      this.backend?.setItem(this.physical(key), value)
      if (!this.snapshot && this.backend) this.values.delete(key)
    } catch {
      /* Session value survives. */
    }
  }
  removeItem(key: string): void {
    key = String(key)
    this.values.set(key, null)
    this.captured.delete(this.physical(key))
    try {
      this.backend?.removeItem(this.physical(key))
      if (!this.snapshot && this.backend) this.values.delete(key)
    } catch {
      /* Session removal survives. */
    }
  }
  private keys(): string[] {
    const physical = new Set(this.captured.keys())
    if (!this.snapshot && this.backend?.key) {
      try {
        for (let i = 0; i < (this.backend.length ?? 0); i++) {
          const key = this.backend.key(i)
          if (key !== null) physical.add(key)
        }
      } catch {
        /* Memory keys remain available. */
      }
    }
    const prefix =
      this.namespace === undefined
        ? ''
        : 'nabla.settings.instances.' + encodeURIComponent(this.namespace) + '.'
    const logical = new Set(this.values.keys())
    for (let key of physical) {
      if (prefix && key.startsWith(prefix)) key = key.slice(prefix.length)
      if (this.mode !== 'pc' && key.startsWith('nabla.settings.' + this.mode + '.'))
        key = 'nabla.' + key.slice(('nabla.settings.' + this.mode + '.').length)
      else if (
        key.startsWith('nabla.settings.') ||
        (this.mode !== 'pc' && key.startsWith('nabla.'))
      )
        continue
      logical.add(key)
    }
    return [...logical].filter((key) => this.getItem(key) !== null)
  }
  get length(): number {
    return this.keys().length
  }
  key(index: number): string | null {
    return this.keys()[index] ?? null
  }
  clear(): void {
    for (const key of this.keys())
      if (this.namespace !== undefined || key.startsWith('nabla.')) this.removeItem(key)
  }
}
export function createSettingsStore(options: SettingsStoreOptions = {}): SettingsStore {
  return new SettingsStore(options)
}

let installed: PlayMode | null = null
let pageStore: SettingsStore | undefined
let pageBackend: SettingsStorage | null | undefined
let explicitPageBackend = false
/** Mode of the single-page compatibility host; existing runtime stores never follow it. */
export function activePlayMode(): PlayMode {
  return installed ?? playModeFromSearch()
}
/** Compatibility default for host helpers. Prefer runtime.settings when a runtime is available. */
export function pageSettingsStorage(): SettingsStore {
  const backend = browserStorage()
  if (!pageStore || (!explicitPageBackend && pageBackend !== backend)) {
    pageBackend = backend
    pageStore = createSettingsStore({ mode: activePlayMode(), storage: backend, snapshot: false })
  }
  return pageStore
}
/** Select the page's default profile without patching Storage methods. Existing stores stay fixed. */
export function installSettingsScope(
  mode: PlayMode = playModeFromSearch(),
  storage: SettingsStorage | undefined = browserStorage(),
  defaults: SettingsDefaults | undefined = hostDefaults(),
): PlayMode {
  if (installed && !(installed === 'pc' && mode !== 'pc')) return installed
  installed = mode
  explicitPageBackend = storage !== browserStorage()
  pageBackend = storage
  pageStore = createSettingsStore({ mode, storage, hostDefaults: defaults, snapshot: false })
  return mode
}
