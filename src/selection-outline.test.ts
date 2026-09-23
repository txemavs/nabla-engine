import { expect, it } from 'vitest'
import * as THREE from 'three'
import { SelectionOutline } from '../playground/selection-outline.js'

it('keeps local bounds and follows the full object pose during rotation', () => {
  const parent = new THREE.Group()
  parent.position.set(10, 3, -4)
  parent.rotation.y = 0.3
  const object = new THREE.Group()
  parent.add(object)
  const model = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 5))
  model.position.set(0.4, 0.6, 0)
  model.rotation.x = 0.1
  object.add(model)
  const outline = new SelectionOutline()
  outline.update(object)
  const bounds = outline.box.clone()
  for (const angle of [0.2, 0.7, 1.4]) {
    object.rotation.set(angle, angle * 2, -angle)
    outline.update(object)
    outline.updateMatrixWorld(true)
    expect(outline.box.equals(bounds)).toBe(true)
    expect(outline.matrixWorld.elements).toEqual(object.matrixWorld.elements)
  }
  object.scale.set(2, 1, 3)
  outline.update(object)
  expect(outline.box.equals(bounds)).toBe(true)
  expect(outline.matrix.elements).toEqual(object.matrixWorld.elements)
  outline.update(undefined)
  expect(outline.visible).toBe(false)
})

it('traces the actual polygon instead of fitting an axis-aligned box to a rotated footprint', () => {
  const object = new THREE.Group()
  object.rotation.y = 0.4
  const geometry = {
    vertices: [
      [0, 0, 0],
      [2, 0, 1],
      [1, 0, 3],
      [-1, 0, 2],
    ] as [number, number, number][],
    faces: [[0, 1, 2, 3]],
    edges: [],
  }
  const outline = new SelectionOutline()
  outline.update(object, geometry)
  const lines = outline.children.find(
    (o) => o instanceof THREE.LineSegments && !(o instanceof THREE.Box3Helper),
  ) as THREE.LineSegments
  expect(Array.from(lines.geometry.getAttribute('position').array)).toEqual([
    0, 0, 0, 2, 0, 1, 2, 0, 1, 1, 0, 3, 1, 0, 3, -1, 0, 2, -1, 0, 2, 0, 0, 0,
  ])
  expect(outline.children[0].visible).toBe(false)
  const buffer = lines.geometry
  outline.update(object, geometry)
  expect(lines.geometry).toBe(buffer)
  expect(outline.matrix.elements).toEqual(object.matrixWorld.elements)
})
