import { expect, it } from 'vitest'
import { Group, SpotLight, DirectionalLight, Vector3 } from 'three'
import { cloneAssetScene } from '../../src/render/entity/assets.js'
import { AuthoredVehicleLights } from '../../src/render/vehicle-presentation/authored-lights.js'

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
    expect(controls.toggle()).toBe(true)
    expect(lamp.intensity).toBe(42)
    expect(controls.toggle()).toBe(false)
    expect(lamp.intensity).toBe(0)
    expect((second.children[0] as SpotLight).intensity).not.toBe(0)
  }
})
