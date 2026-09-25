/**
 * Satellite roofs are baked once, when the tile is published.
 * A zoom-13 mesh is cut into zoom-15 cells. Each cell keeps the zoom-18 photo
 * that used to be draped onto a zoom-15 GLB. The browser only reads the GLB.
 */
import { createRequire } from 'node:module'
import {
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  DataTexture,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Group,
} from 'three'
import type { MapTile } from '#src/scene/mercator.js'
import { planetTileFrame } from '#src/planet/tiles.js'

const require = createRequire(import.meta.url)
const jpeg = require('jpeg-js') as {
  decode: (
    buffer: Uint8Array,
    options?: { useTArray?: boolean; maxMemoryUsageInMB?: number },
  ) => { width: number; height: number; data: Uint8Array }
  encode: (
    image: { data: Uint8Array | Uint8ClampedArray; width: number; height: number },
    quality: number,
  ) => { data: Uint8Array }
}

export function roofGrid(zoom: number) {
  return zoom >= 15 ? 1 : 2 ** (15 - zoom)
}

/** Mercator child for a point. `v` is 1 at the north edge of the parent tile. */
export function roofCell(tile: MapTile, u: number, v: number) {
  const n = roofGrid(tile.z)
  const col = Math.min(n - 1, Math.max(0, Math.floor(u * n)))
  const row = Math.min(n - 1, Math.max(0, Math.floor((1 - v) * n)))
  return {
    n,
    col,
    row,
    tile: {
      z: tile.z + Math.round(Math.log2(n)),
      x: tile.x * n + col,
      y: tile.y * n + row,
    } satisfies MapTile,
  }
}

/** glTF v=0 is the top of the photo, and the top of the photo is north. */
export function roofUv(n: number, col: number, row: number, u: number, v: number) {
  return [u * n - col, 1 - (v * n - (n - 1 - row))] as [number, number]
}

/** The exporter encodes DataTextures through a canvas. Node has neither. */
function installExportCanvas() {
  if (typeof document !== 'undefined') return
  class ImageDataPoly {
    data: Uint8ClampedArray
    width: number
    height: number
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data
      this.width = width
      this.height = height
    }
  }
  class CanvasPoly {
    width = 1
    height = 1
    pixels?: Uint8ClampedArray
    getContext() {
      const canvas = this
      return {
        translate() {},
        scale() {},
        putImageData(image: { data: Uint8ClampedArray }) {
          canvas.pixels = image.data
        },
      }
    }
    toBlob(callback: (blob: Blob) => void, mime: string) {
      if (!this.pixels || mime !== 'image/jpeg') {
        callback(new Blob())
        return
      }
      const encoded = jpeg.encode({ data: this.pixels, width: this.width, height: this.height }, 70)
      const copy = new Uint8Array(encoded.data.byteLength)
      copy.set(encoded.data)
      callback(new Blob([copy], { type: mime }))
    }
  }
  Object.assign(globalThis, {
    ImageData: ImageDataPoly,
    document: { createElement: () => new CanvasPoly() },
  })
}

async function mosaic(tile: MapTile, zoom: number) {
  const span = 2 ** (zoom - tile.z)
  const size = span * 256
  const pixels = new Uint8Array(size * size * 4)
  let loaded = 0
  const jobs: { row: number; col: number }[] = []
  for (let row = 0; row < span; row++) for (let col = 0; col < span; col++) jobs.push({ row, col })
  let cursor = 0
  const worker = async () => {
    while (cursor < jobs.length) {
      const { row, col } = jobs[cursor++]
      try {
        const response = await fetch(
          `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${tile.y * span + row}/${tile.x * span + col}`,
          { headers: { 'User-Agent': 'NablaPlanet/1.0' }, signal: AbortSignal.timeout(20000) },
        )
        if (!response.ok) continue
        const bytes = new Uint8Array(await response.arrayBuffer())
        if (bytes.byteLength > 2 * 1024 * 1024) continue
        const image = jpeg.decode(bytes, { useTArray: true, maxMemoryUsageInMB: 64 })
        if (image.width !== 256 || image.height !== 256) continue
        for (let y = 0; y < 256; y++) {
          pixels.set(
            image.data.subarray(y * 256 * 4, (y + 1) * 256 * 4),
            ((row * 256 + y) * size + col * 256) * 4,
          )
        }
        loaded++
      } catch {
        // A missing photo stays black. The rest of the cell still publishes.
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker))
  return loaded ? pixels : undefined
}

export async function bakeRoofImagery(root: Group, tile: MapTile) {
  installExportCanvas()
  let buildings: Mesh | undefined
  root.traverse((node) => {
    const mesh = node as Mesh
    if (mesh.isMesh && mesh.userData.category === 'Buildings' && !mesh.userData.skirt)
      buildings = mesh
  })
  const source = buildings
  if (!source?.parent) return
  const width = planetTileFrame(tile).width
  const position = source.geometry.getAttribute('position')
  const normal = source.geometry.getAttribute('normal')
  const index = source.geometry.index
  const triCount = (index ? index.count : position.count) / 3
  const cells = new Map<
    string,
    { tile: MapTile; n: number; col: number; row: number; xyz: number[] }
  >()
  for (let t = 0; t < triCount; t++) {
    const ids = [0, 1, 2].map((k) => (index ? index.getX(t * 3 + k) : t * 3 + k))
    if ((normal.getY(ids[0]) + normal.getY(ids[1]) + normal.getY(ids[2])) / 3 < 0.55) continue
    const uv = ids.map((i) => [0.5 + position.getX(i) / width, 0.5 - position.getZ(i) / width])
    const cell = roofCell(
      tile,
      (uv[0][0] + uv[1][0] + uv[2][0]) / 3,
      (uv[0][1] + uv[1][1] + uv[2][1]) / 3,
    )
    const key = `${cell.col}/${cell.row}`
    const bucket = cells.get(key) ?? { ...cell, xyz: [] }
    for (let k = 0; k < ids.length; k++) {
      const i = ids[k]
      const [s, tuv] = roofUv(cell.n, cell.col, cell.row, uv[k][0], uv[k][1])
      bucket.xyz.push(position.getX(i), position.getY(i) + 0.15, position.getZ(i), s, tuv)
    }
    cells.set(key, bucket)
  }
  for (const cell of cells.values()) {
    const zoom = cell.tile.z + 3
    const pixels = await mosaic(cell.tile, zoom)
    if (!pixels) continue
    const span = 2 ** (zoom - cell.tile.z)
    const texture = new DataTexture(pixels, span * 256, span * 256)
    texture.colorSpace = SRGBColorSpace
    texture.flipY = false
    texture.wrapS = texture.wrapT = ClampToEdgeWrapping
    texture.userData.mimeType = 'image/jpeg'
    texture.needsUpdate = true
    const count = cell.xyz.length / 5
    const xyz = new Float32Array(count * 3)
    const uv = new Float32Array(count * 2)
    const normals = new Float32Array(count * 3)
    for (let i = 0, v = 0; i < cell.xyz.length; i += 5, v++) {
      xyz.set(cell.xyz.slice(i, i + 3), v * 3)
      uv.set(cell.xyz.slice(i + 3, i + 5), v * 2)
      normals.set([0, 1, 0], v * 3)
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(xyz, 3))
    geometry.setAttribute('normal', new BufferAttribute(normals, 3))
    geometry.setAttribute('uv', new BufferAttribute(uv, 2))
    const draped = new Mesh(
      geometry,
      new MeshStandardMaterial({ map: texture, roughness: 1, metalness: 0 }),
    )
    draped.name = 'Drape'
    draped.userData = { drape: 'roofs', ready: true, category: 'Drape' }
    source.parent.add(draped)
  }
}
