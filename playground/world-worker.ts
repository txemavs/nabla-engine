import { loadPrepared, PreparationClient } from './prepared-world.js'
const preparation = new PreparationClient()
import { prepareMapGeometry, mapGeometryTransfers } from './map-geometry.js'
import { loadWorldTile, loadDistantTerrain } from './world-provider.js'
import type { GeoPoint } from '../src/geography.js'
const controllers = new Map<number, AbortController>()
self.onmessage = async (
  event: MessageEvent<{
    id: number
    prepare?: string[]
    key?: string
    origin?: GeoPoint
    cancel?: boolean
    destination?: boolean
    far?: [number, number]
  }>,
) => {
  const { id, key, origin, cancel, far, prepare } = event.data
  if (prepare && origin) {
    void preparation.enqueue(origin, prepare)
    return
  }
  if (cancel) {
    controllers.get(id)?.abort()
    return
  }
  const controller = new AbortController()
  controllers.set(id, controller)
  try {
    if (far) {
      const terrain = await loadDistantTerrain(origin!, far[0], far[1], controller.signal)
      if (!controller.signal.aborted) self.postMessage({ id, terrain })
      return
    }
    if (!event.data.destination) {
      const cached = await loadPrepared(origin!, key!, controller.signal)
      if (cached && !controller.signal.aborted) {
        self.postMessage({ id, ...cached }, { transfer: mapGeometryTransfers(cached.geometry) })
        return
      }
    }
    const entities = await loadWorldTile(origin!, key!, controller.signal, event.data.destination)
    if (!controller.signal.aborted) {
      const geometry = event.data.destination ? {} : prepareMapGeometry(entities)
      self.postMessage({ id, entities, geometry }, { transfer: mapGeometryTransfers(geometry) })
    }
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
  } finally {
    controllers.delete(id)
  }
}
