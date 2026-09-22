import { expect, it } from 'vitest'
import { DirectionalLight, Vector3 } from 'three'
import { stabilizeSunShadow } from '../playground/stable-shadows.js'

it('keeps shadow texels fixed for sub-texel movement at every quality level', () => {
  for (const size of [512, 1024, 2048]) {
    const light = new DirectionalLight()
    light.shadow.mapSize.set(size, size)
    light.shadow.camera.left = -55
    light.shadow.camera.right = 55
    const direction = new Vector3(1, 2, 1).normalize()
    stabilizeSunShadow(light, new Vector3(), new Vector3(), direction)
    const initial = light.position.clone()
    stabilizeSunShadow(light, new Vector3(0.001, 0.001, 0.001), new Vector3(), direction)
    expect(light.position.distanceTo(initial)).toBeLessThan(1e-10)
  }
})
it('preserves the absolute shadow projection when the world render origin changes', () => {
  const light = new DirectionalLight()
  const focus = new Vector3(12003, 42, -8040)
  const direction = new Vector3(-1, 2, 1).normalize()
  stabilizeSunShadow(light, focus, new Vector3(), direction)
  const position = light.position.clone(),
    target = light.target.position.clone()
  const origin = new Vector3(12000, 40, -8000)
  stabilizeSunShadow(light, focus, origin, direction)
  expect(light.position.clone().add(origin).distanceTo(position)).toBeLessThan(1e-8)
  expect(light.target.position.clone().add(origin).distanceTo(target)).toBeLessThan(1e-8)
})
it('keeps a finite projection directly overhead', () => {
  const light = new DirectionalLight()
  stabilizeSunShadow(light, new Vector3(5, 2, 10), new Vector3(), new Vector3(0, 1, 0))
  light.shadow.updateMatrices(light)
  expect(light.shadow.matrix.elements.every(Number.isFinite)).toBe(true)
})
