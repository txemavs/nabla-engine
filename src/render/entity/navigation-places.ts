import { Vector3 } from 'three'
import type { OsmChartRoad } from '../../planet/osm-snapshot.js'

export interface NavigationPlace {
  id: string
  text: string
  position: Vector3
}

export type NavigationRoad = OsmChartRoad

let places: () => NavigationPlace[] = () => []
let roads: () => NavigationRoad[] = () => []

export function setNavigationPlaces(value: () => NavigationPlace[]) {
  places = value
}
export function navigationPlaces(): NavigationPlace[] {
  return places()
}
export function setNavigationRoads(value: () => NavigationRoad[]) {
  roads = value
}
export function navigationRoads(): NavigationRoad[] {
  return roads()
}

/** OSM settlement points are references, not municipal boundary polygons. */
export function nearestLocality(position: readonly number[]): string {
  let nearest: NavigationPlace | undefined,
    distance = 20000
  for (const place of places()) {
    const d = Math.hypot(place.position.x - position[0], place.position.z - position[2])
    if (d < distance) {
      distance = d
      nearest = place
    }
  }
  return nearest ? `${distance > 2000 ? 'Cerca de ' : ''}${nearest.text}` : 'Localidad sin datos'
}

function segmentDistance(
  x: number,
  z: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax
  const dz = bz - az
  const length = dx * dx + dz * dz
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length))
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t))
}

function polylineDistance(x: number, z: number, road: NavigationRoad): number {
  let nearest = Infinity
  for (let i = 1; i < road.points.length; i++) {
    const d = segmentDistance(
      x,
      z,
      road.points[i - 1].x,
      road.points[i - 1].z,
      road.points[i].x,
      road.points[i].z,
    )
    if (d < nearest) nearest = d
  }
  return nearest
}

/** Named street under the pose, or undefined when none is close enough. */
export function nearestStreet(
  position: readonly number[],
  extra: readonly NavigationRoad[] = [],
): string | undefined {
  const x = position[0],
    z = position[2]
  let best: { name: string; dist: number; carriageway: boolean } | undefined
  for (const road of [...roads(), ...extra]) {
    if (!road.name) continue
    const pad = Math.max(road.width / 2 + 8, 16)
    if (x < road.minX - pad || x > road.maxX + pad || z < road.minZ - pad || z > road.maxZ + pad)
      continue
    const dist = polylineDistance(x, z, road)
    if (dist > pad) continue
    if (
      !best ||
      dist < best.dist - 0.4 ||
      (Math.abs(dist - best.dist) <= 0.4 && road.carriageway && !best.carriageway)
    )
      best = { name: road.name, dist, carriageway: road.carriageway }
  }
  return best?.name
}

/** Street when the OSM/scene road is under the car; city/locality otherwise. */
export function navigationLabel(
  position: readonly number[],
  extra: readonly NavigationRoad[] = [],
): string {
  return nearestStreet(position, extra) ?? nearestLocality(position)
}
