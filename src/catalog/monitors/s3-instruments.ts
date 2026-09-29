import type { CarInstrumentDefinition } from '../../render/entity/car-instrument-definition.js'
import { carMenuDefinition, carMenuItems } from './car.js'
import { s3ClusterDefinition } from './s3-cluster.js'

/** Data/artwork recipe, usable in a car or on a standalone monitor. No vehicle instance. */
export const s3Instruments: CarInstrumentDefinition = {
  cluster: s3ClusterDefinition,
  menu: carMenuDefinition,
  menuItems: carMenuItems,
  menuTitle: 'MENU COCHE',
  clusterData({ speedKmh, rpm, gear, load, manual }) {
    const speed = Math.round(Math.abs(speedKmh))
    return {
      values: {
        speed: Math.abs(speedKmh),
        speedDisplay: String(speed),
        rpm,
        gear: gear < 0 ? 'R' : `${manual ? 'M' : 'D'}${gear}`,
        throttle: `${Math.round(load * 100)} %`,
      },
      bars: { speed: speed / 320, rpm: rpm / 7000, throttle: load },
    }
  },
  menuData(menu, { mirrorTilt }) {
    return {
      values: {
        row0: menu.items[menu.selected]?.label ?? '',
        row1: menu.items[menu.selected + 1]?.label ?? '',
        row2: menu.items[menu.selected + 2]?.label ?? '',
        title: menu.title === 'ESPEJOS' ? `ESPEJOS ${mirrorTilt} GRADOS` : menu.title,
        help: 'FLECHAS  ENTER  ESC: ATRAS  J: SALIR',
      },
      bars: {},
    }
  },
}
