import { expect, it } from 'vitest'
import * as THREE from 'three'
import {
  IMPACT_MARK_STANDOFF,
  ImpactMarks,
  MAX_IMPACT_MARKS,
} from '../../src/render/entity/impact-marks.js'

it('keeps only the latest MAX_IMPACT_MARKS marks and aligns them with the hit surface', () => {
  const marks = new ImpactMarks(),
    parent = new THREE.Group()
  const pose = {
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0, 1] as [number, number, number, number],
  }
  const extra = 6
  for (let x = 0; x < MAX_IMPACT_MARKS + extra; x++) marks.add(parent, pose, [x, 0, 0], [0, 1, 0])
  expect(marks.count).toBe(MAX_IMPACT_MARKS)
  expect(parent.children).toHaveLength(MAX_IMPACT_MARKS)
  expect(parent.children.map((m) => m.position.x).sort((a, b) => a - b)).toEqual(
    Array.from({ length: MAX_IMPACT_MARKS }, (_, i) => i + extra),
  )
  const last = parent.children.at(-1)!
  expect(new THREE.Vector3(0, 0, 1).applyQuaternion(last.quaternion).y).toBeCloseTo(1)
  expect(last.position.y).toBeCloseTo(IMPACT_MARK_STANDOFF)
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
  expect(parent.children[0].getWorldPosition(new THREE.Vector3()).x).toBeCloseTo(
    16 + IMPACT_MARK_STANDOFF,
  )
  marks.removeFor(root)
  expect(marks.count).toBe(0)
  expect(parent.children).toHaveLength(0)
  marks.dispose()
})
