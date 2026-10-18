import fs from 'node:fs/promises'
import { expect, it } from 'vitest'
import { Mesh, MeshStandardMaterial, Group, PointLight } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VehicleLightController } from '../../src/render/vehicle-presentation/light-controller.js'
import { AuthoredVehicleLights } from '../../src/render/vehicle-presentation/authored-lights.js'
import { CarLights } from '../../src/render/entity/car-lights.js'

it('shares signal selection, blink timing, brakes and R across the car and GLB adapters', () => {
  const marker = new MeshStandardMaterial()
  const car = new CarLights([{ material: marker, kind: 'signal', side: -1 }])
  const state = { powered: true, braking: false, reversing: false }
  car.toggle(-1)
  for (const [time, level] of [
    [0, 1],
    [450, 0],
    [900, 1],
  ]) {
    car.update(state, time)
    expect(marker.emissiveIntensity).toBe(level * 2)
    expect(car.controller.level('signal', -1, state, time)).toBe(level)
  }
  car.toggle(1)
  expect(car.controller.level('signal', -1, state, 0)).toBe(0)
  expect(car.controller.level('signal', 1, state, 0)).toBe(1)
  car.toggle(1)
  expect(car.controller.level('signal', 1, state, 0)).toBe(0)
  expect(car.controller.level('brake', 0, { ...state, braking: true }, 0)).toBe(1)
  expect(car.controller.level('reverse', 0, state, 0)).toBe(0)
  expect(car.controller.level('reverse', 0, { ...state, reversing: true }, 0)).toBe(1)
  marker.dispose()
})

it('drives real tractor and trailer lenses independently by side, with no rear floodlights', async () => {
  const controller = new VehicleLightController()
  controller.toggleLights()
  controller.toggleSignal(-1)
  for (const name of ['tractor.modern', 'trailer.anchored']) {
    const bytes = await fs.readFile(`assets/library/trucks/white-truck/assets/${name}.glb`)
    const gltf = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    )
    const lights = new AuthoredVehicleLights(gltf.scene)
    const materials = new Set<MeshStandardMaterial>()
    gltf.scene.traverse((node) => {
      if (node instanceof Mesh)
        for (const material of Array.isArray(node.material) ? node.material : [node.material])
          if (material instanceof MeshStandardMaterial) materials.add(material)
    })
    const select = (channel: string, side?: string) =>
      [...materials].filter(
        (m) =>
          m.userData.vehicleLightChannel === channel &&
          (!side || m.userData.vehicleLightSide === side),
      )
    const left = select('Indicator', 'L'),
      right = select('Indicator', 'R'),
      tail = select('Tail_Stop'),
      reverse = select('Reverse')
    for (const group of [left, right, tail, reverse]) expect(group.length).toBeGreaterThan(0)
    expect(left.every((m) => !right.includes(m))).toBe(true)
    const state = { powered: true, braking: false, reversing: false }
    lights.apply(state, 450, controller)
    expect(left.every((m) => m.emissiveIntensity === 0)).toBe(true)
    expect(right.every((m) => m.emissiveIntensity === 0)).toBe(true)
    expect(reverse.every((m) => m.emissiveIntensity === 0)).toBe(true)
    const tailLevel = tail[0].emissiveIntensity
    lights.apply({ ...state, braking: true, reversing: true }, 900, controller)
    expect(left.every((m) => m.emissiveIntensity > 0)).toBe(true)
    expect(tail[0].emissiveIntensity).toBeGreaterThan(tailLevel)
    expect(reverse.every((m) => m.emissiveIntensity > 0)).toBe(true)
    controller.toggleSignal(-1)
    lights.apply(state, 900, controller)
    expect([...left, ...right].every((m) => m.emissiveIntensity === 0)).toBe(true)
    controller.toggleSignal(-1)
    lights.apply({ ...state, powered: false }, 900)
    expect([...left, ...right, ...tail, ...reverse].every((m) => m.emissiveIntensity === 0)).toBe(
      true,
    )
    lights.dispose()
  }
})

it('keeps authored cabin lamps off when exterior lights are enabled', () => {
  const root = new Group()
  root.userData = { role: 'vehicle-light', channel: 'Cabin', onIntensity: 5 }
  const bulb = new PointLight()
  root.add(bulb)
  const controller = new VehicleLightController()
  controller.toggleLights()
  const lights = new AuthoredVehicleLights(root)
  lights.apply({ powered: true, braking: false, reversing: false }, 0, controller)
  expect(bulb.intensity).toBe(0)
  lights.dispose()
})

it('flashes while off or in daylight auto without changing the selected lights', () => {
  const c = new VehicleLightController()
  const state = { powered: true, braking: false, reversing: false }
  for (const mode of ['off', 'position', 'auto'] as const) {
    c.mode = mode
    expect(c.beginFlash()).toBe(true)
    expect(c.level('high', 0, state, 0)).toBe(1)
    expect(c.level('high', 0, { ...state, powered: false }, 0)).toBe(0)
    c.endFlash()
    expect(c.level('high', 0, state, 0)).toBe(0)
    expect(c.mode).toBe(mode)
    expect(c.highBeam).toBe(false)
  }
  c.mode = 'low'
  expect(c.beginFlash()).toBe(false)
  c.toggleHighBeam()
  c.endFlash()
  expect(c.level('high', 0, state, 0)).toBe(1)
})

it('lights the marked dipped lens alone on low and all marked lenses on high or flash', () => {
  const low = new MeshStandardMaterial(),
    high = new MeshStandardMaterial()
  const car = new CarLights([
    { material: low, kind: 'low', side: 0 },
    { material: high, kind: 'high', side: 0 },
  ])
  const state = { powered: true, braking: false, reversing: false }
  car.controller.mode = 'low'
  car.update(state, 0)
  expect(low.emissiveIntensity).toBeGreaterThan(0)
  expect(high.emissiveIntensity).toBe(0)
  car.controller.highBeam = true
  car.update(state, 0)
  expect(low.emissiveIntensity).toBeGreaterThan(0)
  expect(high.emissiveIntensity).toBeGreaterThan(0)
  car.controller.mode = 'off'
  car.controller.beginFlash()
  car.update(state, 0)
  expect(high.emissiveIntensity).toBeGreaterThan(0)
  car.controller.endFlash()
  car.update(state, 0)
  expect(low.emissiveIntensity).toBe(0)
  expect(high.emissiveIntensity).toBe(0)
  low.dispose()
  high.dispose()
})

it('reports one dashboard light for off, position, automatic beams and flashes', () => {
  const c = new VehicleLightController()
  expect(c.dashboardLight).toBe('off')
  c.mode = 'auto'
  expect(c.dashboardLight).toBe('position')
  c.beginFlash()
  expect(c.dashboardLight).toBe('high')
  c.endFlash()
  expect(c.dashboardLight).toBe('position')
  c.sampleEnvironment(true, 1)
  expect(c.dashboardLight).toBe('low')
  c.toggleHighBeam()
  expect(c.dashboardLight).toBe('high')
})
