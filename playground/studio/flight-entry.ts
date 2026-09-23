import { SceneGraph, type SceneDocument } from '../../src/scene.js'
import { geoToLocal, localToGeo } from '../../src/geography.js'
export function urlPlay(search: string): boolean {
  const value = new URLSearchParams(search).get('play')
  return value !== null && ['', '1', 'true'].includes(value.toLowerCase())
}
/** Build a temporary play session; never move the saved editor objects. */
export function flightEntry(document: SceneDocument) {
  const scene = structuredClone(document)
  const car = scene.entities.find((e) => e.kind === 'vehicle' && !e.vehicle?.flight)
  const carrier = scene.entities.find((e) => e.kind === 'vehicle' && e.vehicle?.flight)
  if (!car || !carrier) throw Error('Para iniciar en vuelo hacen falta un coche y una nave.')
  const graph = SceneGraph.fromValidated(scene)
  const position = graph.worldTransform(car.id).position
  const rotation = graph.worldTransform(carrier.id).rotation
  const geo = scene.geography
  const point = geo ? localToGeo(geo, position) : null
  carrier.transform = {
    position:
      geo && point
        ? geoToLocal(geo, { ...point, altitude: point.altitude + 120 })
        : [position[0], position[1] + 120, position[2]],
    rotation,
  }
  carrier.parentId = null
  delete carrier.geoAnchor
  delete carrier.groundOffset
  return { scene, vehicleId: carrier.id }
}
