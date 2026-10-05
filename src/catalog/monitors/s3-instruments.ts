import type { CarInstrumentDefinition } from '../../render/entity/car-instrument-definition.js'
import { gearLabel } from '../../entity/vehicle/gear-label.js'
import { carMenuDefinition, carMenuItems } from './car.js'
import { s3ClusterDefinition } from './s3-cluster.js'

/** Data/artwork recipe, usable in a car or on a standalone monitor. No vehicle instance. */
export const s3Instruments: CarInstrumentDefinition = {
  cluster: s3ClusterDefinition,
  menu: carMenuDefinition,
  menuItems: carMenuItems,
  menuTitle: 'MENU COCHE',
  clusterData({ speedKmh, rpm, gear, load, manual, parked }) {
    const speed = Math.round(Math.abs(speedKmh))
    return {
      values: {
        speed: Math.abs(speedKmh),
        speedDisplay: String(speed),
        rpm,
        gear: gearLabel(gear, manual, parked),
        throttle: `${Math.round(load * 100)} %`,
      },
      bars: { speed: speed / 320, rpm: rpm / 7000, throttle: load },
    }
  },
  menuData(
    menu,
    {
      mirrorTilt,
      mapFollow = true,
      heading = 0,
      longitude,
      latitude,
      altitude = 0,
      geography = false,
    },
  ) {
    const gps = menu.title === 'POSICION'
    const place =
      geography &&
      longitude != null &&
      latitude != null &&
      Number.isFinite(longitude) &&
      Number.isFinite(latitude)
    return {
      values: {
        row0: gps ? '' : (menu.items[menu.selected]?.label ?? ''),
        row1: gps ? '' : (menu.items[menu.selected + 1]?.label ?? ''),
        row2: gps ? '' : (menu.items[menu.selected + 2]?.label ?? ''),
        title: gps
          ? 'RUMBO'
          : menu.title === 'ESPEJOS'
            ? `ESPEJOS ${mirrorTilt} GRADOS`
            : menu.title === 'MAPA'
              ? mapFollow
                ? 'SIGUE AL COCHE'
                : 'CLAVADO AL NORTE'
              : menu.title,
        heading: gps ? String(heading).padStart(3, '0') : '',
        lon: gps ? (place ? `LON ${longitude.toFixed(6)}` : 'LON SIN GEO') : '',
        lat: gps ? (place ? `LAT ${latitude.toFixed(6)}` : 'LAT SIN GEO') : '',
        alt: gps ? `ALT ${Number.isFinite(altitude) ? `${Math.round(altitude)} M` : '---'}` : '',
        help: 'FLECHAS  ENTER  ESC: ATRAS  J: SALIR',
      },
      bars: { selection: gps ? 0 : 1 },
    }
  },
}
