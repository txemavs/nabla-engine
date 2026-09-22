import { expect, it } from 'vitest'
import * as THREE from 'three'
import { fitMirrorCamera } from '../playground/car-mirrors.js'

it('keeps the mirror projection fixed when the head turns, but follows eye translation', () => {
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.12))
  mirror.position.set(-0.6, 0, -0.5)
  mirror.rotation.y = 0.2
  mirror.updateMatrixWorld(true)
  const viewer = new THREE.PerspectiveCamera(60, 1.5, 0.1, 1000)
  viewer.position.set(0, 0.1, 0)
  const capture = new THREE.PerspectiveCamera()
  fitMirrorCamera(capture, viewer, mirror)
  const view = capture.matrixWorldInverse.clone()
  const projection = capture.projectionMatrix.clone()
  for (const yaw of [-0.8, -0.2, 0.4, 0.9]) {
    viewer.rotation.set(0.3, yaw, 0.1)
    viewer.updateMatrixWorld(true)
    fitMirrorCamera(capture, viewer, mirror)
    expect(capture.matrixWorldInverse.elements).toEqual(view.elements)
    expect(capture.projectionMatrix.elements).toEqual(projection.elements)
  }
  // All four lens corners remain inside the capture, regardless of screen cropping.
  for (const x of [-0.1, 0.1])
    for (const y of [-0.06, 0.06]) {
      const p = new THREE.Vector3(x, y, 0).applyMatrix4(mirror.matrixWorld).project(capture)
      expect(Math.abs(p.x)).toBeLessThan(1)
      expect(Math.abs(p.y)).toBeLessThan(1)
    }
  viewer.position.x += 0.1
  fitMirrorCamera(capture, viewer, mirror)
  expect(capture.matrixWorldInverse.elements).not.toEqual(view.elements)
})
