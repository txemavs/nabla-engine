import { Vector3 } from 'three'
export interface NavigationPlace {
  id: string
  text: string
  position: Vector3
}
let provider: () => NavigationPlace[] = () => []
export function setNavigationPlaces(value: () => NavigationPlace[]) {
  provider = value
}
export function navigationPlaces(): NavigationPlace[] {
  return provider()
}
/** OSM settlement points are references, not municipal boundary polygons. */
export function nearestLocality(position: readonly number[]): string {
  let nearest: NavigationPlace | undefined,
    distance = 20000
  for (const place of provider()) {
    const d = Math.hypot(place.position.x - position[0], place.position.z - position[2])
    if (d < distance) {
      distance = d
      nearest = place
    }
  }
  return nearest ? `${distance > 2000 ? 'Cerca de ' : ''}${nearest.text}` : 'Localidad sin datos'
}
