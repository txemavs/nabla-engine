import fs from 'node:fs/promises'
import { expect, it } from 'vitest'
import { Group, Light, PointLight, Scene, SpotLight, type Object3D } from 'three'
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
