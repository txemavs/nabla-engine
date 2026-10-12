import { expect, it } from 'vitest'
import { VehicleLightController } from '../../src/render/vehicle-presentation/light-controller.js'
import { StartLights } from '../../src/render/vehicle-presentation/start-lights.js'

const powered = { powered: true, braking: false, reversing: false }
it('automatic dipped beams ignore brief shadows and retain a delay when returning to daylight', () => {
  const lights = new VehicleLightController()
  lights.mode = 'auto'
  const beam = () => lights.level('low', 0, powered, 0)
  expect(beam()).toBe(0)
  lights.sampleEnvironment(true, 0.2)
  lights.sampleEnvironment(false, 0.1)
  expect(beam()).toBe(0)
  lights.sampleEnvironment(true, 0.4)
  expect(beam()).toBe(0)
  lights.sampleEnvironment(true, 0.45)
  expect(beam()).toBe(1)
  lights.sampleEnvironment(false, 1)
  expect(beam()).toBe(1)
  lights.sampleEnvironment(false, 0.5)
  expect(beam()).toBe(0)
})

it('auto follows ignition, powers no lamps with the engine off, and preserves manual H choices', () => {
  const lights = new VehicleLightController()
  const start = new StartLights('auto')
  start.update('bike', { ignition: 'sweep', helm: 'on' }, lights)
  expect(lights.mode).toBe('off')
  lights.sampleEnvironment(true, 1)
  start.update('bike', { ignition: 'running', helm: 'on' }, lights)
  expect(lights.mode).toBe('auto')
  expect(lights.level('low', 0, powered, 0)).toBe(1)
  expect(lights.level('low', 0, { ...powered, powered: false }, 0)).toBe(0)
  lights.cycleLights()
  expect(lights.mode).toBe('off')
  lights.sampleEnvironment(true, 2)
  start.update('bike', { ignition: 'running', helm: 'on' }, lights)
  expect(lights.mode).toBe('off')
})
