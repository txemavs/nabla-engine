import * as THREE from 'three'
import { expect, it } from 'vitest'
import { BreakableGlass } from '../../src/render/entity/breakable-glass.js'

it('removes the struck pane only, does not change a shared asset, and restores on reset', () => {
  const glass = new BreakableGlass()
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-2, -1, 0, 0, -1, 0, 0, 1, 0, -2, 1, 0, 1, -1, 0, 3, -1, 0, 3, 1, 0, 1, 1, 0],
      3,
    ),
  )
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7])
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  material.name = 'Parabrisas'
  const first = new THREE.Mesh(geometry, material)
  const shared = new THREE.Mesh(geometry, material)
  expect(
    glass.hit([first], new THREE.Vector3(-1, 0, 2), new THREE.Vector3(0, 0, -1), 5),
  ).not.toBeNull()
  expect(first.geometry.index!.count).toBe(6)
  expect(shared.geometry.index!.count).toBe(12)
  expect(glass.hit([first], new THREE.Vector3(-1, 0, 2), new THREE.Vector3(0, 0, -1), 5)).toBeNull()
  expect(
    glass.hit([first], new THREE.Vector3(2, 0, 2), new THREE.Vector3(0, 0, -1), 5),
  ).not.toBeNull()
  expect(first.geometry.index!.count).toBe(0)
  glass.clear()
  expect(first.geometry).toBe(geometry)
  expect(geometry.index!.count).toBe(12)
  geometry.dispose()
  material.dispose()
})

it('a body panel before glass prevents the glass breaking', () => {
  const glass = new BreakableGlass()
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial())
  pane.material.name = 'glass'
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial())
  panel.position.z = 1
  expect(
    glass.hit([pane, panel], new THREE.Vector3(0, 0, 2), new THREE.Vector3(0, 0, -1), 5),
  ).toBeNull()
  expect(pane.geometry.index!.count).toBe(6)
  for (const mesh of [pane, panel]) {
    mesh.geometry.dispose()
    mesh.material.dispose()
  }
})
