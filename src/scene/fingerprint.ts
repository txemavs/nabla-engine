/**
 * Compact fingerprint of generated map entities.
 * Saving must not turn that generated data into an edit, so `mapBaseline` is excluded.
 */
import type { Entity } from '../entity/schema.js'

export function mapFingerprint(entities: Entity[]): string {
  const text = JSON.stringify(
    [...entities].sort((a, b) => a.id.localeCompare(b.id)),
    (key, value) => {
      if (key === 'mapBaseline') return undefined
      if (value && typeof value === 'object' && !Array.isArray(value))
        return Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, value[k]]),
        )
      return value
    },
  )
  let a = 2166136261,
    b = 5381
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619)
    b = Math.imul(b, 33) ^ text.charCodeAt(i)
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')
}
