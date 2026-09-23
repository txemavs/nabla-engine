/** Explicit offline migration pilot. Never relabels or replaces production cache entries. */
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { decodePreparedBinary } from '../../src/prepared-binary.js'
import {
  mapTileAt,
  mapTileBounds,
  mapTileId,
  MAP_ZOOMS,
  type MapTile,
} from '../../src/map-tiles.js'
import { tileAsset, type TileArtifact } from '../../playground/tile-asset.js'
import { clipTriangle, clusterTriangles, type Vertex } from './zoom-geometry.js'
class BlobReader {
  result: ArrayBuffer | null = null
  onloadend?: () => void
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((b) => {
      this.result = b
      this.onloadend?.()
    })
  }
}
Object.assign(globalThis, { FileReader: BlobReader })
const [input, output] = process.argv.slice(2)
if (!input || !output) throw Error('Expected prepared directory and NEW pilot output directory')
const rad = Math.PI / 180,
  earth = 6371000,
  mercator = 6378137
const project = (lat: number, lon: number) => [
  mercator * lon * rad,
  -mercator * Math.asinh(Math.tan(lat * rad)),
]
const entries: {
  path: string
  bounds: { west: number; east: number; north: number; south: number }
  origin: TileArtifact['origin']
  key: string
}[] = []
const cells = new Map<string, MapTile>()
for (const name of (await readdir(input)).filter((n) => n.endsWith('.bin')).sort()) {
  const bytes = await readFile(join(input, name))
  const data = decodePreparedBinary(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  ) as unknown as TileArtifact
  const [tx, tz] = data.key.split('_').map(Number)
  const geo = (x: number, z: number) => ({
    latitude: data.origin.latitude - z / earth / rad,
    longitude: data.origin.longitude + x / (earth * Math.cos(data.origin.latitude * rad)) / rad,
  })
  const nw = geo(tx * 1200 - 600, tz * 1200 - 600),
    se = geo(tx * 1200 + 600, tz * 1200 + 600)
  const [west, north] = project(nw.latitude, nw.longitude),
    [east, south] = project(se.latitude, se.longitude)
  entries.push({
    path: join(input, name),
    origin: data.origin,
    key: data.key,
    bounds: { west, east, north, south },
  })
  for (const z of MAP_ZOOMS) {
    const first = mapTileAt(nw.latitude, nw.longitude, z),
      last = mapTileAt(se.latitude, se.longitude, z)
    for (let x = first.x; x <= last.x; x++)
      for (let y = first.y; y <= last.y; y++) {
        const tile = { z, x, y }
        cells.set(mapTileId(tile), tile)
      }
  }
}
if (!entries.length || cells.size > 256) throw Error('Pilot requires 1–256 output cells')
const catalog: Record<string, unknown>[] = []
for (const tile of [...cells.values()].sort((a, b) => a.z - b.z || a.x - b.x || a.y - b.y)) {
  const b = mapTileBounds(tile)
  const [west, north] = project(b.north, b.west),
    [east, south] = project(b.south, b.east)
  const cx = (west + east) / 2,
    cz = (north + south) / 2
  const bounds = { west, east, north, south }
  const batches = new Map<
    string,
    {
      geometries: THREE.BufferGeometry[]
      material: THREE.Material
      layer: number
      category: string
    }
  >()
  let before = 0
  for (const entry of entries) {
    if (
      entry.bounds.east <= west ||
      entry.bounds.west >= east ||
      entry.bounds.south <= north ||
      entry.bounds.north >= south
    )
      continue
    const bytes = await readFile(entry.path)
    const data = decodePreparedBinary(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    ) as unknown as TileArtifact
    const root = tileAsset(data)
    root.updateMatrixWorld(true)
    const [tx, tz] = data.key.split('_').map(Number)
    root.traverse((node) => {
      const mesh = node as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
      if (!mesh.isMesh) return
      const p = mesh.geometry.getAttribute('position'),
        normal = mesh.geometry.getAttribute('normal'),
        colors = mesh.geometry.getAttribute('color'),
        index = mesh.geometry.index
      const vertices: Vertex[] = []
      const point = new THREE.Vector3(),
        n = new THREE.Vector3(),
        normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)
      const transformed: Vertex[] = []
      for (let i = 0; i < p.count; i++) {
        point.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld)
        const latitude = data.origin.latitude - (point.z + tz * 1200) / earth / rad
        const longitude =
          data.origin.longitude +
          (point.x + tx * 1200) / (earth * Math.cos(data.origin.latitude * rad)) / rad
        const [x, z] = project(latitude, longitude)
        n.fromBufferAttribute(normal, i).applyNormalMatrix(normalMatrix)
        transformed.push([
          x,
          point.y + data.origin.altitude,
          z,
          n.x,
          n.y,
          n.z,
          colors ? colors.getX(i) : mesh.material.color.r,
          colors ? colors.getY(i) : mesh.material.color.g,
          colors ? colors.getZ(i) : mesh.material.color.b,
        ])
      }
      for (let i = 0; i < (index?.count ?? p.count); i += 3) {
        const triangle = [0, 1, 2].map((j) => transformed[index ? index.getX(i + j) : i + j])
        // Crop the legacy extraction margins first; XYZ borders then have unique ownership.
        for (const part of clipTriangle(triangle, entry.bounds))
          for (const clipped of clipTriangle(part, bounds))
            for (const v of clipped)
              vertices.push([v[0] - cx, ...v.slice(1, 2), v[2] - cz, ...v.slice(3)])
      }
      before += vertices.length / 3
      const step = tile.z === 15 ? 0 : tile.z === 14 ? 5 : 20
      const compact = clusterTriangles(vertices, step)
      if (!compact.indices.length) return
      const geometry = new THREE.BufferGeometry()
      for (const [name, start] of [
        ['position', 0],
        ['normal', 3],
        ['color', 6],
      ] as const)
        geometry.setAttribute(
          name,
          new THREE.Float32BufferAttribute(
            compact.vertices.flatMap((v) => v.slice(start, start + 3)),
            3,
          ),
        )
      geometry.setIndex(compact.indices)
      const category = mesh.userData.category === 'Buildings' ? 'buildings-osm' : 'terrain'
      const layer = Number(mesh.userData.groundLayer ?? 0)
      const key = `${category}/${layer}/${mesh.material.side}`
      if (!batches.has(key)) {
        const material = mesh.material.clone()
        material.color.set('#ffffff')
        material.vertexColors = true
        batches.set(key, { geometries: [], material, layer, category })
      }
      batches.get(key)!.geometries.push(geometry)
    })
    root.traverse((node) => {
      const m = node as THREE.Mesh
      if (m.isMesh) {
        m.geometry.dispose()
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose()
      }
    })
  }
  const directory = `${tile.z}/${tile.x}/${tile.y}`
  await mkdir(join(output, directory), { recursive: true })
  let triangles = 0,
    draws = 0,
    totalBytes = 0
  const files: Record<string, unknown> = {}
  for (const category of ['terrain', 'buildings-osm']) {
    const root = new THREE.Group()
    for (const batch of batches.values())
      if (batch.category === category) {
        const geometry = mergeGeometries(batch.geometries)
        if (!geometry) throw Error('Cannot merge tile batch')
        for (const g of batch.geometries) g.dispose()
        const mesh = new THREE.Mesh(geometry, batch.material)
        mesh.userData = {
          groundLayer: batch.layer,
          category: category === 'terrain' ? 'Surfaces' : 'Buildings',
        }
        root.add(mesh)
        triangles += geometry.index!.count / 3
        draws++
      }
    const binary = (await new GLTFExporter().parseAsync(root, { binary: true })) as ArrayBuffer
    const hash = createHash('sha256').update(new Uint8Array(binary)).digest('hex')
    const name = `${category}-${hash.slice(0, 16)}.glb`
    await writeFile(join(output, directory, name), new Uint8Array(binary))
    files[category] = { path: `${directory}/${name}`, bytes: binary.byteLength, sha256: hash }
    totalBytes += binary.byteLength
    root.traverse((node) => {
      const m = node as THREE.Mesh
      if (m.isMesh) {
        m.geometry.dispose()
        ;(m.material as THREE.Material).dispose()
      }
    })
  }
  catalog.push({
    ...tile,
    id: mapTileId(tile),
    bounds: b,
    projectedCenter: [cx, cz],
    files,
    triangles,
    sourceTriangles: before,
    draws,
    bytes: totalBytes,
  })
  console.log(
    JSON.stringify({
      tile: mapTileId(tile),
      triangles,
      sourceTriangles: before,
      bytes: totalBytes,
    }),
  )
}
await writeFile(
  join(output, 'catalog.json'),
  JSON.stringify(
    {
      format: 'nabla-xyz-pilot-v1',
      partialCoverage: true,
      sourceBounds: entries.map((e) => e.bounds),
      tiles: catalog,
      attribution: '© OpenStreetMap contributors; elevation: Esri',
    },
    null,
    2,
  ),
)
