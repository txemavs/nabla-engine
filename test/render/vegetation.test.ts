import { expect, it } from 'vitest'
import { Box3, Matrix4, MeshBasicMaterial, Vector3 } from 'three'
import { treeInstances } from '../../src/render/planet/vegetation.js'

it('keeps both cards at crown width and adds a horizontal foliage crown without another draw', () => {
  const material = new MeshBasicMaterial()
  const trees = treeInstances([{ position: [10, 20, 30], size: [6, 12] }], material)
  const matrix = new Matrix4()
  trees.getMatrixAt(0, matrix)
  for (const offset of [0, 4]) {
    const box = new Box3()
    const positions = trees.geometry.getAttribute('position')
    for (let i = offset; i < offset + 4; i++)
      box.expandByPoint(new Vector3().fromBufferAttribute(positions, i).applyMatrix4(matrix))
    const size = box.getSize(new Vector3())
    expect(Math.max(size.x, size.z)).toBeCloseTo(6)
    expect(size.y).toBeCloseTo(12)
    expect(box.min.y).toBeCloseTo(20)
  }
  const crown = new Box3()
  const positions = trees.geometry.getAttribute('position')
  const normals = trees.geometry.getAttribute('normal')
  const uv = trees.geometry.getAttribute('uv')
  for (let i = 8; i < positions.count; i++) {
    const vertex = new Vector3().fromBufferAttribute(positions, i)
    // Mirror the instanced vertex shader height correction.
    vertex.y += 2.5 / 12 - 0.5
    crown.expandByPoint(vertex.applyMatrix4(matrix))
    expect(normals.getY(i)).toBeCloseTo(1)
    expect(uv.getY(i)).toBeGreaterThanOrEqual(0.449)
    expect(uv.getY(i)).toBeLessThanOrEqual(0.851)
  }
  expect(crown.min.y).toBeCloseTo(22.5)
  expect(crown.max.y).toBeCloseTo(22.5)
  expect(crown.getSize(new Vector3()).x).toBeCloseTo(3.68)
  expect(crown.getSize(new Vector3()).z).toBeCloseTo(3.68)
  expect(trees.count).toBe(1)
  expect(trees.geometry.index!.count / 3).toBe(16)
  expect(trees.castShadow).toBe(true)
  expect(trees.receiveShadow).toBe(false)
  trees.geometry.dispose()
  material.dispose()
  trees.dispose()
})
