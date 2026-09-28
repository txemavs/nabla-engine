import * as THREE from 'three'
import {
  coversTile,
  planetCollisionChunks,
  type HorizonGeometry,
  type PlanetCollisionTile,
} from '../../planet/index.js'
import { geoToLocal, localFrame, type GeoPoint } from '../../math/geo/sphere.js'
import { mapTileAt, mapTileId, mapTileSample, type MapTile } from '../../scene/mercator.js'
import { matteGroundMaterial } from './ground-material.js'

async function fetchJpeg(url: string) {
  const response = await fetch(url).catch(() => undefined)
  if (!response?.ok) return
  const bitmap = await createImageBitmap(await response.blob())
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return
  }
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function blockIndices(blocks: { index: Uint32Array }[]) {
  const values: number[] = []
  for (const block of blocks)
    for (let i = 0; i < block.index.length; i++) values.push(block.index[i])
  return new Uint32Array(values)
}
/** Independent elevation-only coverage: no OSM jobs or old metric grid required. */
export class PlanetHorizon {
  readonly root = new THREE.Group()
  private worker = new Worker(new URL('./horizon.worker.ts', import.meta.url), {
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
      fine: THREE.Mesh[]
      photoSig?: string
    }
  >()
  private wanted: MapTile[] = []
  private pending = new Set<string>()
  private retry = new Map<string, number>()
  private coverage: MapTile[] = []
  private ocean = new Set<string>()
  private span = 2
  private wantedKey = ''
  private coverageKey = ''
  private focus: MapTile | null = null
  private focusKey = ''
  private layers = { relief: true, photo14: true, photo12: true }
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
    const center = mapTileAt(latitude, longitude, 13)
    const stamp = `${this.span}:${center.x}:${center.y}`
    if (stamp === this.wantedKey) {
      this.pump()
      return
    }
    this.wantedKey = stamp
    const n = 2 ** 13
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
    const photo = `${this.photos.replace(/\/$/, '')}/z/${data.tile.z}/${data.tile.x}/${data.tile.y}.jpg`
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
      fine: [],
    })
    this.root.add(mesh)
    this.setCoverage(this.coverage)
  }
  private async wear(key: string, photo: string, material: THREE.MeshPhysicalMaterial) {
    const loaded = await fetchJpeg(photo)
    const cell = this.cells.get(key)
    if (!loaded || !cell) {
      loaded?.dispose()
      return
    }
    loaded.colorSpace = THREE.SRGBColorSpace
    loaded.anisotropy = 4
    material.color.set('#ffffff')
    material.map = loaded
    material.needsUpdate = true
    cell.texture = loaded
    cell.textured = true
    cell.mask = ''
    this.setCoverage(this.coverage)
    this.changed()
  }
  setFocus(tile: MapTile | null) {
    const key = tile ? mapTileId(tile) : ''
    if (key === this.focusKey) return
    this.focus = tile
    this.focusKey = key
    for (const cell of this.cells.values()) this.dress(cell)
  }
  private dropFine(mesh: THREE.Mesh) {
    mesh.removeFromParent()
    mesh.geometry.dispose()
    const material = mesh.material as THREE.MeshPhysicalMaterial
    material.map?.dispose()
    material.dispose()
  }
  /** z14 close to the camera, z13 past that, z12 at the far edge. The z13 sheet is the cell photo. */
  private photoZoom(block: MapTile) {
    const focus = this.focus
    if (!focus) return 13
    const span = 2 ** 15
    const dx = Math.abs(block.x - focus.x)
    const dy = Math.abs(block.y - focus.y)
    const near = Math.max(Math.min(dx, span - dx), Math.min(dy, span - dy))
    if (near <= 4) return 14
    if (near <= 16) return 13
    return 12
  }
  private dress(cell: {
    mesh: THREE.Mesh
    data: HorizonGeometry
    mask: string
    fine: THREE.Mesh[]
    photoSig?: string
  }) {
    if (!this.focus) return
    const groups = new Map<string, { tile: MapTile; index: number[] }>()
    for (const block of cell.data.blocks) {
      if (
        !block.index.length ||
        this.ocean.has(mapTileId(block.tile)) ||
        this.coverage.some((tile) => coversTile(tile, block.tile))
      )
        continue
      const zoom = this.photoZoom(block.tile)
      if (zoom === 13) continue
      const shift = block.tile.z - zoom
      const tile = {
        z: zoom,
        x: Math.floor(block.tile.x / 2 ** shift),
        y: Math.floor(block.tile.y / 2 ** shift),
      }
      const id = mapTileId(tile)
      const group = groups.get(id) ?? { tile, index: [] }
      group.index.push(...block.index)
      groups.set(id, group)
    }
    const sig = [...groups]
      .map(([id, group]) => id + ':' + group.index.length)
      .sort()
      .join('|')
    if (sig === cell.photoSig) return
    cell.photoSig = sig
    for (const mesh of cell.fine) this.dropFine(mesh)
    cell.fine = []
    const parent = cell.data.tile
    for (const group of groups.values()) {
      const uv = new Float32Array(cell.data.uv.length)
      if (group.tile.z < parent.z) {
        const dx = parent.x % 2
        const dy = parent.y % 2
        for (let row = 0; row <= 32; row++)
          for (let col = 0; col <= 32; col++) {
            const i = (row * 33 + col) * 2
            uv[i] = (dx + col / 32) / 2
            uv[i + 1] = 1 - (dy + row / 32) / 2
          }
      } else {
        const scale = 2 ** (group.tile.z - parent.z)
        const originCol = (group.tile.x - parent.x * scale) * (32 / scale)
        const originRow = (group.tile.y - parent.y * scale) * (32 / scale)
        const step = 32 / scale
        for (let row = 0; row <= 32; row++)
          for (let col = 0; col <= 32; col++) {
            const i = (row * 33 + col) * 2
            uv[i] = (col - originCol) / step
            uv[i + 1] = 1 - (row - originRow) / step
          }
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
      const photo = `${this.photos.replace(/\/$/, '')}/z/${group.tile.z}/${group.tile.x}/${group.tile.y}.jpg`
      void this.wearFlight(cell, mesh, material, photo)
      cell.mesh.parent?.add(mesh)
      cell.fine.push(mesh)
    }
  }
  /** A z14 or z12 flight photo covers the green relief. The z13 sheet is the cell texture. */
  private async wearFlight(
    cell: { fine: THREE.Mesh[] },
    mesh: THREE.Mesh,
    material: THREE.MeshPhysicalMaterial,
    photo: string,
  ) {
    const loaded = await fetchJpeg(photo)
    if (!cell.fine.includes(mesh)) {
      loaded?.dispose()
      return
    }
    if (!loaded) return
    loaded.colorSpace = THREE.SRGBColorSpace
    loaded.anisotropy = 8
    material.map = loaded
    material.needsUpdate = true
    mesh.userData.ready = true
    mesh.visible = this.photoVisible(mesh)
    this.changed()
  }
  /** When every block still open is ocean, the sea mesh already covers it and this z13 goes. */
  setOcean(blocks: MapTile[]) {
    const next = new Set(blocks.map(mapTileId))
    if (next.size === this.ocean.size && [...next].every((id) => this.ocean.has(id))) return
    this.ocean = next
    this.coverageKey = ''
    for (const cell of this.cells.values()) cell.mask = ''
    this.setCoverage(this.coverage)
  }
  setCoverage(coverage: MapTile[]) {
    const key = coverage.map(mapTileId).sort().join('|')
    if (key === this.coverageKey) return
    this.coverageKey = key
    this.coverage = coverage
    for (const [key, c] of this.cells) {
      const uncovered = c.data.blocks.filter((b) => !coverage.some((t) => coversTile(t, b.tile)))
      const solid = uncovered.filter((b) => !this.ocean.has(mapTileId(b.tile)))
      const finished = solid.length === 0
      const mask = (finished ? 'sea:' : '') + uncovered.map((b) => mapTileId(b.tile)).join('|')
      if (mask === c.mask) continue
      c.mask = mask
      const land = finished ? new Uint32Array(0) : blockIndices(uncovered)
      c.mesh.geometry.setIndex(new THREE.BufferAttribute(land, 1))
      c.mesh.geometry.computeBoundingSphere()
      c.mesh.userData.land = land.length > 0
      c.mesh.visible = c.mesh.userData.land && this.layers.relief
      c.physics = {
        ...c.physics,
        id: 'relief:' + key + ':' + mask,
        chunks: planetCollisionChunks([
          {
            name: 'Relief',
            position: c.data.position,
            normal: c.data.normal,
            index: blockIndices(solid),
            tint: '#304d25',
            side: 0,
            metadata: { category: 'Terrain' },
          },
        ]),
      }
      this.dress(c)
    }
  }
  applyViewLayers(layers: { relief: boolean; photo14: boolean; photo12: boolean }) {
    this.layers = layers
    for (const cell of this.cells.values()) {
      cell.mesh.visible = !!cell.mesh.userData.land && layers.relief
      for (const mesh of cell.fine) mesh.visible = !!mesh.userData.ready && this.photoVisible(mesh)
    }
  }
  private photoVisible(mesh: THREE.Mesh) {
    const zoom = mesh.userData.zoom
    if (zoom === 14) return this.layers.photo14
    if (zoom === 12) return this.layers.photo12
    return this.layers.relief
  }
  dispose() {
    this.worker.terminate()
    for (const c of this.cells.values()) {
      c.mesh.geometry.dispose()
      c.texture?.dispose()
      for (const mesh of c.fine) this.dropFine(mesh)
      ;(c.mesh.material as THREE.Material).dispose()
    }
    this.cells.clear()
    this.root.removeFromParent()
  }
}
