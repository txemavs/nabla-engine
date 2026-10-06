import { expect, it } from 'vitest'
import { Group, SpotLight, DirectionalLight, Vector3, Mesh, MeshStandardMaterial } from 'three'
import { cloneAssetScene } from '../../src/render/entity/assets.js'
import {
  AuthoredVehicleLights,
  lowBeamMask,
} from '../../src/render/vehicle-presentation/authored-lights.js'
import { lightingDefaults } from '../../src/config/lighting.js'

it('steps position then low beams, alternates high beams and masks the upper projection without shadows', () => {
  const root = new Group(),
    low = new SpotLight(),
    high = new SpotLight(),
    fog = new SpotLight()
  for (const [light, channel] of [
    [low, 'LowBeam'],
    [high, 'HighBeam'],
    [fog, 'Fog'],
  ] as const) {
    light.userData = {
      role: 'vehicle-light',
      channel,
      onIntensity: 10,
      ...(light === low ? { beamPattern: 'low-beam' } : {}),
    }
    root.add(light)
  }
  const penumbra = low.penumbra
  const control = new AuthoredVehicleLights(root)
  // Driving beams share the global level and a slightly softer edge.
  const on = 10 * lightingDefaults.headlightIntensityScale
  expect(low.penumbra).toBeCloseTo(Math.min(1, penumbra + lightingDefaults.headlightPenumbraBoost))
  // H: position lights first (no beam), then dipped beams.
  expect(control.cycle()).toBe('position')
  expect([low.intensity, high.intensity, fog.intensity]).toEqual([0, 0, 0])
  expect(control.cycle()).toBe('low')
  expect([low.intensity, high.intensity, fog.intensity]).toEqual([on, 0, 0])
  expect(low.map).toBeTruthy()
  expect(low.castShadow).toBe(false)
  expect([low, high, fog].every((light) => light.visible === false)).toBe(true)
  expect(control.toggleHighBeam()).toBe(true)
  expect([low.intensity, high.intensity, fog.intensity]).toEqual([0, on, 0])
  expect(control.toggle()).toBe(false)
  expect(high.intensity).toBe(0)
  control.dispose()
  expect(low.map).toBeNull()
  const mask = lowBeamMask(),
    { data, width, height } = mask.image
  expect(data![(Math.floor(height * 0.75) * width + width / 2) * 4]).toBe(0)
  expect(data![(Math.floor(height * 0.25) * width + width / 2) * 4]).toBeGreaterThan(240)
  mask.dispose()
})

it('switches emissive-only trailer lamps and keeps reverse separate from headlights', () => {
  const root = new Group()
  const tail = new MeshStandardMaterial({ emissive: 'red', emissiveIntensity: 2 })
  const reverse = new MeshStandardMaterial({ emissive: 'white', emissiveIntensity: 1 })
  const amber = new MeshStandardMaterial({ emissive: 'orange', emissiveIntensity: 1 })
  amber.userData.vehicleLightChannel = 'Marker'
  tail.userData.vehicleLightChannel = 'Tail_Stop'
  reverse.userData.vehicleLightChannel = 'Reverse'
  root.add(new Mesh(undefined, tail), new Mesh(undefined, reverse), new Mesh(undefined, amber))
  const lights = new AuthoredVehicleLights(root)
  expect(lights.toggle()).toBe(true)
  expect(tail.emissiveIntensity).toBe(2)
  expect(amber.emissiveIntensity).toBe(1)
  expect(reverse.emissiveIntensity).toBe(0)
  lights.update(true, false)
  expect(tail.emissiveIntensity).toBe(0)
  expect(amber.emissiveIntensity).toBe(0)
  expect(reverse.emissiveIntensity).toBe(1)
  lights.update(false, true)
  expect(reverse.emissiveIntensity).toBe(0)
  expect(tail.emissiveIntensity).toBe(2)
  tail.dispose()
  reverse.dispose()
  amber.dispose()
})

it('cloned GLB beams keep their local direction through vehicle translation and turning', () => {
  for (const Light of [SpotLight, DirectionalLight]) {
    const source = new Group(),
      light = new Light()
    light.target.position.set(0, 0, -1)
    light.add(light.target)
    light.userData = { role: 'vehicle-light', onIntensity: 42 }
    source.add(light)
    const first = cloneAssetScene(source),
      second = cloneAssetScene(source)
    const lamp = first.children[0] as SpotLight
    expect(lamp.target).toBe(lamp.children[0])
    expect(lamp.target).not.toBe((second.children[0] as SpotLight).target)
    first.position.set(100, 3, 20)
    first.rotation.y = Math.PI / 2
    first.updateMatrixWorld(true)
    const direction = lamp.target
      .getWorldPosition(new Vector3())
      .sub(lamp.getWorldPosition(new Vector3()))
      .normalize()
    expect(direction.x).toBeCloseTo(-1)
    expect(direction.z).toBeCloseTo(0)
    const controls = new AuthoredVehicleLights(first)
    expect(lamp.intensity).toBe(0)
    expect(lamp.visible).toBe(false)
    // An untagged lamp is a position lamp: lit in position and dipped, dark when off.
    expect(controls.toggle()).toBe(true)
    expect(lamp.intensity).toBe(42)
    expect(controls.toggle()).toBe(true)
    expect(lamp.intensity).toBe(42)
    expect(controls.toggle()).toBe(false)
    expect(lamp.intensity).toBe(0)
    expect((second.children[0] as SpotLight).intensity).not.toBe(0)
  }
})
