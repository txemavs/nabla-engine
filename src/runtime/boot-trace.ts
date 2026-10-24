/** Browser startup spans share one navigation clock, including across source/package module copies. */
export type BootGroup =
  | '01 Entrada'
  | '02 Escena y runtime'
  | '03 Mundo y recursos'
  | '04 Física'
  | '05 GPU y presentación'
  | '06 Esperas del host'
  | '07 Entrada al juego'
  | 'Paralelo'
  | 'Contenedores'
  | 'Otros'

export interface BootSpan {
  order: number
  phase: string
  group?: BootGroup
  startedMs: number
  durationMs?: number
}

const KEY = Symbol.for('nabla.bootTrace')
type Holder = { [KEY]?: BootSpan[] }

/** Read the timeline without exposing its mutable records. Durations are wall time, not CPU time. */
export function bootTraceEntries(): BootSpan[] {
  return ((globalThis as Holder)[KEY] ?? []).map((entry) => ({ ...entry }))
}

/** Begin a named span; the returned idempotent function logs completion, elapsed and navigation time. */
export function startBootPhase(
  phase: string,
  startedMs = performance.now(),
  group?: BootGroup,
): () => void {
  const entries = ((globalThis as Holder)[KEY] ??= [])
  const entry: BootSpan = { order: entries.length + 1, phase, startedMs }
  if (group) entry.group = group
  entries.push(entry)
  const prefix = `[nabla-boot #${entry.order}]${group ? ` [${group}]` : ''}`
  console.info(`${prefix} INICIO ${phase} | total ${startedMs.toFixed(1)} ms`)
  return () => {
    if (entry.durationMs !== undefined) return
    const now = performance.now()
    entry.durationMs = now - startedMs
    console.info(
      `${prefix} FIN ${phase} | fase ${entry.durationMs.toFixed(1)} ms | total ${now.toFixed(1)} ms`,
    )
  }
}

/** Union of completed intervals in one group; nested/parallel spans are never counted twice. */
export function measuredBootTime(entries: readonly BootSpan[]): number {
  const intervals = entries
    .filter((e) => e.durationMs !== undefined)
    .map((e) => [e.startedMs, e.startedMs + e.durationMs!])
    .sort((a, b) => a[0] - b[0])
  let total = 0,
    start = 0,
    end = 0
  for (const [a, b] of intervals) {
    if (a > end) {
      total += end - start
      start = a
      end = b
    } else end = Math.max(end, b)
  }
  return total + end - start
}

/** Group only the final snapshot: async completion cannot corrupt live console nesting. */
export function summarizeBootTrace(): void {
  const entries = bootTraceEntries()
  const rows = (spans: BootSpan[]) =>
    spans.map((e) => ({
      orden: e.order,
      fase: e.phase,
      inicioMs: Math.round(e.startedMs),
      duracionMs: e.durationMs === undefined ? 'en curso' : Math.round(e.durationMs),
      finMs: e.durationMs === undefined ? 'en curso' : Math.round(e.startedMs + e.durationMs),
    }))
  const groups = [...new Set(entries.map((e) => e.group ?? 'Otros'))].sort()
  console.info(
    '[nabla-boot] Juego visible. Tiempo medido por grupo sin duplicar solapamientos internos; los grupos pueden solaparse. Contenedores incluye bloques padre: no sumar al resto.',
  )
  console.table(
    groups
      .filter((group) => group !== 'Contenedores')
      .map((group) => {
        const spans = entries.filter((e) => (e.group ?? 'Otros') === group)
        return {
          grupo: group,
          pasos: spans.length,
          tiempoMedidoMs: Math.round(measuredBootTime(spans)),
        }
      }),
  )
  for (const group of groups) {
    console.groupCollapsed('[nabla-boot] ' + group)
    console.table(rows(entries.filter((e) => (e.group ?? 'Otros') === group)))
    console.groupEnd()
  }
  console.groupCollapsed('[nabla-boot] Cronología completa (orden de inicio)')
  console.table(rows(entries))
  console.groupEnd()
}
