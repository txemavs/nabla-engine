import { expect, it } from 'vitest'
import { Group, PerspectiveCamera, Vector3 } from 'three'
import { VehicleLightRig } from '../../src/render/vehicle-presentation/light-rig.js'
import { lightingDefaults } from '../../src/config/lighting.js'
import { Headlamp } from '../../src/render/entity/headlamp.js'

it('follows the face with floating origin and rotates its beam with the head', () => {
  const scene = new Group(),
    parent = new Group(),
    head = new Group()
  parent.position.set(-100, 0, 20)
  parent.add(head)
  scene.add(parent)
  head.position.set(110, 2, 0)
  head.rotation.y = Math.PI / 2
  const rig = new VehicleLightRig()
  scene.add(rig.root)
  const lamp = new Headlamp(rig.pedestrianLight)
  lamp.shadows = true
  lamp.enabled = true
  lamp.update(head)
  expect(lamp.light.castShadow).toBe(true)
  expect(lamp.light.position.x).toBeCloseTo(9.85)
  const direction = lamp.light.target.position.clone().sub(lamp.light.position)
  expect(direction.x).toBeCloseTo(-1)
  expect(direction.z).toBeCloseTo(0)
  lamp.shadows = false
  lamp.update(head)
  expect(lamp.light.castShadow).toBe(true)
  expect(lamp.light.shadow.intensity).toBe(0)
  expect(lamp.light.shadow.autoUpdate).toBe(false)
  lamp.enabled = false
  lamp.update(head)
  expect(lamp.light.visible).toBe(true)
  expect(lamp.light.intensity).toBe(0)
  rig.dispose()
})

it('uses the exact eye orientation in first person instead of a vehicle/body heading', () => {
  const scene = new Group(),
    head = new Group(),
    eye = new PerspectiveCamera()
  scene.add(head, eye)
  eye.rotation.set(0.3, 0.8, 0)
  eye.position.set(4, 2, 3)
  const rig = new VehicleLightRig()
  scene.add(rig.root)
  const lamp = new Headlamp(rig.pedestrianLight)
  lamp.enabled = true
  lamp.update(head, eye)
  const direction = eye.getWorldDirection(new Vector3())
  expect(
    lamp.light.target.position.clone().sub(lamp.light.position).distanceTo(direction),
  ).toBeLessThan(1e-10)
  expect(
    lamp.light.position.distanceTo(eye.position.clone().addScaledVector(direction, 0.15)),
  ).toBeLessThan(1e-10)
  rig.dispose()
})

it('does not allocate or compile shadows until explicitly enabled', () => {
  const rig = new VehicleLightRig()
  const lamp = new Headlamp(rig.pedestrianLight)
  expect(lamp.shadows).toBe(false)
  expect(lamp.light.castShadow).toBe(false)
  expect(lamp.needsShadowPass).toBe(false)
  lamp.enabled = true
  lamp.update(new Group())
  expect(lamp.light.intensity).toBeGreaterThan(0)
  expect(lamp.light.shadow.autoUpdate).toBe(false)
  expect(lamp.needsShadowPass).toBe(false)
  lamp.shadows = true
  lamp.update(new Group())
  expect(lamp.light.castShadow).toBe(true)
  expect(lamp.needsShadowPass).toBe(true)
  expect(lamp.light.shadow.autoUpdate).toBe(true)
  rig.dispose()
})

it('returns the shared light to any occupied vehicle without overwriting its settings', () => {
  const rig = new VehicleLightRig()
  const count = rig.lights.length
  const lamp = new Headlamp(rig.pedestrianLight)
  lamp.enabled = true
  lamp.update(new Group())
  lamp.light.intensity = 123
  lamp.light.angle = 0.3
  lamp.update(new Group(), undefined, true)
  expect(lamp.enabled).toBe(false)
  expect(lamp.light.intensity).toBe(123)
  expect(lamp.light.angle).toBe(0.3)
  expect(lamp.light.shadow.intensity).toBe(0)
  expect(rig.lights).toHaveLength(count)
  rig.dispose()
})

it('aims up and down from the face in third person, without moving the light to the camera', () => {
  const rig = new VehicleLightRig()
  rig.root.position.set(20, 0, 10)
  const head = new Group()
  head.position.set(2, 3, 4)
  const camera = new PerspectiveCamera()
  camera.position.set(50, 60, 70)
  const lamp = new Headlamp(rig.pedestrianLight)
  lamp.enabled = true
  for (const pitch of [-0.7, 0.7]) {
    camera.rotation.x = pitch
    lamp.update(head, camera, false, false)
    const origin = lamp.light.getWorldPosition(new Vector3())
    const direction = lamp.light.target.getWorldPosition(new Vector3()).sub(origin).normalize()
    expect(origin.distanceTo(new Vector3(2, 3.015, 3.85))).toBeLessThan(1e-9)
    expect(direction.distanceTo(camera.getWorldDirection(new Vector3()))).toBeLessThan(1e-9)
  }
  expect(lamp.light.penumbra).toBeGreaterThan(0.6)
  expect(lamp.light.angle).toBeGreaterThan(0.475)
  expect(lamp.needsShadowPass).toBe(false)
  rig.dispose()
})

it('uses a dedicated gentler intensity without changing vehicle high beams', () => {
  const rig = new VehicleLightRig()
  const lamp = new Headlamp(rig.pedestrianLight)
  lamp.enabled = true
  lamp.update(new Group())
  expect(lamp.light.intensity).toBe(lightingDefaults.flashlightIntensity)
  expect(lamp.light.intensity).toBeLessThan(lightingDefaults.highBeamIntensity)
  rig.dispose()
})

it('keeps perspective shadow bias within centimetres at flashlight distances', () => {
  const rig = new VehicleLightRig()
  const lamp = new Headlamp(rig.pedestrianLight)
  lamp.enabled = true
  lamp.update(new Group())
  lamp.light.shadow.updateMatrices(lamp.light)
  const camera = lamp.light.shadow.camera
  for (const distance of [5, 20, 50]) {
    const projected = new Vector3(0, 0, -distance).applyMatrix4(camera.projectionMatrix)
    // Shadow lookup adds bias in [0,1] depth; NDC depth spans [-1,1].
    projected.z += 2 * lamp.light.shadow.bias
    const receiver = projected.applyMatrix4(camera.projectionMatrixInverse)
    expect(Math.abs(-receiver.z - distance)).toBeLessThan(0.03)
  }
  rig.dispose()
})
