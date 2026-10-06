import { expect, it } from 'vitest'
import * as THREE from 'three'
import {
  IMPACT_MARK_HOLE_RADIUS,
  IMPACT_MARK_RADIUS,
  IMPACT_MARK_STANDOFF,
  IMPACT_MARK_TEXTURE_SIZE,
  ImpactMarks,
  MAX_IMPACT_MARKS,
  impactMarkPixels,
  impactMarkTexture,
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
it('draws only a dark hole with a scorch that fades to transparent, no light ring', () => {
  const size = IMPACT_MARK_TEXTURE_SIZE
  const data = impactMarkPixels(size)
  const holeTexels = (IMPACT_MARK_HOLE_RADIUS / IMPACT_MARK_RADIUS) * (size / 2)
  const pixel = (x: number, y: number) => {
    const at = (y * size + x) * 4
    return { rgb: [data[at], data[at + 1], data[at + 2]], a: data[at + 3] }
  }
  let ringSamples = 0
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const { rgb, a } = pixel(x, y)
      // Dark everywhere (also under alpha 0, so filtering never bleeds a light fringe).
      expect(Math.max(...rgb)).toBeLessThanOrEqual(32)
      const r = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2)
      if (r >= size / 2) expect(a).toBe(0)
      else if (r > holeTexels + 2) {
        // Former white ring band: translucent scorch only, never opaque.
        expect(a).toBeLessThan(160)
        ringSamples++
      } else if (r < holeTexels - 2) expect(a).toBe(255)
    }
  expect(ringSamples).toBeGreaterThan(0)
  // The scorch fades out towards the rim: monotonic along a radius, ~0 near the edge.
  const row = size / 2
  const alphas = Array.from({ length: size / 2 }, (_, i) => pixel(size / 2 + i, row).a)
  for (let i = 1; i < alphas.length; i++) expect(alphas[i]).toBeLessThanOrEqual(alphas[i - 1])
  expect(alphas.at(-1)!).toBeLessThan(8)

  const texture = impactMarkTexture()
  expect(texture.image.width).toBe(size)
  expect(Array.from(texture.image.data as Uint8Array)).toEqual(Array.from(data))
  texture.dispose()
})
it('renders each mark as one alpha-blended quad without depth write, polygon-offset', () => {
  const marks = new ImpactMarks(),
    root = new THREE.Group()
  marks.addWorld(root, [0, 0, 0], [0, 1, 0])
  const meshes: THREE.Mesh[] = []
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) meshes.push(o)
  })
  expect(meshes).toHaveLength(1)
  const material = meshes[0].material as THREE.MeshBasicMaterial
  expect(material.map).toBeInstanceOf(THREE.DataTexture)
  expect(material.color.getHex()).toBe(0xffffff)
  expect(material.transparent).toBe(true)
  expect(material.depthWrite).toBe(false)
  expect(material.polygonOffset).toBe(true)
  expect(material.polygonOffsetFactor).toBeLessThan(0)
  expect(material.polygonOffsetUnits).toBeLessThan(0)
  marks.dispose()
})
