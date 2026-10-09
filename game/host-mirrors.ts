/**
 * Host defaults for the driver's mirror glass adjustment («Espejos» in the Vehículos menu).
 *
 * `?mirrors=` (or `VITE_NABLA_MIRRORS` at build time) is a JSON object keyed by vehicle preset id
 * (`car` is the S3, `a3`, `white-truck`, …) or by mirror model (`mirrorModelKey`). Values are
 * degrees per side: `yaw` (+ outward, − inward) and `tilt` (+ up, − down):
 *
 *   ?mirrors={"car":{"left":{"yaw":-2},"right":{"yaw":-1.5,"tilt":0.5}}}
 *
 * A player's saved choice (localStorage) wins over the host default; «Restablecer espejos» returns
 * to it. `?mirrors=` wins over the build value; a present empty `mirrors=` means no host defaults.
 */
import { hasVehiclePreset, vehiclePreset } from '@nabla/engine/vehicles'
import { mirrorModelKey } from '@nabla/engine/vehicle-presentation'
import type { MirrorStorage } from '@nabla/engine/runtime'

/** Host default per mirror model, degrees per side. */
export type HostMirrors = Record<string, Record<string, { yaw: number; tilt: number }>>

/** The engine accepts yaw ±15° and tilt ±10°; a host value outside that is a typo. */
const LIMIT = { yaw: 15, tilt: 10 } as const

/** Parse the JSON object and resolve preset ids to their mirror model. */
export function parseHostMirrors(raw: string): HostMirrors {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('Host mirror defaults must be a JSON object')
  }
  const isObject = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value)
  if (!isObject(data)) throw new Error('Host mirror defaults must be a JSON object')
  const result: HostMirrors = {}
  for (const [key, sides] of Object.entries(data)) {
    const model = key.startsWith('/') ? key : mirrorModelOf(key)
    if (!isObject(sides)) throw new Error(`Host mirrors ${key} must be {left: {yaw, tilt}, …}`)
    const entry: Record<string, { yaw: number; tilt: number }> = {}
    for (const [side, angle] of Object.entries(sides)) {
      if (!isObject(angle)) throw new Error(`Host mirrors ${key}.${side} must be {yaw, tilt}`)
      const read = (axis: 'yaw' | 'tilt') => {
        const raw = angle[axis] ?? 0
        const number = typeof raw === 'string' ? Number(raw) : raw
        if (
          typeof number !== 'number' ||
          !Number.isFinite(number) ||
          Math.abs(number) > LIMIT[axis]
        )
          throw new Error(
            `Host mirrors ${key}.${side}.${axis} must be degrees between -${LIMIT[axis]} and ${LIMIT[axis]}`,
          )
        return number
      }
      entry[side] = { yaw: read('yaw'), tilt: read('tilt') }
    }
    result[model] = entry
  }
  return result
}

function mirrorModelOf(preset: string): string {
  if (!hasVehiclePreset(preset)) throw new Error(`Unknown vehicle preset: ${preset}`)
  const visual = vehiclePreset(preset).visual
  return mirrorModelKey(visual.body.url, visual.steering?.url)
}

/**
 * Built-in defaults (Txema 2026-10-09): the «Espejos» values a fresh browser shows and uses, on top
 * of each preset's baked `mirrorAim`. The sliders are centred on them (±9°).
 */
export const BUILTIN_HOST_MIRRORS = {
  car: { left: { yaw: -5, tilt: 0 }, right: { yaw: -9, tilt: -4 } },
  'white-truck': { left: { yaw: 0, tilt: 0 }, right: { yaw: 0, tilt: 1.5 } },
  vfr800: { left: { yaw: -12.5, tilt: -1.5 }, right: { yaw: -14.5, tilt: -1.5 } },
} as const

/** {@link BUILTIN_HOST_MIRRORS} resolved to mirror models. */
export function builtinHostMirrors(): HostMirrors {
  return parseHostMirrors(JSON.stringify(BUILTIN_HOST_MIRRORS))
}

/** Built-in defaults, overridden per model by `VITE_NABLA_MIRRORS` at build time. */
export function viteHostMirrors(): HostMirrors {
  const raw = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_NABLA_MIRRORS
  if (raw === undefined || raw.trim() === '') return builtinHostMirrors()
  return { ...builtinHostMirrors(), ...parseHostMirrors(raw) }
}

/** Read `?mirrors=`; a missing param uses `fallback` (typically {@link viteHostMirrors}). */
export function hostMirrorsFromSearch(search: string, fallback: HostMirrors = {}): HostMirrors {
  const raw = new URLSearchParams(search).get('mirrors')
  if (raw === null) return { ...fallback }
  if (raw.trim() === '') return {}
  return parseHostMirrors(raw)
}

/** Where the player's choice is kept: `localStorage`, or nothing when the browser refuses it. */
export function mirrorStorage(): MirrorStorage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}
