/**
 * Extra vehicles the host places after terrain is ready.
 *
 * Config is geographic (WGS84 lat/lon, heading clockwise from north, optional
 * orthometric alt). The game converts each entry to the scene's local metre
 * frame (+X east, +Y up, −Z north) and installs it with the same
 * `GameRuntime.placeVehicle` / `addVehicles` path as the in-game "Añadir vehículo"
 * control. The player start remains `lat`/`lon`/`alt`/`heading`/`vehicle`.
 *
 * Sources, URL wins:
 *   - `?vehicles=<json>` — JSON array of {@link HostVehicle}
 *   - `VITE_NABLA_VEHICLES` — same JSON at build time (Vite define / env)
 *   - a typed `HostVehicle[]` passed to {@link installHostVehicles}
 *
 * Example:
 *   [{"lat":43.3386,"lon":-1.7899,"heading":118,"vehicle":"white-truck"}]
 */
import { geoToLocal, type GeoPoint } from '@nabla/engine'
import { isValidLatLon } from '@nabla/engine/planet/lat-lon'
import { hasVehiclePreset, presetVehicle } from '@nabla/engine/vehicles'
import type { Entity, Vec3Tuple } from '@nabla/engine/scene'

/** One extra vehicle, authored in geographic coordinates. */
export interface HostVehicle {
  /** WGS84 latitude in degrees. */
  lat: number
  /** WGS84 longitude in degrees. */
  lon: number
  /** Compass heading, degrees clockwise from north. Default 0 (faces −Z). */
  heading: number
  /** Orthometric altitude in metres. Omitted uses the scene origin altitude. */
  alt?: number
  /** Catalog preset id (`car`, `white-truck`, `a3`, `carrier`, …). */
  vehicle: string
}

/** Local-metre pose for a host vehicle, ready for `placeVehicle`. */
export interface HostVehiclePose {
  position: Vec3Tuple
  /** Gameplay yaw in radians; 0 faces north (−Z). */
  yaw: number
}

/** What {@link installHostVehicles} needs from the browser runtime. */
export interface HostVehicleRuntime {
  placeVehicle(template: Entity, position: Vec3Tuple, yaw?: number): Promise<string>
}

/** Gameplay yaw (radians) for a compass heading in degrees clockwise from north. */
export function headingYaw(headingDegrees: number): number {
  return headingDegrees ? (-headingDegrees * Math.PI) / 180 : 0
}

/** Unit quaternion [x, y, z, w] that faces `headingDegrees` (clockwise from north). */
export function headingRotation(headingDegrees: number): [number, number, number, number] {
  const yaw = headingYaw(headingDegrees)
  return [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  throw new Error(`Host vehicle ${field} must be a finite number`)
}

function parseHostVehicle(value: unknown, index: number): HostVehicle {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Host vehicle ${index} must be an object`)
  const raw = value as Record<string, unknown>
  if (typeof raw.vehicle !== 'string' || raw.vehicle.trim() === '')
    throw new Error(`Host vehicle ${index} needs a vehicle preset id`)
  const lat = finiteNumber(raw.lat, `${index}.lat`)
  const lon = finiteNumber(raw.lon, `${index}.lon`)
  if (!isValidLatLon({ latitude: lat, longitude: lon }))
    throw new Error(`Host vehicle ${index} lat/lon is out of range (lat ±85.05°, lon ±180°)`)
  const heading = raw.heading === undefined ? 0 : finiteNumber(raw.heading, `${index}.heading`)
  const vehicle: HostVehicle = { lat, lon, heading, vehicle: raw.vehicle.trim() }
  if (raw.alt !== undefined) vehicle.alt = finiteNumber(raw.alt, `${index}.alt`)
  return vehicle
}

/** Parse a JSON array of {@link HostVehicle}. Throws on invalid JSON or entries. */
export function parseHostVehicles(raw: string): HostVehicle[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Host vehicles must be a JSON array of {lat, lon, heading, vehicle}')
  }
  if (!Array.isArray(parsed))
    throw new Error('Host vehicles must be a JSON array of {lat, lon, heading, vehicle}')
  return parsed.map(parseHostVehicle)
}

/** Build-time default from `VITE_NABLA_VEHICLES` (same JSON as `?vehicles=`). */
export function viteHostVehicles(): HostVehicle[] {
  const raw = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_NABLA_VEHICLES
  if (raw === undefined || raw.trim() === '') return []
  return parseHostVehicles(raw)
}

/**
 * Read `?vehicles=` from a query string. A missing param uses `fallback`
 * (typically {@link viteHostVehicles}); a present empty value is an empty list.
 */
export function hostVehiclesFromSearch(
  search: string,
  fallback: readonly HostVehicle[] = [],
): HostVehicle[] {
  const raw = new URLSearchParams(search).get('vehicles')
  if (raw === null) return [...fallback]
  if (raw.trim() === '') return []
  return parseHostVehicles(raw)
}

/** Convert one geographic entry to local metres relative to the scene origin. */
export function hostVehicleLocalPose(origin: GeoPoint, spec: HostVehicle): HostVehiclePose {
  return {
    position: geoToLocal(origin, {
      latitude: spec.lat,
      longitude: spec.lon,
      altitude: spec.alt ?? origin.altitude,
    }),
    yaw: headingYaw(spec.heading),
  }
}

/**
 * After `runtime.play()`, rest each extra vehicle on loaded ground at its
 * geographic place. Validates presets first so a typo does not leave a partial fleet.
 */
export async function installHostVehicles(
  runtime: HostVehicleRuntime,
  origin: GeoPoint,
  vehicles: readonly HostVehicle[],
): Promise<string[]> {
  for (const spec of vehicles) {
    if (!hasVehiclePreset(spec.vehicle)) throw new Error(`Unknown vehicle preset: ${spec.vehicle}`)
  }
  const ids: string[] = []
  for (const [index, spec] of vehicles.entries()) {
    const pose = hostVehicleLocalPose(origin, spec)
    const template = presetVehicle(spec.vehicle, `host-${spec.vehicle}-${index}`)
    ids.push(await runtime.placeVehicle(template, pose.position, pose.yaw))
  }
  return ids
}
