import { expect, it } from 'vitest'
import { Euler, Quaternion } from 'three'
import { s3Instruments } from '../../src/catalog/monitors/s3-instruments.js'
import { s3ClusterDefinition } from '../../src/catalog/monitors/s3-cluster.js'
import { vehicleRumbo } from '../../src/render/entity/car-instruments.js'
import { MonitorMenu } from '../../src/render/monitors/menu.js'
it('preserves speed, manual/reverse gear and dial bindings without a vehicle instance', () => {
  expect(s3Instruments.cluster).toBe(s3ClusterDefinition)
  const reading = s3Instruments.clusterData({
    speedKmh: -123.4,
    rpm: 3500,
    gear: 3,
    load: 0.5,
    manual: true,
  })
  expect(reading).toEqual({
    values: { speed: 123.4, speedDisplay: '123', rpm: 3500, gear: 'M3', throttle: '50 %' },
    bars: { speed: 123 / 320, rpm: 0.5, throttle: 0.5 },
  })
  expect(
    s3Instruments.clusterData({ speedKmh: -10, rpm: 900, gear: -1, load: 0, manual: false }).values
      .gear,
  ).toBe('R')
})
it('each menu owns its navigation while the shared recipe formats three rows and properties', () => {
  const a = new MonitorMenu(s3Instruments.menuItems, s3Instruments.menuTitle)
  const b = new MonitorMenu(s3Instruments.menuItems, s3Instruments.menuTitle)
  a.open = true
  a.key('ArrowDown')
  a.key('Enter')
  expect(a.key('Enter').action).toEqual({ type: 'vehicle.mirror', value: '1' })
  const data = s3Instruments.menuData(a, { mirrorTilt: 3 })
  expect(data.values.title).toBe('ESPEJOS 3 GRADOS')
  expect(data.values.row2).not.toBe('')
  expect(b.depth).toBe(0)
  expect(b.selected).toBe(0)
  b.open = true
  b.key('ArrowDown')
  b.key('ArrowDown')
  b.key('Enter')
  expect(s3Instruments.menuData(b, { mirrorTilt: 0 }).values.title).toBe('SIGUE AL COCHE')
  expect(s3Instruments.menuData(b, { mirrorTilt: 0, mapFollow: false }).values.title).toBe(
    'CLAVADO AL NORTE',
  )
  expect(s3Instruments.menuData(b, { mirrorTilt: 0 }).bars.selection).toBe(1)
})
it('opens POSICION from the car menu and formats live GPS bindings', () => {
  const menu = new MonitorMenu(s3Instruments.menuItems, s3Instruments.menuTitle)
  menu.open = true
  for (let i = 0; i < 3; i++) menu.key('ArrowDown')
  expect(menu.items[menu.selected]?.id).toBe('gps')
  menu.key('Enter')
  expect(menu.title).toBe('POSICION')
  const live = s3Instruments.menuData(menu, {
    mirrorTilt: 0,
    heading: 7,
    longitude: -3.70379,
    latitude: 40.416775,
    altitude: 650.4,
    geography: true,
  })
  expect(live.values).toMatchObject({
    title: 'RUMBO',
    heading: '007',
    lon: 'LON -3.703790',
    lat: 'LAT 40.416775',
    alt: 'ALT 650 M',
    row0: '',
    row1: '',
    row2: '',
  })
  expect(live.bars.selection).toBe(0)
  const missing = s3Instruments.menuData(menu, { mirrorTilt: 0, heading: 359, altitude: 12 })
  expect(missing.values.heading).toBe('359')
  expect(missing.values.lon).toBe('LON SIN GEO')
  expect(missing.values.lat).toBe('LAT SIN GEO')
  expect(missing.values.alt).toBe('ALT 12 M')
})
it('uses the helm sys-rumbo heading convention', () => {
  const quat = (yaw: number) =>
    new Quaternion().setFromEuler(new Euler(0, yaw, 0)).toArray() as [
      number,
      number,
      number,
      number,
    ]
  expect(vehicleRumbo(quat(0))).toBe(0)
  expect(vehicleRumbo(quat(-Math.PI / 2))).toBe(90)
  expect(vehicleRumbo(quat(Math.PI))).toBe(180)
  expect(vehicleRumbo(quat(Math.PI / 2))).toBe(270)
})
