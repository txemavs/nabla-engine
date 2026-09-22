import { expect, it } from 'vitest'
import { DirectionalLight, Vector3 } from 'three'
import { FollowingShadows } from '../playground/following-shadows.js'
it('keeps the viewer covered after travelling kilometres and rebasing the origin', () => {
  const light = new DirectionalLight()
  light.shadow.mapSize.set(1024, 1024)
  const shadows = new FollowingShadows()
  const direction = new Vector3(-1, 2, 1).normalize()
  for (const eye of [new Vector3(0, 3, 0), new Vector3(8000, 140, -9000), new Vector3(0, 0, 0)]) {
    shadows.update(light, eye, direction, 250)
    light.shadow.updateMatrices(light)
    expect(light.shadow.getFrustum().containsPoint(eye)).toBe(true)
    expect(light.target.position.distanceTo(eye)).toBeLessThan(1)
    expect(
      light.position.clone().sub(light.target.position).normalize().distanceTo(direction),
    ).toBeLessThan(1e-10)
  }
})
it('keeps projection stable within a shadow texel and updates the selected range', () => {
  const light = new DirectionalLight()
  light.shadow.mapSize.set(1024, 1024)
  const shadows = new FollowingShadows()
  shadows.update(light, new Vector3(), new Vector3(0, 1, 0), 250)
  const center = light.target.position.clone()
  shadows.update(light, new Vector3(0.01, 0, 0.01), new Vector3(0, 1, 0), 250)
  expect(light.target.position.distanceTo(center)).toBe(0)
  shadows.update(light, new Vector3(), new Vector3(0, 1, 0), 500)
  expect(light.shadow.camera.right).toBe(500)
  expect(light.shadow.camera.far).toBe(2400)
})
