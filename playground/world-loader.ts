import { receiveMapGeometry, type PreparedMapGeometry } from './map-geometry.js'
import type { GeoPoint } from '../src/geography.js'
import type { Entity } from '../src/scene.js'
/** Network, LERC decoding and building generation run away from the driving frame. */
export class WorldLoader {
  private readonly worker = new Worker(new URL('./world-worker.ts', import.meta.url), {
    type: 'module',
  })
  private serial = 0
  private readonly pending = new Map<
    number,
    { resolve: (entities: Entity[]) => void; reject: (error: Error) => void }
  >()
  constructor() {
    this.worker.onmessage = (
      event: MessageEvent<{
        id: number
        entities: Entity[]
        geometry?: PreparedMapGeometry
        error?: string
      }>,
    ) => {
      const request = this.pending.get(event.data.id)
      if (!request) return
      this.pending.delete(event.data.id)
      if (event.data.error) request.reject(new Error(event.data.error))
      else {
        if (event.data.geometry) receiveMapGeometry(event.data.entities, event.data.geometry)
        request.resolve(event.data.entities)
      }
    }
    this.worker.onerror = () => {
      for (const p of this.pending.values()) p.reject(new Error('No se pudo iniciar el cargador'))
      this.pending.clear()
    }
  }
  load(origin: GeoPoint, key: string, signal: AbortSignal, destination = false): Promise<Entity[]> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error('Carga cancelada'))
        return
      }
      const id = ++this.serial
      const abort = () => {
        this.worker.postMessage({ id, cancel: true })
        this.pending.delete(id)
        reject(new Error('Carga cancelada'))
      }
      signal.addEventListener('abort', abort, { once: true })
      this.pending.set(id, {
        resolve: (entities) => {
          signal.removeEventListener('abort', abort)
          resolve(entities)
        },
        reject: (error) => {
          signal.removeEventListener('abort', abort)
          reject(error)
        },
      })
      this.worker.postMessage({ id, key, origin, destination })
    })
  }
  prepare(origin: GeoPoint, keys: string[]): void {
    this.worker.postMessage({ prepare: keys, origin })
  }
  dispose(): void {
    this.worker.terminate()
    for (const p of this.pending.values()) p.reject(new Error('Carga cancelada'))
    this.pending.clear()
  }
}
