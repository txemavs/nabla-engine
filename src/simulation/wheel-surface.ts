/**
 * Asphalt versus grass from the road network, not from the collider.
 *
 * Wheel rays hit one terrain body (a single material) for a draped road, so the contact
 * has no surface id. The carriageway is the mapped centreline and its width: scene roads
 * plus the host's OSM navigation roads (the same ones the R reset snaps to). A contact
 * inside that width is asphalt. Outside it, with road data loaded, it is grass. No road
 * data at all stays unknown — grip and skid colour are not invented.
 *
 * This does not see a paved lot that is not a carriageway. Those read as grass.
 */
import { nearestRoadPoint, type RoadCenterline } from './road-snap.js'

export type WheelSurface = 'asphalt' | 'grass'

/**
 * Fraction of the vehicle's own tyre grip on grass. TODO(unverified): not a measured
 * friction coefficient. It scales each vehicle's grip (car, bike, truck), so a heavier
 * vehicle keeps a heavier share.
 */
export const GRASS_GRIP = 0.42

/** Extra metres outside the mapped half-width so a tyre on the edge line still counts. */
const EDGE_M = 0.15

/** How far from every centreline still counts as "off the mapped roads" rather than unknown. */
export const SURFACE_SEARCH_M = 80

export function surfaceGripScale(surface: WheelSurface | null | undefined): number {
  return surface === 'grass' ? GRASS_GRIP : 1
}

/**
 * `roads` empty → null (unknown). Otherwise asphalt inside the nearest carriageway's
 * width, grass when the nearest one is farther than that (including farther than the search).
 */
export function classifyWheelSurface(
  x: number,
  z: number,
  roads: readonly RoadCenterline[],
  maxDistance = SURFACE_SEARCH_M,
): WheelSurface | null {
  if (!roads.length || !Number.isFinite(x) || !Number.isFinite(z)) return null
  const hit = nearestRoadPoint(x, z, roads, maxDistance)
  if (!hit || !(hit.width > 0)) return hit ? null : 'grass'
  return hit.distance <= hit.width / 2 + EDGE_M ? 'asphalt' : 'grass'
}
