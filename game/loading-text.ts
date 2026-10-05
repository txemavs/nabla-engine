/** Spanish loading text: what is happening and, when something fails, the last error, so nothing is silent. */
import type { LoadDiagnostics, StreamError } from '@nabla/engine/render'

export interface LoadStats {
  loaded: number
  missing: number
  pending: number
  failed: number
}

/** Phrase the last streaming error for the player (kind and status come from the engine, not from parsing text). */
export function spanishLoadError(error: StreamError): string {
  const where = error.url ? ` (${shortUrl(error.url)})` : ''
  switch (error.kind) {
    case 'http':
      return `El servidor respondió HTTP ${error.status ?? '?'}${where}`
    case 'timeout':
      return `El servidor no respondió a tiempo${where}`
    case 'network':
      return `No se pudo conectar con el servidor de teselas (red o CORS)${where}`
    case 'insecure':
      return 'La página es https pero las teselas son http: el navegador lo bloquea'
    case 'invalid':
      return `Datos de la celda no válidos${where}`
    case 'worker':
      return `Falló el cargador de celdas: ${error.message}`
    default:
      return `Error al cargar una celda: ${error.message}`
  }
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url, 'http://localhost')
    return u.pathname.split('/').slice(-4).join('/')
  } catch {
    return url
  }
}

/** One status line and one detail line for the loading screen. */
export function describeLoading(
  stats: LoadStats | null,
  diagnostics: LoadDiagnostics | null,
): { status: string; detail: string } {
  if (!stats) return { status: 'Cargando el terreno…', detail: '' }
  const parts = [`${stats.loaded} ${stats.loaded === 1 ? 'celda lista' : 'celdas listas'}`]
  if (stats.pending) parts.push(`${stats.pending} en camino`)
  if (stats.missing)
    parts.push(`${stats.missing} no ${stats.missing === 1 ? 'existe' : 'existen'} en el servidor`)
  const status = `Cargando el terreno · ${parts.join(' · ')}…`
  if (!diagnostics) return { status, detail: '' }
  const detail = [
    `Peticiones: ${diagnostics.manifestsInFlight} manifiestos · ${diagnostics.cellsInFlight} descargas · ${diagnostics.installing} instalando · ${diagnostics.failed} con error`,
  ]
  if (diagnostics.failed && diagnostics.lastError)
    detail.push(`Último error: ${spanishLoadError(diagnostics.lastError)}`)
  return { status, detail: detail.join('\n') }
}
