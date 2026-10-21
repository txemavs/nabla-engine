/** Loading text: what is happening and, when something fails, the last error, so nothing is silent. */
import type { LoadDiagnostics, StreamError } from '@nabla/engine/render'
import { t } from '@nabla/engine/i18n'

export interface LoadStats {
  loaded: number
  missing: number
  pending: number
  failed: number
}

/** Phrase the last streaming error for the player (kind and status come from the engine, not from parsing text). */
export function describeLoadError(error: StreamError): string {
  const where = error.url ? ` (${shortUrl(error.url)})` : ''
  switch (error.kind) {
    case 'http':
      return t('loading.error.http', { status: error.status ?? '?', where })
    case 'timeout':
      return t('loading.error.timeout', { where })
    case 'network':
      return t('loading.error.network', { where })
    case 'insecure':
      return t('loading.error.insecure')
    case 'invalid':
      return t('loading.error.invalid', { where })
    case 'worker':
      return t('loading.error.worker', { message: error.message })
    default:
      return t('loading.error.other', { message: error.message })
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
  if (!stats) return { status: t('loading.terrain'), detail: '' }
  const parts = [
    t(stats.loaded === 1 ? 'loading.cell-ready' : 'loading.cells-ready', { n: stats.loaded }),
  ]
  if (stats.pending) parts.push(t('loading.pending', { n: stats.pending }))
  if (stats.missing)
    parts.push(
      t(stats.missing === 1 ? 'loading.missing-one' : 'loading.missing', { n: stats.missing }),
    )
  const status = t('loading.terrain-status', { parts: parts.join(' · ') })
  if (!diagnostics) return { status, detail: '' }
  const detail = [
    t('loading.requests', {
      manifests: diagnostics.manifestsInFlight,
      cells: diagnostics.cellsInFlight,
      installing: diagnostics.installing,
      failed: diagnostics.failed,
    }),
  ]
  if (diagnostics.failed && diagnostics.lastError)
    detail.push(t('loading.last-error', { error: describeLoadError(diagnostics.lastError) }))
  return { status, detail: detail.join('\n') }
}
