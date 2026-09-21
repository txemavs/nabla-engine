import { loadWorldTile } from './world-provider.js'
import type { GeoPoint } from '../src/geography.js'
const controllers = new Map<number, AbortController>()
self.onmessage = async (
  event: MessageEvent<{ id: number; key?: string; origin?: GeoPoint; cancel?: boolean }>,
) => {
  const { id, key, origin, cancel } = event.data
  if (cancel) {
    controllers.get(id)?.abort()
    return
  }
  const controller = new AbortController()
  controllers.set(id, controller)
  try {
    const entities = await loadWorldTile(origin!, key!, controller.signal)
    if (!controller.signal.aborted) self.postMessage({ id, entities })
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
  } finally {
    controllers.delete(id)
  }
}
