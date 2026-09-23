import { isMapBuilding } from '../src/scene.js'
import { terrainHeight } from '../src/terrain.js'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  mapTileAt,
  mapTileId,
  planMapZooms,
  readyMapCover,
  type MapTile,
} from '../src/map-tiles.js'
import { mapTileEntities } from '../src/world-stream.js'
import type { GeoPoint } from '../src/geography.js'
import type { SceneDocument, Vec3Tuple } from '../src/scene.js'
import { restoreTileLayers } from './tile-asset.js'
export type CoverageRect = { west: number; east: number; north: number; south: number }
interface Tile extends MapTile {
  id: string
  projectedCenter: [number, number]
  files: Record<string, { path: string; bytes: number; sha256: string }>
}
const rad = Math.PI / 180,
  mercator = 6378137,
  earth = 6371000

/** Shared render mask: replace only complete available regions, never collision geometry. */
export class XyzCoverage {
  readonly rects = { value: Array.from({ length: 32 }, () => new THREE.Vector4()) }
  readonly count = { value: 0 }
  readonly origin = { value: new THREE.Vector3() }
  set(rectangles: CoverageRect[]) {
    this.count.value = Math.min(32, rectangles.length)
    rectangles
      .slice(0, 32)
      .forEach((r, i) => this.rects.value[i].set(r.west, r.north, r.east, r.south))
  }
  apply(material: THREE.Material, keepInside: boolean) {
    const previous = material.onBeforeCompile,
      key = material.customProgramCacheKey.bind(material)
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer)
      shader.uniforms.xyzRects = this.rects
      shader.uniforms.xyzCount = this.count
      shader.uniforms.xyzOrigin = this.origin
      shader.vertexShader =
        'varying vec2 xyzPosition; uniform vec3 xyzOrigin;\n' +
        shader.vertexShader.replace(
          '#include <project_vertex>',
          '#include <project_vertex>\nxyzPosition=(modelMatrix*vec4(transformed,1.0)).xz+xyzOrigin.xz;',
        )
      shader.fragmentShader =
        'varying vec2 xyzPosition; uniform vec4 xyzRects[32]; uniform int xyzCount;\n' +
        shader.fragmentShader.replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
    bool inXyz=false;
    for(int i=0;i<32;i++){if(i>=xyzCount)break;vec4 r=xyzRects[i];if(xyzPosition.x>=r.x&&xyzPosition.x<r.z&&xyzPosition.y>=r.y&&xyzPosition.y<r.w)inXyz=true;}
    if(${keepInside ? '!inXyz' : 'inXyz'})discard;`,
        )
    }
    material.customProgramCacheKey = () => key() + `/xyz-coverage-${keepInside}`
    material.needsUpdate = true
  }
}
function dispose(group: THREE.Group) {
  group.removeFromParent()
  group.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (mesh.isMesh) {
      mesh.geometry.dispose()
      mesh.customDepthMaterial?.dispose()
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose()
    }
  })
}

export class XyzWorld {
  readonly root = new THREE.Group()
  readonly coverage = new XyzCoverage()
  readonly omitted = new Set<string>()
  status = 'Buscando GLB XYZ…'
  zooms = ''
  private tiles = new Map<string, Tile>()
  private sourceBounds: CoverageRect[] = []
  private loaded = new Map<string, THREE.Group>()
  private pending = new Set<string>()
  private retry = new Map<string, number>()
  private controller = new AbortController()
  private plan?: ReturnType<typeof planMapZooms>
  private nextPlan = 0
  private current: string[] = []
  private coverageKey = ''
  private document?: SceneDocument
  private active = false
  private bytes = 0
  constructor(
    private origin: GeoPoint,
    private changed: () => void,
    private base = '/experiments/xyz-flight/',
    private setupMaterial?: (material: THREE.Material) => void,
  ) {
    void fetch(base + 'catalog.json', { signal: this.controller.signal, cache: 'no-cache' })
      .then(async (response) => {
        if (!response.ok) throw Error(`HTTP ${response.status}`)
        const data = await response.json()
        if (
          data.format !== 'nabla-xyz-pilot-v1' ||
          !Array.isArray(data.tiles) ||
          data.tiles.length > 512 ||
          !Array.isArray(data.sourceBounds) ||
          data.sourceBounds.length > 32
        )
          throw Error('Invalid XYZ catalog')
        for (const t of data.tiles as Tile[]) {
          if (mapTileId(t) !== t.id) throw Error('Invalid XYZ ID')
          this.tiles.set(t.id, t)
        }
        this.sourceBounds = data.sourceBounds
        this.status = 'GLB XYZ disponibles · cobertura parcial'
        this.changed()
      })
      .catch(() => {
        if (!this.controller.signal.aborted) {
          this.status = 'Mapa actual · sin GLB XYZ disponibles'
          this.changed()
        }
      })
  }
  private local(x: number, z: number): [number, number] {
    return [
      (x / mercator / rad - this.origin.longitude) *
        rad *
        earth *
        Math.cos(this.origin.latitude * rad),
      (this.origin.latitude - Math.atan(Math.sinh(-z / mercator)) / rad) * rad * earth,
    ]
  }
  private localBounds(b: CoverageRect): CoverageRect {
    const [west, north] = this.local(b.west, b.north),
      [east, south] = this.local(b.east, b.south)
    return { west, east, north, south }
  }
  private async load(t: Tile) {
    this.pending.add(t.id)
    const group = new THREE.Group()
    try {
      const manager = new THREE.LoadingManager()
      manager.setURLModifier(() => {
        throw Error('XYZ GLBs must be self-contained')
      })
      const loader = new GLTFLoader(manager)
      for (const name of ['terrain', 'buildings-osm']) {
        const file = t.files[name]
        if (
          !file ||
          !new RegExp(`^z/${t.z}/${t.x}/${t.y}/${name}-[a-f0-9]{16}\\.glb$`).test(file.path) ||
          file.bytes > 48 * 1024 * 1024
        )
          throw Error('Invalid XYZ layer')
        const response = await fetch(this.base + file.path, {
          signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(30000)]),
        })
        if (!response.ok) throw Error('Missing XYZ layer')
        const bytes = await response.arrayBuffer()
        if (bytes.byteLength !== file.bytes) throw Error('XYZ size mismatch')
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
          .map((n) => n.toString(16).padStart(2, '0'))
          .join('')
        if (hash !== file.sha256) throw Error('XYZ hash mismatch')
        const gltf = await loader.parseAsync(bytes, '')
        gltf.scene.name = name
        group.add(gltf.scene)
        restoreTileLayers(gltf.scene)
        gltf.scene.traverse((node) => {
          const mesh = node as THREE.Mesh
          if (!mesh.isMesh) return
          mesh.receiveShadow = true
          mesh.castShadow = name === 'buildings-osm'
          if (mesh.castShadow) {
            mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
              depthPacking: THREE.RGBADepthPacking,
            })
            this.coverage.apply(mesh.customDepthMaterial, true)
          }
          const p = mesh.geometry.getAttribute('position')
          for (let i = 0; i < p.count; i++) {
            const [x, z] = this.local(
              p.getX(i) + t.projectedCenter[0],
              p.getZ(i) + t.projectedCenter[1],
            )
            p.setXYZ(i, x, p.getY(i) - this.origin.altitude, z)
          }
          p.needsUpdate = true
          mesh.geometry.computeBoundingSphere()
          for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            this.coverage.apply(m, true)
            this.setupMaterial?.(m)
          }
        })
      }
      if (this.controller.signal.aborted) {
        dispose(group)
        return
      }
      group.visible = false
      this.loaded.set(t.id, group)
      this.root.add(group)
      this.bytes += Object.values(t.files).reduce((n, f) => n + f.bytes, 0)
      this.changed()
    } catch {
      dispose(group)
      this.retry.set(t.id, performance.now() + 60000)
    } finally {
      this.pending.delete(t.id)
    }
  }
  update(
    position: Vec3Tuple,
    heightAboveGround: number,
    distance: number,
    document: SceneDocument,
    playing: boolean,
    buildings: boolean,
    renderOrigin: THREE.Vector3,
  ) {
    this.root.position.copy(renderOrigin).negate()
    this.coverage.origin.value.copy(renderOrigin)
    this.root.visible = playing
    if (!playing) {
      this.coverage.set([])
      this.omitted.clear()
      this.zooms = ''
      this.active = false
      return
    }
    if (!this.tiles.size) return
    const now = performance.now()
    if (now < this.nextPlan && this.document === document && this.active) {
      for (const group of this.loaded.values()) {
        const b = group.getObjectByName('buildings-osm')
        if (b) b.visible = buildings
      }
      return
    }
    this.nextPlan = now + 500
    this.active = true
    const latitude = this.origin.latitude - position[2] / earth / rad,
      longitude =
        this.origin.longitude + position[0] / (earth * Math.cos(this.origin.latitude * rad)) / rad
    if (Math.abs(latitude) > 85) {
      this.root.visible = false
      this.coverage.set([])
      this.omitted.clear()
      return
    }
    const ground = document.entities.find(
      (e) =>
        e.terrain &&
        e.id.startsWith('world-terrain') &&
        Math.abs(position[0] - e.transform.position[0]) <=
          ((e.terrain.columns - 1) * e.terrain.spacing) / 2 &&
        Math.abs(position[2] - e.transform.position[2]) <=
          ((e.terrain.rows - 1) * e.terrain.spacing) / 2,
    )
    if (ground?.terrain)
      heightAboveGround =
        position[1] -
        ground.transform.position[1] -
        terrainHeight(
          ground.terrain,
          position[0] - ground.transform.position[0],
          position[2] - ground.transform.position[2],
        )
    this.plan = planMapZooms({
      latitude,
      longitude,
      heightAboveGround: Math.max(0, heightAboveGround),
      viewDistance: Math.max(1000, distance),
      maxTiles: 64,
    })
    const ready = new Set([
      ...this.loaded.keys(),
      ...this.plan.requests.filter((t) => !this.tiles.has(mapTileId(t))).map(mapTileId),
    ])
    const complete = this.plan.roots.every(
      (root) => readyMapCover({ ...this.plan!, roots: [root] }, ready).length > 0,
    )
    if (complete)
      this.current = readyMapCover(this.plan, ready)
        .map(mapTileId)
        .filter((id) => this.loaded.has(id))
    const visible = new Set(this.current),
      wanted = new Set(this.plan.requests.map(mapTileId))
    for (const [id, group] of this.loaded) {
      group.visible = visible.has(id)
      const b = group.getObjectByName('buildings-osm')
      if (b) b.visible = buildings
      if (!wanted.has(id) && !visible.has(id)) {
        dispose(group)
        this.loaded.delete(id)
        this.bytes -= Object.values(this.tiles.get(id)!.files).reduce((n, f) => n + f.bytes, 0)
      }
    }
    for (const tile of this.plan.requests) {
      if (this.pending.size >= 1 || this.bytes > 160 * 1024 * 1024) break
      const id = mapTileId(tile),
        t = this.tiles.get(id)
      if (t && !this.loaded.has(id) && !this.pending.has(id) && (this.retry.get(id) ?? 0) < now)
        void this.load(t)
    }
    const key = this.current.join(',')
    if (key !== this.coverageKey || this.document !== document || this.coverage.count.value === 0) {
      this.coverageKey = key
      this.document = document
      this.omitted.clear()
      const rectangles: CoverageRect[] = []
      for (const bounds of this.sourceBounds) {
        const nw = mapTileAt(
            Math.atan(Math.sinh(-bounds.north / mercator)) / rad,
            bounds.west / mercator / rad,
            15,
          ),
          se = mapTileAt(
            Math.atan(Math.sinh(-bounds.south / mercator)) / rad,
            bounds.east / mercator / rad,
            15,
          )
        let covered = true
        for (let x = nw.x; x <= se.x; x++)
          for (let y = nw.y; y <= se.y; y++)
            if (
              !this.current.some((id) => {
                const t = this.tiles.get(id)!
                return (
                  Math.floor(x / 2 ** (15 - t.z)) === t.x && Math.floor(y / 2 ** (15 - t.z)) === t.y
                )
              })
            )
              covered = false
        if (!covered) continue
        const local = this.localBounds(bounds),
          cx = (local.west + local.east) / 2,
          cz = (local.north + local.south) / 2
        const terrain = document.entities.find(
          (e) =>
            e.terrain &&
            e.id.startsWith('world-terrain') &&
            Math.abs(e.transform.position[0] - cx) < 1 &&
            Math.abs(e.transform.position[2] - cz) < 1,
        )
        if (terrain) {
          const key =
              terrain.id === 'world-terrain' ? '0_0' : terrain.id.slice('world-terrain-'.length),
            entities = mapTileEntities(document, key)
          if (entities.some((e) => e.mapEditable)) continue
          for (const e of entities)
            if (e.terrain || e.road || e.railway || e.landcover || isMapBuilding(e))
              this.omitted.add(e.id)
        } else if (
          document.entities.some(
            (e) =>
              e.terrain &&
              Math.abs(e.transform.position[0] - cx) < 1200 &&
              Math.abs(e.transform.position[2] - cz) < 1200,
          )
        )
          continue
        rectangles.push(local)
      }
      this.coverage.set(rectangles)
    }
    this.zooms = [...new Set(this.current.map((id) => this.tiles.get(id)!.z))].sort().join(',')
    this.status = this.coverage.count.value
      ? `GLB XYZ · z/${this.zooms.replaceAll(',', ', z/')} · ${this.current.length} baldosas`
      : 'Mapa actual · preparando GLB XYZ disponibles'
  }
  dispose() {
    this.controller.abort()
    for (const g of this.loaded.values()) dispose(g)
    this.loaded.clear()
    this.root.removeFromParent()
  }
}
