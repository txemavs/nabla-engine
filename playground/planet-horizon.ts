import * as THREE from 'three'
import { coversTile, type HorizonGeometry } from '../src/planet-horizon.js'
import { geoToLocal, localFrame, type GeoPoint } from '../src/geography.js'
import { mapTileAt, mapTileId, mapTileSample, type MapTile } from '../src/map-tiles.js'
import type { PlanetCollisionTile } from '../src/planet-collisions.js'
import { matteGroundMaterial } from './ground-material.js'
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
      fine: THREE.Mesh[]
    }
  >()
  private wanted: MapTile[] = []
  private pending = new Set<string>()
  private retry = new Map<string, number>()
  private coverage: MapTile[] = []
  private span = 2
  private focus: MapTile | null = null
  private focusKey = ''
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
    new THREE.TextureLoader().setCrossOrigin('anonymous').load(photo, (texture) => {
      const cell = this.cells.get(key)
      if (!cell) {
        texture.dispose()
        return
      }
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 4
      material.color.set('#ffffff')
      material.map = texture
      material.needsUpdate = true
      cell.texture = texture
      this.changed()
    })
    mesh.position.fromArray(position)
    mesh.quaternion.fromArray(rotation)
    mesh.name = 'Distant planetary relief'
    mesh.userData.horizon = true
    this.cells.set(key, {
      mesh,
      data,
      physics: { id: 'relief:' + key, pose: { position, rotation }, chunks: [] },
      mask: 'uninitialized',
      fine: [],
    })
    this.root.add(mesh)
    this.setCoverage(this.coverage)
    this.dress(this.cells.get(key)!)
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
  private dress(
    cell: {
      mesh: THREE.Mesh
      data: HorizonGeometry
      fine: THREE.Mesh[]
    },
  ) {
    for (const mesh of cell.fine) this.dropFine(mesh)
    cell.fine = []
    const focus = this.focus
    if (!focus) return
    const groups = new Map<string, { tile: MapTile; index: number[] }>()
    const span = 2 ** 15
    for (const block of cell.data.blocks) {
      const dx = Math.abs(block.tile.x - focus.x)
      const dy = Math.abs(block.tile.y - focus.y)
      const near = Math.max(Math.min(dx, span - dx), Math.min(dy, span - dy))
      const zoom = near <= 2 ? 15 : near <= 6 ? 14 : 0
      if (!zoom) continue
      const tile =
        zoom === 15
          ? block.tile
          : { z: 14, x: Math.floor(block.tile.x / 2), y: Math.floor(block.tile.y / 2) }
      const id = mapTileId(tile)
      const group = groups.get(id) ?? { tile, index: [] }
      group.index.push(...block.index)
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
      const photo = `${this.photos.replace(/\/$/, '')}/${group.tile.z}/${group.tile.x}/${group.tile.y}.jpg`
      new THREE.TextureLoader().setCrossOrigin('anonymous').load(photo, (texture) => {
        if (!cell.fine.includes(mesh)) {
          texture.dispose()
          return
        }
        texture.colorSpace = THREE.SRGBColorSpace
        texture.anisotropy = 8
        material.map = texture
        material.needsUpdate = true
        mesh.visible = true
        this.changed()
      })
      cell.mesh.parent?.add(mesh)
      cell.fine.push(mesh)
    }
  }
  setCoverage(coverage: MapTile[]) {
    this.coverage = coverage
    for (const [key, c] of this.cells) {
      const active = c.data.blocks.filter((b) => !coverage.some((t) => coversTile(t, b.tile)))
      const mask = active.map((b) => mapTileId(b.tile)).join('|')
      if (mask === c.mask) continue
      c.mask = mask
      c.mesh.visible = active.length > 0
      c.mesh.geometry.setIndex(
        new THREE.BufferAttribute(new Uint32Array(active.flatMap((b) => Array.from(b.index))), 1),
      )
      c.mesh.geometry.computeBoundingSphere()
      c.physics = {
        ...c.physics,
        id: 'relief:' + key + ':' + mask,
        chunks: active.flatMap((b) => b.chunks),
      }
    }
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
