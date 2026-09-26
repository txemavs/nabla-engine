/**
 * Distant maps are photographs of the meshes we already published.
 * Four z15 GLBs become one z14 JPEG. Four of those become a z13, and so on.
 * A parent is written only when all four children exist.
 */
import { createRequire } from 'node:module'
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { Mesh, Object3D } from 'three'
import { mapTilePath, type MapTile } from '#src/scene/mercator.js'

const require = createRequire(import.meta.url)
const jpeg = require('jpeg-js') as {
  encode: (
    image: { data: Uint8Array; width: number; height: number },
    quality: number,
  ) => {
    data: Uint8Array
  }
  decode: (
    bytes: Uint8Array,
    options: { useTArray: true; maxMemoryUsageInMB: number },
  ) => { data: Uint8Array; width: number; height: number }
}

/** One z15 raster. Each coarser zoom doubles it by placing four children. */
export const PHOTO_CELL = 256
const GROUND = [0x30, 0x4d, 0x25]
const MAX_ZOOM = 10

class BlobReader {
  result: ArrayBuffer | null = null
  onloadend?: () => void
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((buffer) => {
      this.result = buffer
      this.onloadend?.()
    })
  }
}
if (typeof globalThis.FileReader === 'undefined')
  Object.assign(globalThis, { FileReader: BlobReader })

export interface PhotoMesh {
  position: Float32Array
  color?: Float32Array
  index?: Uint32Array
}

function srgbByte(channel: number) {
  const c = Math.min(1, Math.max(0, channel))
  const encoded = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, encoded)) * 255)
}

/** Top-down colour of one tile. +X east, +Z south, origin at the centre. North is row 0. */
export function rasterizeTile(meshes: PhotoMesh[], width: number, size = PHOTO_CELL) {
  const pixels = new Uint8ClampedArray(size * size * 4)
  const depth = new Float32Array(size * size)
  depth.fill(-1e9)
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = GROUND[0]
    pixels[i + 1] = GROUND[1]
    pixels[i + 2] = GROUND[2]
    pixels[i + 3] = 255
  }
  for (const mesh of meshes) {
    const position = mesh.position
    const color = mesh.color
    const index = mesh.index ?? Uint32Array.from({ length: position.length / 3 }, (_, i) => i)
    for (let t = 0; t + 2 < index.length; t += 3) {
      const ids = [index[t], index[t + 1], index[t + 2]]
      const vx = ids.map((id) => (position[id * 3] / width + 0.5) * size)
      const vy = ids.map((id) => (position[id * 3 + 2] / width + 0.5) * size)
      const altitude = ids.map((id) => position[id * 3 + 1])
      const denom = (vy[1] - vy[2]) * (vx[0] - vx[2]) + (vx[2] - vx[1]) * (vy[0] - vy[2])
      if (Math.abs(denom) < 1e-8) continue
      const minX = Math.max(0, Math.floor(Math.min(...vx)))
      const maxX = Math.min(size - 1, Math.ceil(Math.max(...vx)))
      const minY = Math.max(0, Math.floor(Math.min(...vy)))
      const maxY = Math.min(size - 1, Math.ceil(Math.max(...vy)))
      for (let row = minY; row <= maxY; row++)
        for (let col = minX; col <= maxX; col++) {
          const w0 = ((vy[1] - vy[2]) * (col - vx[2]) + (vx[2] - vx[1]) * (row - vy[2])) / denom
          const w1 = ((vy[2] - vy[0]) * (col - vx[2]) + (vx[0] - vx[2]) * (row - vy[2])) / denom
          const w2 = 1 - w0 - w1
          if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue
          const top = w0 * altitude[0] + w1 * altitude[1] + w2 * altitude[2]
          const at = row * size + col
          if (top < depth[at]) continue
          depth[at] = top
          const offset = at * 4
          for (let channel = 0; channel < 3; channel++)
            pixels[offset + channel] = color
              ? srgbByte(
                  w0 * color[ids[0] * 3 + channel] +
                    w1 * color[ids[1] * 3 + channel] +
                    w2 * color[ids[2] * 3 + channel],
                )
              : 255
          pixels[offset + 3] = 255
        }
    }
  }
  return pixels
}

async function readGlbMeshes(file: string): Promise<PhotoMesh[]> {
  const bytes = await readFile(file)
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
  const loader = new GLTFLoader()
  const gltf = await loader.parseAsync(buffer, '')
  gltf.scene.updateMatrixWorld(true)
  const meshes: PhotoMesh[] = []
  gltf.scene.traverse((node: Object3D) => {
    const mesh = node as Mesh
    if (!mesh.isMesh) return
    const geometry = mesh.geometry.clone()
    geometry.applyMatrix4(mesh.matrixWorld)
    const position = geometry.getAttribute('position')
    const color = geometry.getAttribute('color')
    const index = geometry.getIndex()
    meshes.push({
      position: new Float32Array(position.array),
      color: color ? new Float32Array(color.array) : undefined,
      index: index ? new Uint32Array(index.array) : undefined,
    })
    geometry.dispose()
  })
  return meshes
}

async function tileRaster(publishRoot: string, tile: MapTile, size: number) {
  if (tile.z === 15) {
    const directory = join(publishRoot, mapTilePath(tile))
    const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')) as {
      anchor: { latitude: number }
      files: Record<string, { path: string }>
    }
    const width =
      ((2 * Math.PI * 6371000) / 2 ** tile.z) * Math.cos((manifest.anchor.latitude * Math.PI) / 180)
    const meshes: PhotoMesh[] = []
    for (const name of ['terrain', 'buildings-osm']) {
      const path = manifest.files[name]?.path
      if (!path) continue
      meshes.push(...(await readGlbMeshes(join(directory, path))))
    }
    if (!meshes.length) throw Error('Tile has no mesh')
    return rasterizeTile(meshes, width, size)
  }
  const file = photoPath(publishRoot, tile)
  const image = jpeg.decode(new Uint8Array(await readFile(file)), {
    useTArray: true,
    maxMemoryUsageInMB: 64,
  })
  if (image.width !== size || image.height !== size) throw Error('Child photo has the wrong size')
  return image.data
}

function photoPath(publishRoot: string, tile: MapTile) {
  return join(publishRoot, 'photos', mapTilePath(tile) + '.jpg')
}

function childSize(tile: MapTile) {
  return PHOTO_CELL << (15 - (tile.z + 1))
}

/** Write one parent photo. Returns false when any of the four children is missing. */
export async function composePhoto(publishRoot: string, tile: MapTile): Promise<boolean> {
  if (tile.z >= 15 || tile.z < MAX_ZOOM) return false
  const size = childSize(tile)
  const parent = size * 2
  const pixels = new Uint8ClampedArray(parent * parent * 4)
  for (let dy = 0; dy < 2; dy++)
    for (let dx = 0; dx < 2; dx++) {
      const child = { z: tile.z + 1, x: tile.x * 2 + dx, y: tile.y * 2 + dy }
      let raster: Uint8Array | Uint8ClampedArray
      try {
        raster = await tileRaster(publishRoot, child, size)
      } catch {
        return false
      }
      for (let row = 0; row < size; row++) {
        pixels.set(
          raster.subarray(row * size * 4, (row + 1) * size * 4),
          ((dy * size + row) * parent + dx * size) * 4,
        )
      }
    }
  const encoded = jpeg.encode({ data: pixels, width: parent, height: parent }, 80)
  const path = photoPath(publishRoot, tile)
  await mkdir(join(path, '..'), { recursive: true })
  const temporary = path + `.${process.pid}.tmp`
  await writeFile(temporary, encoded.data)
  await rename(temporary, path)
  await unlink(temporary).catch(() => {})
  return true
}

/** Climb from a finished z15 while every ancestor has its four children. */
export async function composeAncestors(publishRoot: string, leaf: MapTile) {
  let tile = leaf
  const written: MapTile[] = []
  while (tile.z > MAX_ZOOM) {
    const parent = { z: tile.z - 1, x: tile.x >> 1, y: tile.y >> 1 }
    if (!(await composePhoto(publishRoot, parent))) break
    written.push(parent)
    tile = parent
  }
  return written
}

/** Every complete parent above the z15 GLBs already on disk. Coarser zooms first. */
export async function composePublished(publishRoot: string) {
  const zoom = join(publishRoot, 'z', '15')
  const leaves: MapTile[] = []
  for (const x of await readdir(zoom).catch(() => []))
    for (const y of await readdir(join(zoom, x)).catch(() => []))
      leaves.push({ z: 15, x: Number(x), y: Number(y) })
  const parents = new Map<string, MapTile>()
  for (const leaf of leaves) {
    let tile = leaf
    while (tile.z > MAX_ZOOM) {
      tile = { z: tile.z - 1, x: tile.x >> 1, y: tile.y >> 1 }
      parents.set(mapTilePath(tile), tile)
    }
  }
  const written: string[] = []
  for (const tile of [...parents.values()].sort((a, b) => b.z - a.z || a.x - b.x || a.y - b.y))
    if (await composePhoto(publishRoot, tile)) written.push(mapTilePath(tile))
  return written
}

if (process.argv[1]?.includes('compose-photo')) {
  const root = process.argv[2]
  if (!root) throw Error('Usage: compose-photo <publish-root>')
  console.log(JSON.stringify(await composePublished(root)))
}
