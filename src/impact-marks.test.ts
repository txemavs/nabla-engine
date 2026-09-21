import { expect, it } from 'vitest'
import * as THREE from 'three'
import { ImpactMarks } from '../playground/impact-marks.js'

it('keeps only the latest 64 marks and aligns them with the hit surface', () => {
  const marks = new ImpactMarks(),
    parent = new THREE.Group()
  const pose = {
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0, 1] as [number, number, number, number],
  }
  for (let x = 0; x < 70; x++) marks.add(parent, pose, [x, 0, 0], [0, 1, 0])
  expect(marks.count).toBe(64)
  expect(parent.children).toHaveLength(64)
  expect(parent.children.map((m) => m.position.x).sort((a, b) => a - b)).toEqual(
    Array.from({ length: 64 }, (_, i) => i + 6),
  )
  const last = parent.children.at(-1)!
  expect(new THREE.Vector3(0, 0, 1).applyQuaternion(last.quaternion).y).toBeCloseTo(1)
  expect(last.position.y).toBeCloseTo(0.002)
  marks.dispose()
  expect(parent.children).toHaveLength(0)
})
it('anchors marks to moving entities and removes them when their owner unloads', () => {
  const marks = new ImpactMarks(),
    parent = new THREE.Group(),
    root = new THREE.Group()
  root.add(parent)
  parent.position.set(10, 0, 0)
  parent.rotation.y = Math.PI / 2
  marks.add(
    parent,
    { position: parent.position.toArray(), rotation: parent.quaternion.toArray() },
    [11, 0, 0],
    [1, 0, 0],
  )
  parent.position.x += 5
  expect(parent.children[0].getWorldPosition(new THREE.Vector3()).x).toBeCloseTo(16.002)
  marks.removeFor(root)
  expect(marks.count).toBe(0)
  expect(parent.children).toHaveLength(0)
  marks.dispose()
})
