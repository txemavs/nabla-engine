import { expect, it } from 'vitest'
import { Group, PointLight, Scene, SpotLight } from 'three'
import { AuthoredVehicleLights } from '../../src/render/vehicle-presentation/authored-lights.js'
import {
  VehicleLightRig,
  vehicleLightBudget,
} from '../../src/render/vehicle-presentation/light-rig.js'

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
