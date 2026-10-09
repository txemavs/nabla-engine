import { expect, it } from 'vitest'
import * as THREE from 'three'
import { skyCamera } from '../../src/render/entity/car-mirrors.js'

it('rebuilds an off-axis mirror frustum from fov, aspect and view (the sky pass recomputes it)', () => {
  const near = 0.1
  const fitted = new THREE.Matrix4().makePerspective(0.02, 0.09, 0.03, -0.01, near, 500)
  const reflection = new THREE.PerspectiveCamera(50, 1, near, 500)
  reflection.position.set(1, 2, 3)
  reflection.quaternion.setFromEuler(new THREE.Euler(0.1, -0.8, 0))
  const sky = skyCamera(reflection, fitted)
  sky.updateProjectionMatrix()
  const a = sky.projectionMatrix.elements,
    b = fitted.elements
  // Same slopes (x, y scale and centre), whatever near/far the sky camera uses.
  for (const i of [0, 5, 8, 9]) expect(a[i]).toBeCloseTo(b[i], 6)
  expect(sky.quaternion.angleTo(reflection.quaternion)).toBeLessThan(1e-9)
  expect(sky.position.distanceTo(reflection.position)).toBe(0)
})
