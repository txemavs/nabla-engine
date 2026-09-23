import type { GeoPoint } from '../src/geography.js'
import { preparedPath } from './prepared-world.js'
import type { MapArtifact } from './map-artifact.js'
const requests = new Map<string, { at: number; promise: Promise<any> }>()
export function tileInspector(
  host: HTMLElement,
  origin: GeoPoint,
  key: string,
  artifact: MapArtifact | undefined,
  reload: (neighbors: boolean) => Promise<void>,
  base = import.meta.env.VITE_WORLD_PREPARED_URL || '',
) {
  const panel = document.createElement('section')
  panel.dataset.tileInfo = key
  panel.style.cssText = 'border-top:1px solid #555;padding:10px 0;overflow-wrap:anywhere'
  const title = document.createElement('strong')
  title.textContent = 'Baldosa ' + key
  const actual = document.createElement('p')
  actual.textContent =
    'En pantalla: ' +
    (artifact?.format === 'glb'
      ? `GLB · revisión ${artifact.revision}`
      : artifact?.format === 'prepared'
        ? 'Binario preparado'
        : artifact?.format === 'generated'
          ? 'Geometría generada'
          : 'Geometría de la escena guardada')
  const status = document.createElement('p')
  status.textContent = 'Comprobando GLB en el servidor…'
  panel.append(title, actual, status)
  host.prepend(panel)
  if (!base) {
    status.textContent = 'Servidor de GLB no configurado'
    return
  }
  const directory = `${base}/${preparedPath(origin, key).replace(/\.json$/, '.glb-tile')}/`
  const cached = requests.get(directory)
  const promise =
    cached && Date.now() - cached.at < 15000
      ? cached.promise
      : fetch(directory + 'manifest.json', {
          cache: 'no-cache',
          signal: AbortSignal.timeout(10000),
        })
          .then((r) => (r.ok ? r.json() : undefined))
          .catch(() => undefined)
  requests.set(directory, { at: Date.now(), promise })
  void promise.then((manifest) => {
    if (!panel.isConnected) return
    if (manifest?.format !== 'nabla-tile-glb-v1' || manifest.key !== key) {
      status.textContent = 'GLB aún no disponible. La escena sigue utilizando su geometría actual.'
      return
    }
    status.textContent = `Servidor: GLB · revisión ${manifest.groundRevision ?? 'original'} · ${manifest.sizeMetres} × ${manifest.sizeMetres} m · rejilla horizontal ${manifest.groundGridMetres ?? '—'} m`
    for (const [layer, label] of [
      ['terrain', 'Descargar terreno GLB'],
      ['buildings-osm', 'Descargar edificios GLB'],
    ]) {
      const link = document.createElement('a')
      const bytes = manifest.byteLengths?.[layer]
      link.textContent =
        label + (typeof bytes === 'number' ? ` · ${(bytes / 1e6).toFixed(2)} MB` : '')
      link.href = directory + layer + '.glb?v=' + encodeURIComponent(manifest.hashes?.[layer] ?? '')
      const name = manifest.downloads?.[layer]
      link.download =
        typeof name === 'string' && /^[\w.-]+\.glb$/.test(name) ? name : layer + '.glb'
      link.style.cssText = 'display:block;margin:8px 0'
      panel.append(link)
      const filename = document.createElement('small')
      filename.textContent = link.download
      panel.append(filename)
    }
    for (const [neighbors, label] of [
      [false, 'Actualizar esta baldosa'],
      [true, 'Actualizar las 9 cercanas'],
    ] as const) {
      const button = document.createElement('button')
      button.textContent = label
      button.onclick = async () => {
        panel.querySelectorAll('button').forEach((b) => (b.disabled = true))
        status.textContent = 'Actualizando formato; se conservan los objetos personalizados…'
        try {
          await reload(neighbors)
        } catch (e) {
          status.textContent = String(e)
        } finally {
          panel.querySelectorAll('button').forEach((b) => (b.disabled = false))
        }
      }
      panel.append(button)
    }
  })
}
