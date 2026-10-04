import { describe, expect, it } from 'vitest'
import { describeLoading, spanishLoadError } from '../../game/loading-text.js'

const idle = { manifestsInFlight: 0, cellsInFlight: 0, installing: 0, failed: 0, missing: 0 }

describe('loading text', () => {
  it('shows the cells ready, in flight and absent, never an index total', () => {
    const { status } = describeLoading({ loaded: 3, missing: 2, pending: 4, failed: 0 }, idle)
    expect(status).toBe(
      'Cargando el terreno · 3 celdas listas · 4 en camino · 2 no existen en el servidor…',
    )
    expect(status).not.toMatch(/\d+ de \d+/)
    expect(describeLoading({ loaded: 1, missing: 1, pending: 0, failed: 0 }, idle).status).toBe(
      'Cargando el terreno · 1 celda lista · 1 no existe en el servidor…',
    )
  })

  it('surfaces a failing manifest instead of waiting silently at 0 cells (regression: stuck "0 de 33")', () => {
    const text = describeLoading(
      { loaded: 0, missing: 0, pending: 0, failed: 1 },
      {
        ...idle,
        failed: 1,
        lastError: {
          kind: 'network',
          message: 'Failed to fetch',
          url: 'https://atlas.chained.world/euskadi/terraform/z/15/16211/12003/manifest.json',
        },
      },
    )
    expect(text.status).toBe('Cargando el terreno · 0 celdas listas…')
    expect(text.detail).toContain('1 con error')
    expect(text.detail).toContain(
      'Último error: No se pudo conectar con el servidor de teselas (red o CORS)',
    )
    expect(text.detail).toContain('15/16211/12003/manifest.json')
  })

  it('says what is in flight and hides the error line when nothing failed', () => {
    const text = describeLoading(
      { loaded: 0, missing: 0, pending: 2, failed: 0 },
      { ...idle, manifestsInFlight: 2, cellsInFlight: 1 },
    )
    expect(text.detail).toBe('Peticiones: 2 manifiestos · 1 descargas · 0 instalando · 0 con error')
    expect(describeLoading(null, null)).toEqual({ status: 'Cargando el terreno…', detail: '' })
  })

  it('phrases every error kind in Spanish', () => {
    const at = (kind: string, status?: number) =>
      spanishLoadError({ kind, message: 'boom', status, url: '/t/z/15/1/2/manifest.json' } as never)
    expect(at('http', 500)).toContain('HTTP 500')
    expect(at('timeout')).toContain('no respondió a tiempo')
    expect(at('insecure')).toContain('https')
    expect(at('invalid')).toContain('no válidos')
    expect(at('worker')).toContain('Falló el cargador')
    expect(at('cell')).toContain('Error al cargar una celda: boom')
  })
})
