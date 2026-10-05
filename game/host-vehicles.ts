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
 *   [{"lat":43.3386,"lon":-1.7899,"heading":118,"vehicle":"white-truck","color":"#2157a5"}]
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
  /** Catalog preset id (`car`, `white-truck`, `white-trailer`, `a3`, `carrier`, …). */
  vehicle: string
  /**
   * Body paint, same `entity.color` field cars already use (`#rrggbb`).
   * Applied to `white-truck` / `white-trailer` through the `nabla.truck` White paint materials.
   */
  color?: string
  /**
   * Hitch this trailer to the previous tractor in the same `vehicles` list
   * (or an explicit tractor id). Free trailers omit it and rest on landing legs.
   */
  tow?: boolean | string
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
  hitchTrailer?(tractorId: string, trailerId: string): string
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
  if (raw.color !== undefined) {
    if (typeof raw.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(raw.color))
      throw new Error(`Host vehicle ${index}.color must be #rrggbb`)
    vehicle.color = raw.color
  }
  if (raw.tow !== undefined) {
    if (raw.tow === true) vehicle.tow = true
    else if (typeof raw.tow === 'string' && raw.tow.trim() !== '') vehicle.tow = raw.tow.trim()
    else throw new Error(`Host vehicle ${index}.tow must be true or a tractor id`)
  }
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
  const placed = new Map<string, { hitch?: [number, number, number] }>()
  let lastTractorId: string | undefined
  for (const [index, spec] of vehicles.entries()) {
    const pose = hostVehicleLocalPose(origin, spec)
    const template = presetVehicle(spec.vehicle, `host-${spec.vehicle}-${index}`)
    if (spec.color) template.color = spec.color
    if (spec.tow) {
      const tractorId = spec.tow === true ? lastTractorId : spec.tow
      const tractor = tractorId ? placed.get(tractorId) : undefined
      if (!tractorId || !tractor?.hitch || !template.vehicle?.towAnchor)
        throw new Error(`Host vehicle ${index} tow needs a previous tractor with a hitch`)
      template.vehicle.tow = {
        vehicleId: tractorId,
        hitch: tractor.hitch,
        anchor: template.vehicle.towAnchor,
      }
    }
    const id = await runtime.placeVehicle(template, pose.position, pose.yaw)
    ids.push(id)
    const hitch = template.vehicle?.hitch
    placed.set(id, {
      hitch: hitch ? [hitch[0], hitch[1], hitch[2]] : undefined,
    })
    if (hitch && !template.vehicle?.passive) lastTractorId = id
  }
  return ids
}
