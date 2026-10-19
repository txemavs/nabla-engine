import { readFileSync } from 'node:fs'
import { Group, Mesh, BoxGeometry, MeshStandardMaterial, Object3D } from 'three'
import { expect, it } from 'vitest'
import { vehicleExhaustField, vehicleField } from '../../src/entity/vehicle/field.js'
import {
  exhaustOutlets,
  exhaustSmokeAmount,
  exhaustSmokeOptions,
} from '../../src/render/vehicle-presentation/exhaust.js'
import { MotorcycleInstruments } from '../../src/render/vehicle-presentation/motorcycle-instruments.js'
import { stockVehiclePresentation } from '../../src/catalog/presentation/road-vehicles.js'
import { createEntity } from '../../src/entity/schema.js'

const library = (path: string) => JSON.parse(readFileSync(`assets/library/${path}.json`, 'utf8'))

it('creates sockets for listed outlets and finds the anchored outlet otherwise', () => {
  const model = new Group()
  const sockets = exhaustOutlets(model, {
    outlets: [
      [1, 2, 3],
      [4, 5, 6],
    ],
  })
  expect(sockets.map((socket) => socket.position.toArray())).toEqual([
    [1, 2, 3],
    [4, 5, 6],
  ])
  expect(sockets.every((socket) => socket.parent === model)).toBe(true)
  // Nothing listed and nothing tagged: no outlet.
  expect(exhaustOutlets(new Group())).toEqual([])
  const anchored = new Group()
  const pipe = new Mesh(new BoxGeometry(2, 2, 2).translate(1, 0, 0), new MeshStandardMaterial())
  pipe.userData.nabla = { anchor: 'exhaust' }
  anchored.add(pipe)
  const [socket] = exhaustOutlets(anchored)
  expect(socket.parent).toBe(pipe)
  expect(socket.position.x).toBeCloseTo(1)
  // The deprecated node name still works.
  const legacy = new Group()
  const closure = new Object3D()
  closure.name = 'Exhaust_Outlet_Closure'
  legacy.add(closure)
  expect(exhaustOutlets(legacy)[0].parent).toBe(closure)
})

it('passes on only the smoke options the vehicle states, and follows its amount mode', () => {
  expect(exhaustSmokeOptions()).toEqual({})
  expect(
    exhaustSmokeOptions({
      direction: [0, 1, 0],
      smoke: { emissionRate: 32, capacity: 96, color: '#111111', size: 650 },
    }),
  ).toEqual({ direction: [0, 1, 0], emissionRate: 32, capacity: 96, color: '#111111', size: 650 })
  const idle = { rpm: 800, engineLoad: 0 }
  const loaded = { rpm: 7000, engineLoad: 1 }
  expect(exhaustSmokeAmount(undefined, loaded)).toBe(1)
  expect(exhaustSmokeAmount('full', idle)).toBe(1)
  expect(exhaustSmokeAmount('manual', idle, 0.4)).toBe(0.4)
  expect(exhaustSmokeAmount('load', idle)).toBeCloseTo(0.1)
  expect(exhaustSmokeAmount('load', loaded)).toBeCloseTo(1)
  expect(exhaustSmokeAmount('rpm', loaded)).toBeCloseTo(2)
})

it('rejects unknown or out of range exhaust data', () => {
  expect(() => vehicleExhaustField.parse({ outlets: [] })).toThrow()
  expect(() => vehicleExhaustField.parse({ offset: [0, 5, 0] })).toThrow()
  expect(() => vehicleExhaustField.parse({ smoke: { amount: 'sometimes' } })).toThrow()
  expect(() => vehicleExhaustField.parse({ typo: true })).toThrow()
})

it('ships the exhaust mounts and rear wash flags that used to be code, as vehicle data', () => {
  const vfr = library('motorcycles/vfr800fi-1999/vfr800')
  expect(vehicleExhaustField.parse(vfr.vehicle.exhaust)).toEqual({
    offset: [0, -0.05, -0.05],
    smoke: { amount: 'load' },
  })
  expect(vfr.visual.presentation).toBe('nabla.motorcycle')
  expect(library('motorcycles/vfr800fi-1999/vfr800-quest').vehicle.exhaust).toEqual(
    vfr.vehicle.exhaust,
  )
  expect(vehicleExhaustField.parse(library('cars/a3/s3').vehicle.exhaust)).toEqual({
    outlets: [
      [0.535, 0.27, -2.16],
      [0.645, 0.27, -2.16],
    ],
    direction: [0, 0.2, -1],
    offset: [0.088, -0.015, -0.025],
    smoke: { amount: 'rpm', emissionRate: 32, capacity: 96 },
  })
  const truck = library('cars/white-truck/white-truck')
  expect(vehicleExhaustField.parse(truck.vehicle.exhaust)).toMatchObject({
    outlets: [[-1.08, 1.86, -0.72]],
    adjustable: true,
    smoke: { amount: 'manual', clearAtKmh: 60, size: 650 },
  })
  for (const file of [
    'white-truck',
    'white-car-transporter',
    'white-trailer',
    'white-trailer-chassis',
  ])
    expect(library(`cars/white-truck/${file}`).vehicle.lights.rearWash).toBe(true)
  for (const file of [
    'motorcycles/vfr800fi-1999/vfr800',
    'cars/a3/s3',
    'cars/white-truck/white-truck',
  ])
    expect(() => vehicleField.shape.exhaust.parse(library(file).vehicle.exhaust)).not.toThrow()
})

it('binds instruments by their nabla tags, whatever the nodes are called', () => {
  const model = new Group()
  const dial = new Object3D()
  dial.name = 'any dial'
  dial.userData.nabla = { gauge: 'speedometer', diameter: 0.06 }
  const lamp = new Object3D()
  lamp.name = 'any lamp'
  lamp.userData.nabla = { lamp: 'warning', slot: 1, diameter: 0.01 }
  model.add(dial, lamp)
  expect(MotorcycleInstruments.bind(model)).not.toBeNull()
  expect(MotorcycleInstruments.bind(new Group())).toBeNull()
})

it('picks a presentation only by the name in the vehicle data, never by its class', () => {
  const bike = createEntity('bike', 'vehicle')
  bike.vehicle = { twoWheeled: {} } as never
  expect(stockVehiclePresentation(bike)).toBeUndefined()
  bike.visual = { body: { url: '/a.glb' }, presentation: 'nabla.motorcycle' } as never
  expect(stockVehiclePresentation(bike)).toBeDefined()
})
