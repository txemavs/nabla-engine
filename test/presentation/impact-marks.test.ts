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
  // One instanced draw holds every mark of the parent.
  expect(parent.children).toHaveLength(1)
  expect(parent.children[0]).toBeInstanceOf(THREE.InstancedMesh)
  expect((parent.children[0] as THREE.InstancedMesh).count).toBe(MAX_IMPACT_MARKS)
  const parts = marks.matricesFor(parent).map((m) => {
    const position = new THREE.Vector3(),
      quaternion = new THREE.Quaternion()
    m.decompose(position, quaternion, new THREE.Vector3())
    return { position, quaternion }
  })
  expect(parts.map((p) => Math.round(p.position.x)).sort((a, b) => a - b)).toEqual(
    Array.from({ length: MAX_IMPACT_MARKS }, (_, i) => i + extra),
  )
  const last = parts.at(-1)!
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
  root.updateMatrixWorld(true)
  const world = new THREE.Vector3().applyMatrix4(
    parent.matrixWorld.clone().multiply(marks.matricesFor(parent)[0]),
  )
  expect(world.x).toBeCloseTo(16 + IMPACT_MARK_STANDOFF)
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

it('trims existing marks and disables new marks at zero', () => {
  const marks = new ImpactMarks(),
    root = new THREE.Group()
  for (let i = 0; i < 8; i++) marks.addWorld(root, [i, 0, 0], [0, 1, 0])
  marks.setLimit(2)
  expect(marks.count).toBe(2)
  expect(
    marks
      .matricesFor(root)
      .map((m) => new THREE.Vector3().setFromMatrixPosition(m).x)
      .sort(),
  ).toEqual([6, 7])
  marks.setLimit(0)
  marks.addSurface(root, [0, 0, 0], [0, 1, 0])
  expect(root.children).toHaveLength(0)
  marks.dispose()
})

it('matches the matrices of the former per-mark groups, also on moved and scaled parents', () => {
  const seeded = (seed: number) => () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const marks = new ImpactMarks()
  const parent = new THREE.Group()
  parent.position.set(3, 1, -2)
  parent.rotation.set(0.3, 1.1, -0.2)
  parent.scale.set(1, 1.3, 0.8)
  parent.updateMatrixWorld(true)
  // Object creation draws UUIDs from Math.random: create the batch and the groups first.
  marks.addWorld(parent, [0, 0, 0], [0, 1, 0])
  const surface = new THREE.Group()
  const entity = new THREE.Group()
  const random = Math.random
  Math.random = seeded(7)
  marks.addSurface(parent, [3.2, 1.4, -1.9], [0.2, 0.9, 0.1])
  marks.add(parent, { position: [3, 1, -2], rotation: [0, 0.5, 0, 0.866] }, [3.5, 1, -2], [1, 0, 0])
  Math.random = seeded(7)
  // The former code: a group per mark, `attach` for surface hits, `add` in the pose frame.
  surface.scale.setScalar(0.8 + Math.random() * 0.45)
  const n = new THREE.Vector3(0.2, 0.9, 0.1).normalize()
  surface.position.set(3.2, 1.4, -1.9).addScaledVector(n, IMPACT_MARK_STANDOFF)
  surface.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
  surface.rotateZ(Math.random() * Math.PI * 2)
  surface.updateMatrixWorld(true)
  parent.attach(surface)
  entity.scale.setScalar(0.8 + Math.random() * 0.45)
  const inverse = new THREE.Quaternion(0, 0.5, 0, 0.866).invert()
  const m = new THREE.Vector3(1, 0, 0).applyQuaternion(inverse)
  entity.position
    .set(3.5, 1, -2)
    .sub(new THREE.Vector3(3, 1, -2))
    .applyQuaternion(inverse)
    .addScaledVector(m, IMPACT_MARK_STANDOFF)
  entity.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), m)
  entity.rotateZ(Math.random() * Math.PI * 2)
  Math.random = random
  surface.updateMatrix()
  entity.updateMatrix()
  const [, a, b] = marks.matricesFor(parent)
  for (let i = 0; i < 16; i++) {
    expect(a.elements[i]).toBeCloseTo(surface.matrix.elements[i], 6)
    expect(b.elements[i]).toBeCloseTo(entity.matrix.elements[i], 6)
  }
  marks.dispose()
})

it('keeps one instanced draw per parent and recycles the oldest mark across parents', () => {
  const marks = new ImpactMarks()
  const world = new THREE.Group(),
    car = new THREE.Group()
  marks.setLimit(3)
  marks.addWorld(world, [0, 0, 0], [0, 1, 0])
  marks.addWorld(world, [1, 0, 0], [0, 1, 0])
  marks.addSurface(car, [2, 0, 0], [0, 1, 0])
  expect(marks.batchCount).toBe(2)
  marks.addSurface(car, [3, 0, 0], [0, 1, 0])
  expect(marks.count).toBe(3)
  // The oldest (x = 0) went; the batch kept its other mark in slot 0.
  expect(
    marks.matricesFor(world).map((m) => new THREE.Vector3().setFromMatrixPosition(m).x),
  ).toEqual([1])
  expect((world.children[0] as THREE.InstancedMesh).count).toBe(1)
  marks.removeFor(car)
  expect(car.children).toHaveLength(0)
  expect(marks.count).toBe(1)
  marks.dispose()
})
