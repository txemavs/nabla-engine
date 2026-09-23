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
    { mesh: THREE.Mesh; data: HorizonGeometry; physics: PlanetCollisionTile; mask: string }
  >()
  private wanted: MapTile[] = []
  private pending = new Set<string>()
  private retry = new Map<string, number>()
  private coverage: MapTile[] = []
  private material = matteGroundMaterial({ color: '#304d25' })
  constructor(
    private origin: GeoPoint,
    private changed: () => void,
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
  update(latitude: number, longitude: number, distance: number) {
    const center = mapTileAt(latitude, longitude, 13),
      n = 2 ** 13
    const width = (40075016 * Math.cos((latitude * Math.PI) / 180)) / n
    const radius = Math.max(1, Math.min(2, Math.ceil(distance / width)))
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
        this.cells.delete(key)
      }
    for (const key of this.retry.keys()) if (!keep.has(key)) this.retry.delete(key)
    this.pump()
  }
  private pump() {
    for (const tile of this.wanted) {
      if (this.pending.size >= 2) return
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
    const mesh = new THREE.Mesh(geometry, this.material)
    mesh.position.fromArray(position)
    mesh.quaternion.fromArray(rotation)
    mesh.name = 'Distant planetary relief'
    mesh.userData.horizon = true
    const key = mapTileId(data.tile)
    this.cells.set(key, {
      mesh,
      data,
      physics: { id: 'relief:' + key, pose: { position, rotation }, chunks: [] },
      mask: 'uninitialized',
    })
    this.root.add(mesh)
    this.setCoverage(this.coverage)
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
    for (const c of this.cells.values()) c.mesh.geometry.dispose()
    this.cells.clear()
    this.material.dispose()
    this.root.removeFromParent()
  }
}
