/**
 * Host defaults for the driver's steering-wheel adjustment («Volante» in the Vehículos menu).
 *
 * `?wheel=` (or `VITE_NABLA_STEERING_WHEEL` at build time) is a JSON object keyed by vehicle
 * preset id (`car` is the S3, `a3`, `white-truck`, …) or by steering GLB URL. Values are metres
 * along the column (`distance`, + toward the instrument cluster) and vertically (`height`, + up):
 *
 *   ?wheel={"car":{"distance":0.015,"height":-0.005}}
 *
 * A player's saved choice (localStorage) wins over the host default; «Restablecer volante» returns
 * to it. `?wheel=` wins over the build value; a present empty `wheel=` means no host defaults.
 */
import { hasVehiclePreset, vehiclePreset } from '@nabla/engine/vehicles'
import type { SteeringWheelStorage } from '@nabla/engine/runtime'

/** Host default per steering model (GLB URL), metres. */
export type HostSteeringWheels = Record<string, { distance: number; height: number }>

/** The engine accepts ±8 cm; a host value outside that is a typo, not something to clamp quietly. */
const LIMIT = 0.08

/** Parse the JSON object and resolve preset ids to their steering GLB URL. */
export function parseHostSteeringWheels(raw: string): HostSteeringWheels {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('Host steering wheel defaults must be a JSON object')
  }
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('Host steering wheel defaults must be a JSON object')
  const result: HostSteeringWheels = {}
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const model = key.startsWith('/') ? key : steeringOf(key)
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error(`Host steering wheel ${key} must be {distance, height}`)
    const read = (axis: 'distance' | 'height') => {
      const raw = (value as Record<string, unknown>)[axis] ?? 0
      const number = typeof raw === 'string' ? Number(raw) : raw
      if (typeof number !== 'number' || !Number.isFinite(number) || Math.abs(number) > LIMIT)
        throw new Error(`Host steering wheel ${key}.${axis} must be metres between -0.08 and 0.08`)
      return number
    }
    result[model] = { distance: read('distance'), height: read('height') }
  }
  return result
}

function steeringOf(preset: string): string {
  if (!hasVehiclePreset(preset)) throw new Error(`Unknown vehicle preset: ${preset}`)
  const url = vehiclePreset(preset).visual.steering?.url
  if (!url) throw new Error(`Vehicle preset ${preset} has no steering wheel mesh`)
  return url
}

/** `VITE_NABLA_STEERING_WHEEL` at build time, or none. */
export function viteHostSteeringWheels(): HostSteeringWheels {
  const raw = (import.meta as { env?: Record<string, string | undefined> }).env
    ?.VITE_NABLA_STEERING_WHEEL
  if (raw === undefined || raw.trim() === '') return {}
  return parseHostSteeringWheels(raw)
}

/** Read `?wheel=`; a missing param uses `fallback` (typically {@link viteHostSteeringWheels}). */
export function hostSteeringWheelsFromSearch(
  search: string,
  fallback: HostSteeringWheels = {},
): HostSteeringWheels {
  const raw = new URLSearchParams(search).get('wheel')
  if (raw === null) return { ...fallback }
  if (raw.trim() === '') return {}
  return parseHostSteeringWheels(raw)
}

/** Where the player's choice is kept: `localStorage`, or nothing when the browser refuses it. */
export function steeringWheelStorage(): SteeringWheelStorage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}
