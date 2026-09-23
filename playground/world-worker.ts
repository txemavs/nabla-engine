import { loadGlbWorld } from './glb-world.js'
import { compactMapTags } from '../src/map-metadata.js'
import { mapFingerprint, mapTileEntities } from '../src/world-stream.js'
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
    glbOnly?: boolean
    destination?: boolean
    spacing?: number
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
      const terrain = await loadDistantTerrain(
        origin!,
        far[0],
        far[1],
        controller.signal,
        event.data.spacing,
      )
      if (!controller.signal.aborted) self.postMessage({ id, terrain })
      return
    }
    if (!event.data.destination) {
      const glb = await loadGlbWorld(
        origin!,
        key!,
        controller.signal,
        import.meta.env.VITE_WORLD_PREPARED_URL || '',
      )
      if (event.data.glbOnly && !glb) throw Error('GLB todavía no disponible para esta baldosa')
      const cached = glb ?? (await loadPrepared(origin!, key!, controller.signal))
      if (cached && !controller.signal.aborted) {
        for (const e of cached.entities)
          if (e.source && !e.mapEditable) e.source.tags = compactMapTags(e.source.tags)
        for (const e of cached.entities)
          if (e.terrain && e.id.startsWith('world-terrain')) {
            const key = e.id === 'world-terrain' ? '0_0' : e.id.slice('world-terrain-'.length)
            e.mapBaseline = mapFingerprint(
              mapTileEntities({ version: 1, name: 'Prepared', entities: cached.entities }, key),
            )
          }
        self.postMessage(
          { id, artifact: { format: 'prepared', key }, ...cached },
          { transfer: mapGeometryTransfers(cached.geometry) },
        )
        return
      }
    }
    const entities = await loadWorldTile(origin!, key!, controller.signal, event.data.destination)
    if (!controller.signal.aborted) {
      const geometry = event.data.destination ? {} : prepareMapGeometry(entities)
      self.postMessage(
        { id, entities, geometry, artifact: { format: 'generated', key } },
        { transfer: mapGeometryTransfers(geometry) },
      )
    }
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
  } finally {
    controllers.delete(id)
  }
}
