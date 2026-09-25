import * as THREE from 'three'
import {
  coversTile,
  planetCollisionChunks,
  type HorizonGeometry,
  type PlanetCollisionTile,
} from '../src/planet/index.js'
import { geoToLocal, localFrame, type GeoPoint } from '../src/math/geo/sphere.js'
import { mapTileAt, mapTileId, mapTileSample, type MapTile } from '../src/scene/mercator.js'
import { matteGroundMaterial } from './ground-material.js'

/** Preview tiles fill missing water with #0c2104. JPEG rounding stays in this box. */
export function previewWater(r: number, g: number, b: number) {
  return r < 20 && g > 24 && g < 42 && b < 12 && g - r > 12
}

type Rgba = { width: number; height: number; data: ArrayLike<number> }

/** North is the top of the JPEG. `v = 1` is north. */
function pixelWater(image: Rgba, u: number, v: number) {
  const x = Math.min(image.width - 1, Math.max(0, Math.round(u * (image.width - 1))))
  const y = Math.min(image.height - 1, Math.max(0, Math.round((1 - v) * (image.height - 1))))
  const i = (y * image.width + x) * 4
  return previewWater(image.data[i], image.data[i + 1], image.data[i + 2])
}

export function reliefWaterQuads(image: Rgba) {
  const quads = new Set<number>()
  for (let row = 0; row < 32; row++)
    for (let col = 0; col < 32; col++)
      if (pixelWater(image, (col + 0.5) / 32, 1 - (row + 0.5) / 32)) quads.add(row * 32 + col)
  return quads
}

async function fetchJpeg(url: string) {
  const response = await fetch(url).catch(() => undefined)
  if (!response?.ok) return
  const bitmap = await createImageBitmap(await response.blob())
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    bitmap.close()
    return
  }
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return {
    image: { width: canvas.width, height: canvas.height, data: frame.data },
    texture,
  }
}

function takeQuads(blocks: { index: Uint32Array }[], sea: Set<number>, water: boolean) {
  const values: number[] = []
  for (const block of blocks)
    for (let i = 0; i < block.index.length; i += 6) {
      const corner = block.index[i]
      const row = Math.floor(corner / 33)
      const col = corner % 33
      if (sea.has(row * 32 + col) !== water) continue
      for (let j = 0; j < 6; j++) values.push(block.index[i + j])
    }
  return new Uint32Array(values)
}

/** Independent elevation-only coverage: no OSM jobs or old metric grid required. */
export class PlanetHorizon {
  readonly root = new THREE.Group()
  private worker = new Worker(new URL('./planet-horizon.worker.ts', import.meta.url), {
    type: 'module',
  })
  private cells = new Map<
    string,
    {
      mesh: THREE.Mesh
      data: HorizonGeometry
      physics: PlanetCollisionTile
      mask: string
      texture?: THREE.Texture
      textured: boolean
      sea: Set<number>
      water?: THREE.Mesh
      fine: THREE.Mesh[]
    }
  >()
  private wanted: MapTile[] = []
  private pending = new Set<string>()
  private retry = new Map<string, number>()
  private coverage: MapTile[] = []
  private ocean = new Set<string>()
  private span = 2
  private focus: MapTile | null = null
  private focusKey = ''
  private createSea: () => THREE.Material = () =>
    new THREE.MeshStandardMaterial({
      color: '#102f43',
      roughness: 0.3,
      metalness: 0.03,
      envMapIntensity: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  constructor(
    private origin: GeoPoint,
    private changed: () => void,
    private photos = import.meta.env.VITE_WORLD_PREVIEW_URL || 'http://127.0.0.1:8787/tiles',
    private setupMaterial: (material: THREE.Material) => void = () => {},
  ) {
    this.worker.onmessage = (
      event: MessageEvent<{ tile: MapTile; data?: HorizonGeometry; error?: string }>,
    ) => {
      const { tile, data } = event.data,
        key = mapTileId(tile)
      this.pending.delete(key)
      if (data && this.wanted.some((t) => mapTileId(t) === key)) this.install(data)
      else if (!data) this.retry.set(key, Date.now() + 30000)
      this.pump()
      this.changed()
    }
  }
  get collisionTiles() {
    return [...this.cells.values()].filter((c) => c.mesh.visible).map((c) => c.physics)
  }
  update(latitude: number, longitude: number, span = this.span) {
    this.span = Math.max(1, Math.min(16, Math.round(span)))
    const center = mapTileAt(latitude, longitude, 13),
      n = 2 ** 13
    const radius = this.span
    const tiles: MapTile[] = []
    for (let y = -radius; y <= radius; y++)
      for (let x = -radius; x <= radius; x++)
        if (center.y + y >= 0 && center.y + y < n)
          tiles.push({ z: 13, x: (center.x + x + n) % n, y: center.y + y })
    tiles.sort(
      (a, b) =>
        Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y),
    )
    this.wanted = tiles
    const keep = new Set(tiles.map(mapTileId))
    for (const [key, c] of this.cells)
      if (!keep.has(key)) {
        c.mesh.removeFromParent()
        c.mesh.geometry.dispose()
        c.texture?.dispose()
        this.dropWater(c.water)
        for (const mesh of c.fine) this.dropFine(mesh)
        ;(c.mesh.material as THREE.Material).dispose()
        this.cells.delete(key)
      }
    for (const key of this.retry.keys()) if (!keep.has(key)) this.retry.delete(key)
    this.pump()
  }
  private pump() {
    for (const tile of this.wanted) {
      if (this.pending.size >= (this.span > 4 ? 6 : 2)) return
      const key = mapTileId(tile)
      if (this.cells.has(key) || this.pending.has(key) || Date.now() < (this.retry.get(key) ?? 0))
        continue
      this.pending.add(key)
      this.worker.postMessage({ tile })
    }
  }
  private install(data: HorizonGeometry) {
    const anchor = mapTileSample(data.tile, 1, 1, 2)
    const position = geoToLocal(this.origin, anchor),
      rotation = localFrame(this.origin).invert().multiply(localFrame(anchor)).toArray()
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(data.position, 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(data.uv, 2))
    const material = matteGroundMaterial({ color: '#304d25' })
    this.setupMaterial(material)
    const mesh = new THREE.Mesh(geometry, material)
    const key = mapTileId(data.tile)
    const photo = `${this.photos.replace(/\/$/, '')}/${data.tile.z}/${data.tile.x}/${data.tile.y}.jpg`
    void this.wear(key, photo, material)
    mesh.position.fromArray(position)
    mesh.quaternion.fromArray(rotation)
    mesh.name = 'Distant planetary relief'
    mesh.userData.horizon = true
    this.cells.set(key, {
      mesh,
      data,
      physics: { id: 'relief:' + key, pose: { position, rotation }, chunks: [] },
      mask: 'uninitialized',
      textured: false,
      sea: new Set(),
      fine: [],
    })
    this.root.add(mesh)
    this.setCoverage(this.coverage)
    this.dress(this.cells.get(key)!)
  }
  private async wear(key: string, photo: string, material: THREE.MeshPhysicalMaterial) {
    const loaded = await fetchJpeg(photo)
    const cell = this.cells.get(key)
    if (!loaded || !cell) {
      loaded?.texture.dispose()
      return
    }
    loaded.texture.colorSpace = THREE.SRGBColorSpace
    loaded.texture.anisotropy = 4
    for (const quad of reliefWaterQuads(loaded.image)) cell.sea.add(quad)
    material.color.set('#ffffff')
    material.map = loaded.texture
    material.needsUpdate = true
    cell.texture = loaded.texture
    cell.textured = true
    cell.mask = ''
    this.setCoverage(this.coverage)
    this.dress(cell)
    this.changed()
  }
  /** Fills the preview's flat green with the same surface as the loaded sea. */
  setSeaMaterial(create: () => THREE.Material) {
    this.createSea = create
    for (const cell of this.cells.values()) {
      if (!cell.water) continue
      const previous = cell.water.material as THREE.Material
      cell.water.material = create()
      previous.dispose()
    }
  }
  setFocus(tile: MapTile | null) {
    const key = tile ? mapTileId(tile) : ''
    if (key === this.focusKey) return
    this.focus = tile
    this.focusKey = key
    for (const cell of this.cells.values()) this.dress(cell)
  }
  private dropWater(mesh?: THREE.Mesh) {
    if (!mesh) return
    mesh.removeFromParent()
    mesh.geometry.dispose()
    ;(mesh.material as THREE.Material).dispose()
  }
  private dropFine(mesh: THREE.Mesh) {
    mesh.removeFromParent()
    mesh.geometry.dispose()
    const material = mesh.material as THREE.MeshPhysicalMaterial
    material.map?.dispose()
    material.dispose()
  }
  private dress(cell: {
    mesh: THREE.Mesh
    data: HorizonGeometry
    sea: Set<number>
    mask: string
    fine: THREE.Mesh[]
  }) {
    for (const mesh of cell.fine) this.dropFine(mesh)
    cell.fine = []
    const focus = this.focus
    if (!focus) return
    const groups = new Map<string, { tile: MapTile; index: number[] }>()
    const span = 2 ** 15
    for (const block of cell.data.blocks) {
      if (
        !block.index.length ||
        this.ocean.has(mapTileId(block.tile)) ||
        this.coverage.some((tile) => coversTile(tile, block.tile))
      )
        continue
      const kept: number[] = []
      for (let i = 0; i < block.index.length; i += 6) {
        const corner = block.index[i]
        const row = Math.floor(corner / 33)
        const col = corner % 33
        if (cell.sea.has(row * 32 + col)) continue
        for (let j = 0; j < 6; j++) kept.push(block.index[i + j])
      }
      if (!kept.length) continue
      const dx = Math.abs(block.tile.x - focus.x)
      const dy = Math.abs(block.tile.y - focus.y)
      const near = Math.max(Math.min(dx, span - dx), Math.min(dy, span - dy))
      const zoom = near <= 8 ? 14 : 0
      if (!zoom) continue
      const tile =
        zoom === 15
          ? block.tile
          : { z: 14, x: Math.floor(block.tile.x / 2), y: Math.floor(block.tile.y / 2) }
      const id = mapTileId(tile)
      const group = groups.get(id) ?? { tile, index: [] }
      group.index.push(...kept)
      groups.set(id, group)
    }
    const parent = cell.data.tile
    for (const group of groups.values()) {
      const scale = 2 ** (group.tile.z - parent.z)
      const originCol = (group.tile.x - parent.x * scale) * (32 / scale)
      const originRow = (group.tile.y - parent.y * scale) * (32 / scale)
      const step = 32 / scale
      const uv = new Float32Array(cell.data.uv.length)
      for (let row = 0; row <= 32; row++)
        for (let col = 0; col <= 32; col++) {
          const i = (row * 33 + col) * 2
          uv[i] = (col - originCol) / step
          uv[i + 1] = 1 - (row - originRow) / step
        }
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(cell.data.position, 3))
      geometry.setAttribute('normal', new THREE.BufferAttribute(cell.data.normal, 3))
      geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
      geometry.setIndex(group.index)
      const material = matteGroundMaterial({
        color: '#ffffff',
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
      this.setupMaterial(material)
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.copy(cell.mesh.position)
      mesh.quaternion.copy(cell.mesh.quaternion)
      mesh.visible = false
      mesh.name = 'Flight photo'
      mesh.userData.zoom = group.tile.z
      const photo = `${this.photos.replace(/\/$/, '')}/${group.tile.z}/${group.tile.x}/${group.tile.y}.jpg`
      void this.wearFlight(cell, mesh, material, photo, uv)
      cell.mesh.parent?.add(mesh)
      cell.fine.push(mesh)
    }
  }
  /** A z14 flight photo is what paints the flat green over the loaded sea. */
  private async wearFlight(
    cell: { sea: Set<number>; fine: THREE.Mesh[]; mask: string },
    mesh: THREE.Mesh,
    material: THREE.MeshPhysicalMaterial,
    photo: string,
    uv: Float32Array,
  ) {
    const loaded = await fetchJpeg(photo)
    if (!cell.fine.includes(mesh)) {
      loaded?.texture.dispose()
      return
    }
    if (!loaded) return
    const index = mesh.geometry.index?.array
    if (!index) {
      loaded.texture.dispose()
      return
    }
    const kept: number[] = []
    let added = false
    for (let i = 0; i < index.length; i += 6) {
      const ids = [index[i], index[i + 1], index[i + 2], index[i + 5]]
      let u = 0
      let v = 0
      for (const id of ids) {
        u += uv[id * 2]
        v += uv[id * 2 + 1]
      }
      const corner = index[i]
      const quad = Math.floor(corner / 33) * 32 + (corner % 33)
      if (pixelWater(loaded.image, u / 4, v / 4)) {
        if (!cell.sea.has(quad)) {
          cell.sea.add(quad)
          added = true
        }
        continue
      }
      for (let j = 0; j < 6; j++) kept.push(index[i + j])
    }
    if (!cell.fine.includes(mesh)) {
      loaded.texture.dispose()
      return
    }
    if (added) {
      cell.mask = ''
      this.setCoverage(this.coverage)
    }
    if (!kept.length) {
      loaded.texture.dispose()
      return
    }
    mesh.geometry.setIndex(kept)
    loaded.texture.colorSpace = THREE.SRGBColorSpace
    loaded.texture.anisotropy = 8
    material.map = loaded.texture
    material.needsUpdate = true
    mesh.visible = true
    this.changed()
  }
  /** Preview green is missing water, not land. Lay it at sea level with the sea surface. */
  private layWater(
    cell: {
      mesh: THREE.Mesh
      data: HorizonGeometry
      sea: Set<number>
      water?: THREE.Mesh
    },
    index: Uint32Array,
  ) {
    if (!index.length) {
      if (cell.water) cell.water.visible = false
      return
    }
    if (!cell.water) {
      const position = new Float32Array(cell.data.position)
      for (const quad of cell.sea) {
        const row = Math.floor(quad / 32)
        const col = quad % 32
        for (const i of [
          row * 33 + col,
          row * 33 + col + 1,
          (row + 1) * 33 + col,
          (row + 1) * 33 + col + 1,
        ])
          position[i * 3 + 1] = 0.08
      }
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
      const normal = new Float32Array(position.length)
      for (let i = 1; i < normal.length; i += 3) normal[i] = 1
      geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
      geometry.setIndex(new THREE.BufferAttribute(index, 1))
      const mesh = new THREE.Mesh(geometry, this.createSea())
      mesh.position.copy(cell.mesh.position)
      mesh.quaternion.copy(cell.mesh.quaternion)
      mesh.name = 'Open water'
      cell.mesh.parent?.add(mesh)
      cell.water = mesh
      return
    }
    cell.water.geometry.setIndex(new THREE.BufferAttribute(index, 1))
    cell.water.visible = true
  }
  /** Ocean cells keep the green. Flight photos stay off them so they do not paint over the sea. */
  setOcean(blocks: MapTile[]) {
    const next = new Set(blocks.map(mapTileId))
    if (next.size === this.ocean.size && [...next].every((id) => this.ocean.has(id))) return
    this.ocean = next
    for (const cell of this.cells.values()) cell.mask = ''
    this.setCoverage(this.coverage)
  }
  setCoverage(coverage: MapTile[]) {
    this.coverage = coverage
    for (const [key, c] of this.cells) {
      const uncovered = c.data.blocks.filter(
        (b) => !coverage.some((t) => coversTile(t, b.tile)),
      )
      const solid = uncovered.filter((b) => !this.ocean.has(mapTileId(b.tile)))
      const mask = uncovered.map((b) => mapTileId(b.tile)).join('|')
      if (mask === c.mask) continue
      c.mask = mask
      const land = takeQuads(uncovered, c.sea, false)
      c.mesh.geometry.setIndex(new THREE.BufferAttribute(land, 1))
      c.mesh.geometry.computeBoundingSphere()
      c.mesh.visible = land.length > 0
      this.layWater(c, takeQuads(uncovered, c.sea, true))
      c.physics = {
        ...c.physics,
        id: 'relief:' + key + ':' + mask + ':' + c.sea.size,
        chunks: planetCollisionChunks([
          {
            name: 'Relief',
            position: c.data.position,
            normal: c.data.normal,
            index: takeQuads(solid, c.sea, false),
            tint: '#304d25',
            side: 0,
            metadata: { category: 'Terrain' },
          },
        ]),
      }
    }
  }
  dispose() {
    this.worker.terminate()
    for (const c of this.cells.values()) {
      c.mesh.geometry.dispose()
      c.texture?.dispose()
      this.dropWater(c.water)
      for (const mesh of c.fine) this.dropFine(mesh)
      ;(c.mesh.material as THREE.Material).dispose()
    }
    this.cells.clear()
    this.root.removeFromParent()
  }
}
