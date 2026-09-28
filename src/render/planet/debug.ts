/** Optional streaming overlay. Never changes visibility, materials or physical coverage. */
import * as T from 'three'
import { geoToLocal, type GeoPoint } from '../../math/geo/sphere.js'
import { mapTileId, mapTileSample, type MapTile } from '../../scene/mercator.js'
export type TileState = 'planned' | 'downloading' | 'installing' | 'resident' | 'visible' | 'retry'
export interface TileDiagnostic {
  tile: MapTile
  state: TileState
  kind: 'mesh' | 'relief' | 'photo'
}
export interface StreamDiagnostics {
  tiles: TileDiagnostic[]
  residentBytes: number
  budgetBytes: number
  pending: number
  installMs: number
  maxInstallMs: number
  distance: number
}
export type TileDebugMode = 'off' | 'zoom' | 'state' | 'wire'
const zoomColors: Record<number, number> = {
  12: 0xa78bfa,
  13: 0x38bdf8,
  14: 0x4ade80,
  15: 0xfb923c,
}
const stateColors: Record<TileState, number> = {
  planned: 0x64748b,
  downloading: 0xfacc15,
  installing: 0xc084fc,
  resident: 0x38bdf8,
  visible: 0x4ade80,
  retry: 0xf87171,
}
export class TileDebugView {
  readonly root = new T.Group()
  private signature = ''
  constructor(private readonly origin: GeoPoint) {
    this.root.name = 'Tile diagnostics'
  }
  update(data: StreamDiagnostics, mode: TileDebugMode, labels: boolean, center: T.Vector3): void {
    this.root.visible = mode !== 'off'
    if (mode === 'off') {
      if (this.signature) this.clear()
      return
    }
    const tiles = [...new Map(data.tiles.map((t) => [mapTileId(t.tile) + t.kind, t])).values()]
    const key =
      mode +
      labels +
      data.distance +
      tiles.map((t) => mapTileId(t.tile) + t.state + t.kind).join('|') +
      center
        .toArray()
        .map((n) => Math.round(n / 50))
        .join(':')
    if (key === this.signature) return
    this.clear()
    this.signature = key
    tiles.sort((a, b) => a.tile.z - b.tile.z)
    const labelIds = new Set(
      [...tiles]
        .sort((a, b) => {
          const pa = new T.Vector3(...geoToLocal(this.origin, mapTileSample(a.tile, 1, 1, 2)))
          const pb = new T.Vector3(...geoToLocal(this.origin, mapTileSample(b.tile, 1, 1, 2)))
          return pa.distanceToSquared(center) - pb.distanceToSquared(center)
        })
        .slice(0, 48)
        .map((t) => mapTileId(t.tile) + t.kind),
    )
    let labelCount = 0
    for (const { tile, state, kind } of tiles) {
      const corners = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ].map(([x, y]) => geoToLocal(this.origin, { ...mapTileSample(tile, x, y, 1), altitude: 25 }))
      const geometry = new T.BufferGeometry()
      geometry.setAttribute('position', new T.Float32BufferAttribute(corners.flat(), 3))
      geometry.setIndex([0, 2, 1, 0, 3, 2])
      const color = mode === 'state' ? stateColors[state] : (zoomColors[tile.z] ?? 0xa78bfa)
      if (mode !== 'wire') {
        const plane = new T.Mesh(
          geometry,
          new T.MeshBasicMaterial({
            color,
            side: T.DoubleSide,
            transparent: true,
            opacity: kind === 'photo' ? 0.48 : 0.9,
            depthTest: false,
            depthWrite: false,
          }),
        )
        plane.renderOrder = 2000 + tile.z
        this.root.add(plane)
      } else geometry.dispose()
      const edge = new T.BufferGeometry().setFromPoints(
        [...corners, corners[0]].map((p) => new T.Vector3(...p)),
      )
      const lines = new T.Line(
        edge,
        new T.LineBasicMaterial({
          color: state === 'visible' ? 0xffffff : color,
          depthTest: false,
          depthWrite: false,
        }),
      )
      lines.renderOrder = 2020 + tile.z
      this.root.add(lines)
      if (!labels || labelCount >= 48 || !labelIds.has(mapTileId(tile) + kind)) continue
      labelCount++
      const canvas = document.createElement('canvas')
      canvas.width = 384
      canvas.height = 80
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#0b1229'
      ctx.fillRect(0, 0, 384, 80)
      ctx.fillStyle = '#ffffff'
      ctx.font = '23px monospace'
      ctx.fillText(`Z${tile.z} / ${tile.x} / ${tile.y}`, 10, 30)
      ctx.font = '18px monospace'
      ctx.fillText(`${kind} · ${state}`, 10, 59)
      const material = new T.SpriteMaterial({
        map: new T.CanvasTexture(canvas),
        depthTest: false,
        depthWrite: false,
      })
      const sprite = new T.Sprite(material)
      sprite.position.fromArray(
        geoToLocal(this.origin, { ...mapTileSample(tile, 1, 1, 2), altitude: 40 }),
      )
      const width = new T.Vector3(...corners[0]).distanceTo(new T.Vector3(...corners[1]))
      sprite.scale.set(width * 0.6, width * 0.125, 1)
      sprite.renderOrder = 2100 + tile.z
      this.root.add(sprite)
    }
    const points = Array.from(
      { length: 129 },
      (_, i) =>
        new T.Vector3(
          center.x + Math.cos((i * Math.PI) / 64) * data.distance,
          center.y + 10,
          center.z + Math.sin((i * Math.PI) / 64) * data.distance,
        ),
    )
    const ring = new T.Line(
      new T.BufferGeometry().setFromPoints(points),
      new T.LineBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false }),
    )
    ring.renderOrder = 2200
    this.root.add(ring)
  }
  private clear(): void {
    this.root.traverse((node) => {
      const object = node as T.Mesh
      object.geometry?.dispose()
      const material = object.material as T.MeshBasicMaterial | undefined
      if (material) {
        material.map?.dispose()
        material.dispose()
      }
    })
    this.root.clear()
    this.signature = ''
  }
  dispose(): void {
    this.clear()
    this.root.removeFromParent()
  }
}
