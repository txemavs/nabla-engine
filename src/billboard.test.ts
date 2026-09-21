import { expect, it } from 'vitest'
import * as THREE from 'three'
import { UprightBillboard } from '../playground/billboard.js'

it('faces each camera in yaw while retaining world up beneath rotated parents', () => {
  const parent = new THREE.Group()
  parent.rotation.set(0.2, 0.4, -0.1)
  const tree = new UprightBillboard(new THREE.MeshBasicMaterial())
  parent.add(tree)
  const camera = new THREE.PerspectiveCamera()
  for (const position of [
    [2, 0, 4],
    [-3, 20, 1],
    [0, 40, 0],
  ]) {
    camera.position.set(...(position as [number, number, number]))
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    parent.updateMatrixWorld(true)
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2(), camera)
    tree.raycast(ray, [])
    const q = tree.getWorldQuaternion(new THREE.Quaternion())
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q)
    expect(up.distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-6)
    if (position[0] || position[2]) {
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
      expect(forward.dot(new THREE.Vector3(position[0], 0, position[2]).normalize())).toBeCloseTo(1)
    }
  }
  tree.geometry.dispose()
  tree.material.dispose()
})
