import fs from 'node:fs/promises'
import { expect, it } from 'vitest'
import { Group, Light, PointLight, Scene, SpotLight, type Object3D, type DataTexture } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { AuthoredVehicleLights } from '../../src/render/vehicle-presentation/authored-lights.js'
import {
  VehicleLightRig,
  vehicleLightBudget,
} from '../../src/render/vehicle-presentation/light-rig.js'

function visibleLights(root: Object3D): number {
  let count = 0
  root.traverseVisible((node) => {
    if (node instanceof Light) count++
  })
  return count
}

function authoredTruck(): { root: Group; lights: AuthoredVehicleLights } {
  const root = new Group()
  for (const [channel, Light, map] of [
    ['LowBeam', SpotLight, true],
    ['HighBeam', SpotLight, false],
    ['Indicator', PointLight, false],
    ['Tail_Stop', PointLight, false],
  ] as const) {
    const light = new Light()
    light.userData = { role: 'vehicle-light', channel, onIntensity: 8 }
    if (map) light.userData.beamPattern = 'low-beam'
    root.add(light)
    if (light instanceof SpotLight) light.add(light.target)
  }
  return { root, lights: new AuthoredVehicleLights(root) }
}

it('keeps a fixed renderer light count while the occupied vehicle changes', () => {
  const scene = new Scene()
  const rig = new VehicleLightRig()
  scene.add(rig.root)
  const count = () => scene.children.flatMap((node) => (node === rig.root ? node.children : []))
  expect(rig.lights).toHaveLength(vehicleLightBudget.spots + vehicleLightBudget.points)
  expect(count()).toHaveLength(vehicleLightBudget.spots * 2 + vehicleLightBudget.points)
  const first = authoredTruck()
  first.lights.toggle()
  first.root.position.set(4, 1, -2)
  first.root.updateMatrixWorld(true)
  scene.add(first.root)
  rig.capture(first.lights.illuminators().spots, first.lights.illuminators().points)
  const mapped = rig.lights.filter(
    (light): light is SpotLight => light instanceof SpotLight && !!light.map,
  )
  expect(mapped).toHaveLength(vehicleLightBudget.mappedSpots)
  expect(rig.lights.some((light) => light.intensity > 0)).toBe(true)
  const second = authoredTruck()
  scene.add(second.root)
  rig.capture(second.lights.illuminators().spots, second.lights.illuminators().points)
  expect(rig.lights).toHaveLength(vehicleLightBudget.spots + vehicleLightBudget.points)
  expect(mapped.every((light) => !!light.map)).toBe(true)
  expect(count()).toHaveLength(vehicleLightBudget.spots * 2 + vehicleLightBudget.points)
  rig.capture([], [])
  expect(rig.lights.every((light) => light.intensity === 0)).toBe(true)
  expect(rig.lights).toHaveLength(vehicleLightBudget.spots + vehicleLightBudget.points)
  expect(first.lights.illuminators().spots.every((light) => light.visible === false)).toBe(true)
  rig.dispose()
})

it('keeps the visible light count stable on a real tractor when binding another copy', async () => {
  const bytes = await fs.readFile('assets/library/trucks/white-truck/assets/tractor.modern.glb')
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  )
  const scene = new Scene()
  const rig = new VehicleLightRig()
  scene.add(rig.root)
  const first = new AuthoredVehicleLights(gltf.scene)
  scene.add(gltf.scene)
  expect(first.illuminators().spots.length + first.illuminators().points.length).toBe(15)
  expect(first.illuminators().spots.every((light) => light.visible === false)).toBe(true)
  const before = visibleLights(scene)
  first.toggle()
  rig.capture(first.illuminators().spots, first.illuminators().points)
  const clone = gltf.scene.clone(true)
  const second = new AuthoredVehicleLights(clone)
  scene.add(clone)
  second.toggle()
  rig.capture(second.illuminators().spots, second.illuminators().points)
  expect(visibleLights(scene)).toBe(before)
  expect(visibleLights(scene)).toBe(vehicleLightBudget.spots + vehicleLightBudget.points)
  rig.capture([], [])
  expect(visibleLights(scene)).toBe(before)
  first.dispose()
  second.dispose()
  rig.dispose()
})

it('uses a spare downward spotlight for the red road wash and clears it on exit', () => {
  const rig = new VehicleLightRig()
  const car = new Group()
  car.position.set(3, 1, 4)
  const count = rig.lights.length
  rig.capture([], [])
  rig.groundGlow(car)
  const light = rig.lights.find((light) => light.intensity > 0) as SpotLight
  expect(light).toBeDefined()
  expect(light).not.toBe(rig.pedestrianLight)
  expect(light.castShadow).toBe(false)
  expect(light.position.y).toBeCloseTo(1)
  expect(light.position.z).toBeCloseTo(5.8)
  expect(light.target.position.z).toBeGreaterThan(light.position.z)
  expect(light.target.position.y).toBeLessThan(light.position.y)
  expect(light.color.r).toBeGreaterThan(light.color.g)
  expect(rig.lights).toHaveLength(count)
  rig.capture([], [])
  expect(light.intensity).toBe(0)
  rig.dispose()
})

it('boosts rear road fill by 32% while braking without adding renderer lights', () => {
  const rig = new VehicleLightRig(),
    vehicle = new Group()
  rig.capture([], [])
  rig.groundGlow(vehicle)
  const glow = rig.lights.find((light) => light.intensity === 4.8) as SpotLight
  expect(glow).toBeDefined()
  rig.groundGlow(vehicle, true)
  expect(glow.intensity).toBeCloseTo(4.8 * 1.32)
  expect(glow.distance).toBeCloseTo(6.6)
  rig.capture([], [])
  rig.rearGroundGlow(vehicle, 2.5, 6, 2, false)
  rig.rearGroundGlow(new Group(), 2.5, 12, 2, true)
  expect(rig.lights.filter((light) => light.intensity > 0)).toHaveLength(4)
  expect(rig.lights).toHaveLength(vehicleLightBudget.spots + vehicleLightBudget.points)
  rig.capture([], [])
  rig.rearGroundGlow(vehicle, 0.8, 2, 1, false)
  expect(rig.lights.filter((light) => light.intensity > 0)).toHaveLength(1)
  rig.dispose()
})

it('places motorcycle road glow at its tail anchor and applies model offsets without adding lights', async () => {
  const { vehicleLightDefaults } =
    await import('../../src/render/vehicle-presentation/light-tuning.js')
  const rig = new VehicleLightRig(),
    bike = new Group(),
    anchor = new Group()
  anchor.position.set(0, 0.88, 0.99)
  bike.add(anchor)
  bike.position.set(10, 2, -4)
  rig.capture([], [])
  rig.rearGroundGlow(bike, 0.8, 2.1, 1, false, { ...vehicleLightDefaults, rearY: 0.1 }, anchor)
  const light = rig.lights.find((light) => light instanceof PointLight && light.intensity > 0)!
  expect(light.position.y).toBeCloseTo(2.98)
  expect(light.position.z).toBeCloseTo(-2.97)
  expect(rig.lights).toHaveLength(vehicleLightBudget.spots + vehicleLightBudget.points)
  rig.dispose()
})

it('keeps each vehicle beam cutoff independent', () => {
  const a = authoredTruck(),
    b = authoredTruck()
  const mask = (rig: typeof a) =>
    (rig.lights.illuminators().spots[0].map! as DataTexture).image.data as Uint8Array
  const original = new Uint8Array(mask(b))
  a.lights.setCutoffs(3, 1)
  expect(Array.from(mask(a))).not.toEqual(Array.from(original))
  expect(Array.from(mask(b))).toEqual(Array.from(original))
  a.lights.dispose()
  b.lights.dispose()
})
