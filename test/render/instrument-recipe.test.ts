import { expect, it } from 'vitest'
import { s3Instruments } from '../../src/catalog/monitors/s3-instruments.js'
import { s3ClusterDefinition } from '../../src/catalog/monitors/s3-cluster.js'
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
})
