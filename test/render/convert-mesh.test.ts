import { describe, expect, it } from 'vitest'
import { BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  convertPlanetGlbMesh,
  preparePlanetMeshGeometry,
} from '../../src/render/planet/convert-mesh.js'

/** Tiny glTF 2.0 binary: one triangle, POSITION only — the Atlas candidate shape. */
function positionOnlyTriangleGlb(): ArrayBuffer {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
  const json = JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        max: [1, 1, 0],
        min: [0, 0, 0],
      },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 }],
    buffers: [{ byteLength: 36 }],
  })
  const jsonBytes = new TextEncoder().encode(json)
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4
  const binPad = (4 - (positions.byteLength % 4)) % 4
  const jsonChunk = 8 + jsonBytes.length + jsonPad
  const binChunk = 8 + positions.byteLength + binPad
  const total = 12 + jsonChunk + binChunk
  const out = new ArrayBuffer(total)
  const view = new DataView(out)
  const bytes = new Uint8Array(out)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, total, true)
  view.setUint32(12, jsonBytes.length + jsonPad, true)
  view.setUint32(16, 0x4e4f534a, true)
  bytes.set(jsonBytes, 20)
  bytes.fill(0x20, 20 + jsonBytes.length, 20 + jsonBytes.length + jsonPad)
  const binOff = 12 + jsonChunk
  view.setUint32(binOff, positions.byteLength + binPad, true)
  view.setUint32(binOff + 4, 0x004e4942, true)
  bytes.set(new Uint8Array(positions.buffer), binOff + 8)
  return out
}

function triangleWithoutNormals() {
  const geometry = new BufferGeometry()
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
  )
  return geometry
}

describe('preparePlanetMeshGeometry', () => {
  it('computes finite vertex normals when a mesh has POSITION but no NORMAL', () => {
    const geometry = triangleWithoutNormals()
    expect(geometry.getAttribute('normal')).toBeUndefined()
    const { position, normal } = preparePlanetMeshGeometry(geometry)
    expect(position.count).toBe(3)
    expect(normal.count).toBe(3)
    expect(Array.from(normal.array as Float32Array).every(Number.isFinite)).toBe(true)
    expect(normal.getZ(0)).toBeCloseTo(1)
    expect(normal.getZ(1)).toBeCloseTo(1)
    expect(normal.getZ(2)).toBeCloseTo(1)
  })

  it('keeps authored normals and still rejects a mesh with no POSITION', () => {
    const authored = triangleWithoutNormals()
    authored.setAttribute(
      'normal',
      new BufferAttribute(new Float32Array([1, 0, 0, 1, 0, 0, 1, 0, 0]), 3),
    )
    expect(Array.from(preparePlanetMeshGeometry(authored).normal.array as Float32Array)).toEqual([
      1, 0, 0, 1, 0, 0, 1, 0, 0,
    ])
    expect(() => preparePlanetMeshGeometry(new BufferGeometry())).toThrow('Invalid planet mesh')
  })
})

describe('convertPlanetGlbMesh', () => {
  it('installs a POSITION-only Atlas-style GLB instead of throwing Invalid planet mesh', async () => {
    const gltf = await new GLTFLoader().parseAsync(positionOnlyTriangleGlb(), '')
    gltf.scene.updateMatrixWorld(true)
    let converted: ReturnType<typeof convertPlanetGlbMesh>
    gltf.scene.traverse((node) => {
      const mesh = node as Mesh
      if (!mesh.isMesh) return
      expect(mesh.geometry.getAttribute('position')).toBeTruthy()
      expect(mesh.geometry.getAttribute('normal')).toBeUndefined()
      converted = convertPlanetGlbMesh(mesh, { kind: 'asphalt', anchorAltitude: 0 })
    })
    expect(converted?.mesh.metadata.nablaCandidateRoad).toBe('asphalt')
    expect(converted?.mesh.metadata.category).toBe('Roads')
    expect(converted?.mesh.normal).toHaveLength(9)
    expect(converted?.mesh.normal.every(Number.isFinite)).toBe(true)
    expect(converted?.mesh.normal[2]).toBeCloseTo(1)
    expect(converted?.mesh.position.every(Number.isFinite)).toBe(true)
  })

  it('converts a BufferGeometry mesh with no authored normals through the worker path', () => {
    const mesh = new Mesh(triangleWithoutNormals(), new MeshStandardMaterial({ color: 0x333333 }))
    mesh.name = 'asphalt-candidate'
    mesh.updateMatrixWorld(true)
    const converted = convertPlanetGlbMesh(mesh, { kind: 'supports', anchorAltitude: 0 })
    expect(converted?.mesh.name).toBe('asphalt-candidate')
    expect(converted?.mesh.normal.every(Number.isFinite)).toBe(true)
    expect(converted?.mesh.normal[2]).toBeCloseTo(1)
  })
})

describe('candidate roads are never trimmed client-side', () => {
  /** Two triangles at sea level, tagged like a water surface (what the sea filter removes). */
  function seaLevelMesh() {
    const geometry = new BufferGeometry()
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([0, 0, 0, 10, 0, 0, 0, 0, 10, 10, 0, 10]), 3),
    )
    geometry.setIndex([0, 2, 1, 1, 2, 3])
    const mesh = new Mesh(geometry, new MeshStandardMaterial())
    mesh.userData = { category: 'Surfaces', groundLayer: 1 }
    mesh.updateMatrixWorld(true)
    return mesh
  }

  it('keeps every bridge supports and asphalt triangle, even at sea level', () => {
    for (const kind of ['supports', 'asphalt'] as const) {
      const converted = convertPlanetGlbMesh(seaLevelMesh(), { kind, anchorAltitude: 0 })
      expect(converted?.mesh.index?.length).toBe(6)
      expect(converted?.mesh.metadata.nablaCandidateRoad).toBe(kind)
    }
  })
})
