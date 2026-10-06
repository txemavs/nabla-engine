import type { MonitorDefinition } from '../monitors/layered-monitor.js'
import type { MonitorData } from '../monitors/data.js'
import type { MonitorMenu, MonitorMenuItem } from '../monitors/menu.js'

/** Presentation input only. The host owns simulation, input and persisted properties. */
export interface CarInstrumentTelemetry {
  speedKmh: number
  rpm: number
  gear: number
  load: number
  manual: boolean
  /** P selected: gear is 0 and the cluster shows P instead of N. */
  parked?: boolean
}

/** A stock-car adapter receives this recipe; neither renderer nor monitor chooses a preset. */
export interface CarInstrumentDefinition {
  cluster: MonitorDefinition
  menu: MonitorDefinition
  menuItems: readonly MonitorMenuItem[]
  menuTitle: string
  clusterData(telemetry: CarInstrumentTelemetry): MonitorData
  menuData(
    menu: MonitorMenu,
    properties: {
      mirrorTilt: number
      mapFollow?: boolean
      heading?: number
      longitude?: number
      latitude?: number
      altitude?: number
      geography?: boolean
    },
  ): MonitorData
}

/**
 * Instrument self-test overlay: every needle of `cluster` travels from its real reading to full
 * scale as `sweep` goes 0 to 1 (and back as it returns), and the bar with the same binding (if
 * any) fills the same way. The sweep therefore starts and ends on the live value (an idling
 * rev counter, a speedometer at 0) without a jump. Readouts such as the digital speed and the
 * gear letter keep their real values. `sweep` 0 returns `data` unchanged, so any cluster
 * artwork (car, truck, custom) gets the sweep without per-vehicle code.
 */
export function sweepCluster(
  cluster: MonitorDefinition,
  data: MonitorData,
  sweep: number,
): MonitorData {
  if (!(sweep > 0)) return data
  const t = Math.min(1, sweep)
  const values = { ...data.values }
  const bars = { ...data.bars }
  for (const layer of cluster.layers) {
    if (layer.kind !== 'needle') continue
    const reading = data.values[layer.binding]
    const real =
      typeof reading === 'number' && Number.isFinite(reading)
        ? Math.min(layer.max, Math.max(layer.min, reading))
        : layer.min
    values[layer.binding] = real + (layer.max - real) * t
    if (layer.binding in bars) {
      const bar = Math.min(1, Math.max(0, bars[layer.binding] ?? 0))
      bars[layer.binding] = bar + (1 - bar) * t
    }
  }
  return { values, bars }
}
