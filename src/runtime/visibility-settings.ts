import { visibilityChoices, type VisibilitySettings } from '../config/performance.js'

/** localStorage key of the remembered visibility distances. */
export const VISIBILITY_STORAGE_KEY = 'nabla.visibility'
const SCHEMA = 'nabla.visibility/1'

/**
 * Keep only the fields whose value is a supported choice. Anything else (a stale value after the
 * choices change, a hand-edited file, a prototype key) is dropped, so it can never reach the runtime.
 */
export function normalizeVisibility(value: unknown): Partial<VisibilitySettings> {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const out: Partial<VisibilitySettings> = {}
  for (const key of Object.keys(visibilityChoices) as (keyof VisibilitySettings)[]) {
    const candidate = Object.hasOwn(source, key) ? source[key] : undefined
    if (
      typeof candidate === 'number' &&
      (visibilityChoices[key] as readonly number[]).includes(candidate)
    )
      out[key] = candidate
  }
  return out
}

/**
 * Remembered distances for one quality profile. They belong to the profile they were chosen in:
 * switching profile (which reloads with `?quality=`) starts again from that profile's own values.
 */
export function parseStoredVisibility(
  raw: string | null | undefined,
  preset: string,
): Partial<VisibilitySettings> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as { schema?: unknown; preset?: unknown; values?: unknown }
    if (parsed?.schema !== SCHEMA || parsed.preset !== preset) return {}
    return normalizeVisibility(parsed.values)
  } catch {
    return {}
  }
}

export function serializeVisibility(preset: string, values: Partial<VisibilitySettings>): string {
  return JSON.stringify({ schema: SCHEMA, preset, values: normalizeVisibility(values) })
}
