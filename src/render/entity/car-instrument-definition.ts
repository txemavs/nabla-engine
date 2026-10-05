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
  menuData(menu: MonitorMenu, properties: { mirrorTilt: number; mapFollow?: boolean }): MonitorData
}
