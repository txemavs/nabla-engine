import { describe, expect, it } from 'vitest'
import {
  addLabel,
  formatMetres,
  objectChoices,
  seaStatus,
  vehicleChoices,
  menuPreloadVehicles,
  withSceneParams,
} from '../../game/scene-controls.js'
import {
  parseSeaParam,
  parseTerrainConfig,
  parseTimeParam,
  parseTimeSpeedParam,
} from '../../game/terrain.js'

it('prepares the common menu vehicles and permits an explicit reduced or empty list', () => {
  expect(menuPreloadVehicles().map((assembly) => assembly[0].visual?.presentation)).toHaveLength(3)
  expect(menuPreloadVehicles([])).toEqual([])
  expect(menuPreloadVehicles(['car', 'car', 'unknown'])).toHaveLength(1)
})

describe('&time= and &sea= URL parameters', () => {
  it('reads the time as minutes after midnight, or the real clock', () => {
    expect(parseTimeParam('21:30')).toBe(1290)
    expect(parseTimeParam('7')).toBe(420)
    expect(parseTimeParam('ahora')).toBe('live')
    expect(parseTimeParam('NOW')).toBe('live')
  })

  it('explains bad times and sea levels in Spanish', () => {
    expect(() => parseTimeParam('25:00')).toThrow(/time debe ser una hora HH:MM/)
    expect(() => parseTimeParam('mediodía')).toThrow(/time debe ser/)
    expect(() => parseSeaParam('')).toThrow(/sea debe ser un número/)
    expect(() => parseSeaParam('mucho')).toThrow(/sea debe ser un número/)
    expect(() => parseSeaParam('51')).toThrow(/entre -5 y 50/)
    expect(() => parseSeaParam('-5.1')).toThrow(/entre -5 y 50/)
    expect(parseTimeSpeedParam('12')).toBe(12)
    expect(parseTimeSpeedParam('24')).toBe(24)
    expect(() => parseTimeSpeedParam('0')).toThrow(/timeSpeed/)
    expect(() => parseTimeSpeedParam('25')).toThrow(/entre 1 y 24/)
  })

  it('accepts metres with a decimal point or comma, inside the Studio range', () => {
    expect(parseSeaParam('3')).toBe(3)
    expect(parseSeaParam('-2,5')).toBe(-2.5)
    expect(parseSeaParam('50')).toBe(50)
    expect(parseSeaParam('-5')).toBe(-5)
  })

  it('arrives in the terrain configuration, and is absent without the parameters', () => {
    const config = parseTerrainConfig(
      '?terrain=/terrain&lat=43.3386&lon=-1.7899&time=21:30&timeSpeed=12&sea=3',
    )
    expect([config.timeOfDay, config.timeSpeed, config.seaLevel]).toEqual([1290, 12, 3])
    const plain = parseTerrainConfig('?terrain=/terrain&lat=43.3386&lon=-1.7899')
    expect([plain.timeOfDay, plain.seaLevel]).toEqual([undefined, undefined])
    expect(() => parseTerrainConfig('?terrain=/terrain&tile=16221/11998&sea=99')).toThrow(/sea/)
  })
})

describe('menu helpers', () => {
  it('writes time and sea into the URL and keeps everything else', () => {
    const next = withSceneParams('?terrain=/terrain&lat=1&lon=2&quality=low', {
      time: '21:30',
      sea: 3.04,
    })
    const params = new URLSearchParams(next)
    expect([params.get('time'), params.get('sea'), params.get('quality')]).toEqual([
      '21:30',
      '3',
      'low',
    ])
    expect(next).toContain('time=21:30')
    const cleared = withSceneParams(next, { sea: null })
    expect(cleared).not.toContain('sea=')
    expect(cleared).toContain('time=21:30')
    expect(withSceneParams('?time=1:00', { time: null })).toBe('')
    expect(withSceneParams('?a=1', {})).toBe('?a=1')
    const sped = withSceneParams('?terrain=/terrain', { timeSpeed: 12 })
    expect(new URLSearchParams(sped).get('timeSpeed')).toBe('12')
    expect(withSceneParams(sped, { timeSpeed: 1 })).not.toContain('timeSpeed')
  })

  it('shows metres with a decimal comma', () => {
    expect(formatMetres(3)).toBe('3,0 m')
    expect(formatMetres(-2.5)).toBe('−2,5 m')
    expect(seaStatus({ level: 0.4, state: 'Subiendo' }, false)).toBe(
      'Marea automática: 0,4 m (Subiendo)',
    )
    expect(seaStatus({ level: 3, state: 'Manual' }, true)).toBe('Nivel fijo: 3,0 m')
  })

  it('offers the drivable catalog vehicles and leaves out the passive trailer', () => {
    const ids = vehicleChoices().map((choice) => choice.id)
    expect(ids).toEqual(expect.arrayContaining(['car', 'white-truck', 'carrier']))
    // The A3 stays an internal preset (Studio, examples, tests); the S3 in Normal mode covers it.
    expect(ids).not.toContain('a3')
    expect(ids).not.toContain('white-trailer')
    expect(ids).not.toContain('white-trailer-chassis')
    for (const choice of vehicleChoices()) expect(choice.label.length).toBeGreaterThan(0)
  })
})

describe('add menu objects', () => {
  it('offers Portal, Galería 2.5D, Sprite and both lamps after the vehicles', () => {
    expect(objectChoices().map((choice) => choice.label)).toEqual([
      'Portal',
      'Galería 2.5D',
      'Sprite',
      'Farola de autopista',
      'Farola de barrio',
    ])
    const vehicles = new Set(vehicleChoices().map((choice) => choice.id))
    for (const choice of objectChoices()) expect(vehicles.has(choice.id)).toBe(false)
  })

  it('names the button after the selected entry', () => {
    expect(addLabel('portal')).toBe('Añadir portal')
    expect(addLabel('gallery')).toBe('Añadir galería 2.5D')
    expect(addLabel('globe')).toBe('Añadir farola de barrio')
    expect(addLabel('carrier')).toBe('Añadir vehículo')
  })
})
