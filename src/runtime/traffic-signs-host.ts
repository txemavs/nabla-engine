import { registerPreferenceKey } from './settings-backup.js'

let storageKey: string | undefined

/**
 * Names the host's storage key for its traffic-signs settings (`{ enabled, limit, radius,
 * physicsRadius }` as JSON). The «Traffic signs» settings section saves there, scenery physics
 * reads its starting radius from it, and the key joins settings export, import and reset.
 * Legacy page default, captured when each SettingsStore is constructed. Later calls do not
 * change existing runtimes. New hosts can pass settings.trafficSignsStorageKey per runtime.
 */
export function setTrafficSignsStorageKey(key: string): void {
  registerPreferenceKey(key)
  storageKey = key
}

/** The key set by {@link setTrafficSignsStorageKey}, or `undefined` when the host has none. */
export function trafficSignsStorageKey(): string | undefined {
  return storageKey
}
