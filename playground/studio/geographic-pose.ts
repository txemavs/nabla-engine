import { fromWorldPose, toWorldPose, worldPoseGeography } from '../../src/world-pose.js'
import type { GeoPoint } from '../../src/geography.js'
import type { Transform } from '../../src/scene.js'

/** The implicit anchor follows the object's position; explicit anchors retain local offsets. */
export function geographicPose(origin: GeoPoint, world: Transform, fixed?: GeoPoint) {
  const planetary = toWorldPose(origin, world)
  const anchor = fixed ?? worldPoseGeography(planetary)
  const pose = fromWorldPose(anchor, planetary)
  if (!fixed) pose.position = [0, 0, 0]
  return { anchor, pose }
}
export function anchoredWorldPose(origin: GeoPoint, anchor: GeoPoint, pose: Transform): Transform {
  if (
    !Number.isFinite(anchor.latitude) ||
    Math.abs(anchor.latitude) > 90 ||
    !Number.isFinite(anchor.longitude) ||
    Math.abs(anchor.longitude) > 180 ||
    !Number.isFinite(anchor.altitude) ||
    anchor.altitude <= -6371000
  )
    throw new Error('Coordenadas geográficas no válidas')
  const world = fromWorldPose(origin, toWorldPose(anchor, pose))
  if (world.position.some((n) => Math.abs(n) > 100000000))
    throw new Error('Destino fuera del límite de coordenadas del planeta.')
  return world
}
