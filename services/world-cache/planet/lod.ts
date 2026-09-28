/** Offline LOD only. Z15 remains untouched; coarse tiles can serve as temporary collision fallback. */
import { MeshoptSimplifier } from 'meshoptimizer/simplifier'
import { BufferAttribute, BufferGeometry, Group, Mesh, Matrix4, Quaternion, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { mapTileChildren, mapTilePath, type MapTile } from '#src/scene/mercator.js'
import { planetTileFrame, validatePlanetManifest } from '#src/planet/index.js'
import { geoToLocal, localFrame } from '#src/math/geo/sphere.js'
export const LOD_REVISION = 'mesh-lod-v1'
export interface LodReport {
  revision: string
  inputTriangles: number
  outputTriangles: number
  maxErrorMeters: number
  sources?: string[]
}
/** Compact all attributes together after removing triangles. */
export async function simplifyGeometry(
  geometry: BufferGeometry,
  ratio: number,
  errorMeters: number,
): Promise<{ geometry: BufferGeometry; error: number }> {
  await MeshoptSimplifier.ready
  const positions = new Float32Array(geometry.getAttribute('position').array)
  const indices = geometry.index
    ? new Uint32Array(geometry.index.array)
    : Uint32Array.from({ length: positions.length / 3 }, (_, i) => i)
  const target = Math.max(3, Math.floor((indices.length * ratio) / 3) * 3)
  const [reduced, error] = MeshoptSimplifier.simplify(indices, positions, 3, target, errorMeters, [
    'LockBorder',
    'ErrorAbsolute',
  ])
  const [remap, count] = MeshoptSimplifier.compactMesh(reduced)
  const result = new BufferGeometry()
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const values = new Float32Array(count * attribute.itemSize)
    for (let i = 0; i < remap.length; i++)
      if (remap[i] !== 0xffffffff)
        for (let c = 0; c < attribute.itemSize; c++)
          values[remap[i] * attribute.itemSize + c] = attribute.array[i * attribute.itemSize + c]
    result.setAttribute(name, new BufferAttribute(values, attribute.itemSize, attribute.normalized))
  }
  result.setIndex(new BufferAttribute(reduced, 1))
  result.computeBoundingSphere()
  return { geometry: result, error }
}
export async function simplifyTile(root: Group, zoom: number): Promise<LodReport | undefined> {
  if (zoom >= 15) return
  const meshes: Mesh[] = []
  root.traverse((node) => {
    if (node instanceof Mesh) meshes.push(node)
  })
  const report: LodReport = {
    revision: LOD_REVISION,
    inputTriangles: 0,
    outputTriangles: 0,
    maxErrorMeters: 0,
  }
  for (const mesh of meshes) {
    const input = (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3
    report.inputTriangles += input
    if (mesh.userData.drape || mesh.userData.skirt) {
      mesh.removeFromParent()
      mesh.geometry.dispose()
      continue
    }
    const simplified = await simplifyGeometry(
      mesh.geometry,
      zoom === 14 ? 0.35 : 0.18,
      zoom === 14 ? 1 : 4,
    )
    mesh.geometry.dispose()
    mesh.geometry = simplified.geometry
    delete mesh.userData.parts
    report.outputTriangles += (mesh.geometry.index?.count ?? 0) / 3
    report.maxErrorMeters = Math.max(report.maxErrorMeters, simplified.error)
  }
  return report
}
/** Read a GLB's geometry without fetching/decoding baked textures in Node. */
export async function readGeometryGlb(file: string, expectedHash?: string): Promise<Group> {
  const bytes = await readFile(file)
  if (expectedHash && createHash('sha256').update(bytes).digest('hex') !== expectedHash)
    throw Error('LOD child checksum mismatch')
  const jsonLength = bytes.readUInt32LE(12),
    json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString())
  const clean = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    for (const key of Object.keys(value)) {
      if (key.endsWith('Texture')) delete (value as Record<string, unknown>)[key]
      else clean((value as Record<string, unknown>)[key])
    }
  }
  clean(json)
  delete json.images
  delete json.textures
  delete json.samplers
  const encoded = Buffer.from(JSON.stringify(json))
  const pad = (4 - (encoded.length % 4)) % 4
  const tail = bytes.subarray(20 + jsonLength)
  const buffer = Buffer.alloc(20 + encoded.length + pad + tail.length)
  bytes.copy(buffer, 0, 0, 12)
  buffer.writeUInt32LE(buffer.length, 8)
  buffer.writeUInt32LE(encoded.length + pad, 12)
  buffer.write('JSON', 16)
  encoded.copy(buffer, 20)
  buffer.fill(32, 20 + encoded.length, 20 + encoded.length + pad)
  tail.copy(buffer, 20 + encoded.length + pad)
  Object.assign(globalThis, { self: globalThis })
  const gltf = await new GLTFLoader().parseAsync(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length),
    '',
  )
  return gltf.scene
}
/** Four complete child publications; absence falls back to normal source generation. */
export async function composeChildMeshes(
  output: string,
  tile: MapTile,
): Promise<{ root: Group; sources: string[]; inheritedError: number } | undefined> {
  if (tile.z >= 15) return
  const manifests = []
  try {
    for (const child of mapTileChildren(tile)) {
      const path = join(output, mapTilePath(child))
      const manifest = validatePlanetManifest(
        JSON.parse(await readFile(join(path, 'manifest.json'), 'utf8')),
        child,
      )
      manifests.push({ path, manifest })
    }
  } catch {
    return
  }
  const root = new Group(),
    sources: string[] = []
  const parent = planetTileFrame(tile)
  try {
    for (const { path, manifest } of manifests) {
      const transform = new Matrix4().compose(
        new Vector3(...geoToLocal(parent.anchor, manifest.anchor)),
        localFrame(parent.anchor).invert().multiply(localFrame(manifest.anchor)),
        new Vector3(1, 1, 1),
      )
      sources.push(
        manifest.id +
          '@' +
          Object.values(manifest.files)
            .map((f) => f.sha256)
            .join(':'),
      )
      for (const file of Object.values(manifest.files)) {
        const scene = await readGeometryGlb(join(path, file.path), file.sha256)
        scene.updateMatrixWorld(true)
        const meshes: Mesh[] = []
        scene.traverse((node) => {
          if (node instanceof Mesh) meshes.push(node)
        })
        for (const mesh of meshes) {
          if (!mesh.userData.drape && !mesh.userData.skirt) {
            mesh.geometry.applyMatrix4(new Matrix4().multiplyMatrices(transform, mesh.matrixWorld))
            mesh.position.set(0, 0, 0)
            mesh.quaternion.copy(new Quaternion())
            mesh.scale.set(1, 1, 1)
            root.add(mesh)
          } else mesh.geometry.dispose()
        }
      }
    }
    return {
      root,
      sources,
      inheritedError: Math.max(
        0,
        ...manifests.map(({ manifest }) => manifest.lod?.maxErrorMeters ?? 0),
      ),
    }
  } catch (error) {
    root.traverse((node) => {
      if (node instanceof Mesh) {
        node.geometry.dispose()
        for (const m of Array.isArray(node.material) ? node.material : [node.material]) m.dispose()
      }
    })
    throw error
  }
}
