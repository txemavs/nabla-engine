import { matteGroundMaterial } from './ground-material.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import * as THREE from 'three'
import {
  mapTileAt,
  mapTileId,
  mapTilePath,
  mapTileParent,
  mapTileChildren,
  planMapZooms,
  planetReadyCover,
  type MapTile,
  type MapZoomPlan,
} from '../src/map-tiles.js'
import { geoToLocal, localFrame, localToGeo, type GeoPoint } from '../src/geography.js'
import {
  validatePlanetManifest,
  type PlanetManifest,
  type PlanetPayload,
} from '../src/planet-artifact.js'
import type { PlanetCollisionTile } from '../src/planet-collisions.js'
import type { Simulation } from '../src/simulation.js'
import type { Vec3Tuple } from '../src/scene.js'
import { restoreTileLayers } from './tile-asset.js'
interface Resident {
  group: THREE.Group
  collision: PlanetCollisionTile
  bytes: number
  revision: string
  buildings: boolean
}
/** One planetary stream for editor, rendering and physics. Only tile roots change frame. */
export class PlanetWorld {
  readonly root = new THREE.Group()
  status = 'Preparando baldosas del planeta…'
  get activeTiles() {
    return this.visible.map(
      (key) =>
        this.resident.get(key)!.group.userData.planetTile as {
          key: string
          manifest: PlanetManifest
          directory: string
        },
    )
  }
  private treeTexture: THREE.Texture | undefined
  private worker = new Worker(new URL('./planet-worker.ts', import.meta.url), { type: 'module' })
  private resident = new Map<string, Resident>()
  private requests = new Map<number, { key: string; manifest: PlanetManifest }>()
  private ready = new Map<string, PlanetManifest>()
  private retry = new Map<string, number>()
  private wanted: MapTile[] = []
  private plan?: MapZoomPlan
  private visible: string[] = []
  private serial = 0
  private disposed = false
  private busy = false
  private next = 0
  private distance = 4000
  private originOffset = new THREE.Vector3()
  private controller = new AbortController()
  private protectedPositions: Vec3Tuple[] = []
  private buildings = true
  private access = true
  constructor(
    private origin: GeoPoint,
    private changed: () => void,
    private setupMaterial: (m: THREE.Material) => void,
    private base = import.meta.env.VITE_WORLD_PREPARED_URL || '/prepared',
    private api = import.meta.env.VITE_WORLD_PREPARE_API || '/prepare',
  ) {
    this.worker.onmessage = (
      event: MessageEvent<{ id: number; payload?: PlanetPayload; error?: string }>,
    ) => {
      const request = this.requests.get(event.data.id)
      if (!request) return
      this.requests.delete(event.data.id)
      if (event.data.payload && !this.disposed)
        this.install(request.key, request.manifest, event.data.payload)
      else {
        this.retry.set(request.key, Date.now() + 15000)
        this.status = 'GLB pendiente · ' + (event.data.error ?? 'sin datos')
      }
      this.pump()
      this.changed()
    }
    this.worker.onerror = () => {
      this.status = 'Error en el cargador GLB'
      this.requests.clear()
      this.changed()
    }
  }
  private concurrency = 2
  private ahead = 8
  private memoryBudget = 160 * 1024 * 1024
  setQuality(concurrent: number, ahead: number, retain = false) {
    this.concurrency = Math.max(1, Math.min(3, concurrent))
    this.ahead = Math.min(15, Math.max(0, ahead))
    this.memoryBudget = (retain ? 320 : 160) * 1024 * 1024
  }
  setDistance(distance: number) {
    this.distance = distance
  }
  update(position: Vec3Tuple, velocity: Vec3Tuple, _protected: Vec3Tuple[] = []): void {
    if (this.disposed) return
    this.protectedPositions = _protected
    const gps = localToGeo(this.origin, position)
    const height = Math.max(0, gps.altitude - this.groundAltitude(position))
    this.plan = planMapZooms({
      latitude: gps.latitude,
      longitude: gps.longitude,
      heightAboveGround: height,
      viewDistance: this.distance,
      maxTiles: 48,
    })
    const close = mapTileAt(gps.latitude, gps.longitude, 15)
    const priority = height < 1500 ? [close, ...mapTileChildren(mapTileParent(close)!)] : []
    const ahead = localToGeo(this.origin, [
      position[0] + velocity[0] * this.ahead,
      position[1],
      position[2] + velocity[2] * this.ahead,
    ])
    const future = mapTileAt(ahead.latitude, ahead.longitude, height < 1500 ? 15 : 13)
    const protectedTiles = _protected
      .map((p) => localToGeo(this.origin, p))
      .filter((p) => p.altitude < 12000)
      .map((p) => mapTileAt(p.latitude, p.longitude, 15))
    this.wanted = [
      ...new Map(
        [...priority, ...this.plan.requests, future, ...protectedTiles].map((t) => [
          mapTileId(t),
          t,
        ]),
      ).values(),
    ]
    const needed = new Set(this.wanted.map(mapTileId))
    for (const [id, r] of this.requests)
      if (!needed.has(r.key)) {
        this.worker.postMessage({ id, cancel: true })
        this.requests.delete(id)
      }
    for (const key of this.ready.keys())
      if (!needed.has(key) && !this.resident.has(key)) this.ready.delete(key)
    for (const key of this.retry.keys()) if (!needed.has(key)) this.retry.delete(key)
    this.cover()
    void this.discover()
    this.pump()
  }
  private async discover() {
    if (this.busy || Date.now() < this.next || this.disposed) return
    const missing = this.wanted.filter(
      (t) => !this.resident.has(mapTileId(t)) && !this.ready.has(mapTileId(t)),
    )
    if (!missing.length) return
    this.busy = true
    this.next = Date.now() + 3000
    try {
      const response = await fetch(this.api + '/tiles', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: missing.slice(0, 24).map(mapTilePath) }),
        signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(15000)]),
      })
      if (!response.ok) throw Error(`HTTP ${response.status}`)
      const data = await response.json()
      this.access = !!data.authorized
      for (const tile of missing.slice(0, 24)) {
        const value = data.available?.[mapTilePath(tile)]
        if (value) this.ready.set(mapTileId(tile), validatePlanetManifest(value, tile))
      }
      this.status = this.access
        ? 'Preparando GLB en el servidor…'
        : 'Esperando GLB preparados · generación privada'
      this.pump()
      this.changed()
    } catch (error) {
      if (!this.disposed) this.status = 'Servidor planetario pendiente · ' + String(error)
    } finally {
      this.busy = false
    }
  }
  private pump() {
    if (this.disposed) return
    for (const tile of this.wanted) {
      if (this.requests.size >= this.concurrency) break
      const key = mapTileId(tile),
        manifest = this.ready.get(key)
      if (
        !manifest ||
        (this.resident.has(key) && (!this.buildings || this.resident.get(key)!.buildings)) ||
        [...this.requests.values()].some((r) => r.key === key) ||
        Date.now() < (this.retry.get(key) ?? 0)
      )
        continue
      const id = ++this.serial
      this.requests.set(id, { key, manifest })
      this.worker.postMessage({
        id,
        manifest,
        buildings: this.buildings,
        directory: this.base.replace(/\/$/, '') + '/' + mapTilePath(tile) + '/',
      })
    }
  }
  private install(key: string, manifest: PlanetManifest, payload: PlanetPayload) {
    const group = new THREE.Group()
    const position = geoToLocal(this.origin, manifest.anchor)
    const rotation = localFrame(this.origin)
      .invert()
      .multiply(localFrame(manifest.anchor))
      .toArray()
    group.position.fromArray(position)
    group.quaternion.fromArray(rotation)
    for (const data of payload.meshes) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(data.position, 3))
      geometry.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3))
      if (data.color) geometry.setAttribute('color', new THREE.BufferAttribute(data.color, 3))
      if (data.index) geometry.setIndex(new THREE.BufferAttribute(data.index, 1))
      geometry.computeBoundingSphere()
      const makeMaterial =
        data.metadata.category === 'Buildings'
          ? (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p)
          : matteGroundMaterial
      const material = makeMaterial({
        color: data.tint,
        vertexColors: !!data.color,
        roughness: 1,
        side: data.side as THREE.Side,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = data.name
      mesh.userData = data.metadata
      mesh.castShadow =
        !data.metadata.skirt && ['Terrain', 'Buildings'].includes(data.metadata.category)
      mesh.receiveShadow = true
      group.add(mesh)
      restoreTileLayers(mesh)
      this.setupMaterial(material)
    }
    group.userData.planetTile = {
      key,
      manifest,
      directory: this.base + '/' + mapTilePath(manifest.tile) + '/',
    }
    if (payload.vegetation.length) {
      this.treeTexture ??= new THREE.TextureLoader().load('/sprites/tree.png', () => this.changed())
      this.treeTexture.colorSpace = THREE.SRGBColorSpace
      const a = new THREE.PlaneGeometry(1, 1),
        b = new THREE.PlaneGeometry(1, 1)
      b.rotateY(Math.PI / 2)
      const geometry = mergeGeometries([a, b])
      a.dispose()
      b.dispose()
      const material = new THREE.MeshStandardMaterial({
        map: this.treeTexture,
        alphaTest: 0.4,
        side: THREE.DoubleSide,
        roughness: 1,
      })
      this.setupMaterial(material)
      const trees = new THREE.InstancedMesh(geometry, material, payload.vegetation.length)
      const matrix = new THREE.Matrix4(),
        q = new THREE.Quaternion()
      payload.vegetation.forEach((v, i) => {
        matrix.compose(
          new THREE.Vector3(v.position[0], v.position[1] + v.size[1] / 2, v.position[2]),
          q,
          new THREE.Vector3(v.size[0], v.size[1], 1),
        )
        trees.setMatrixAt(i, matrix)
      })
      trees.castShadow = true
      trees.receiveShadow = true
      trees.userData.category = 'Trees'
      group.add(trees)
    }
    this.remove(key)
    group.visible = false
    this.root.add(group)
    this.resident.set(key, {
      group,
      collision: {
        id: key + '@' + manifest.files.terrain.sha256,
        pose: { position, rotation },
        chunks: payload.chunks,
      },
      bytes: payload.bytes + payload.chunks.reduce((n, c) => n + c.triangles.byteLength, 0),
      revision: manifest.files.terrain.sha256,
      buildings: payload.buildings,
    })
    this.cover()
    this.changed()
  }
  private cover() {
    if (!this.plan) return
    const cover = planetReadyCover(this.plan, new Set(this.resident.keys())).map(mapTileId)
    this.visible = cover.length ? cover : this.visible
    const active = new Set(this.visible)
    for (const [key, r] of this.resident) {
      r.group.visible = active.has(key)
      for (const child of r.group.children)
        child.visible = this.buildings || child.userData.category !== 'Buildings'
    }
    const wanted = new Set(this.wanted.map(mapTileId))
    let bytes = [...this.resident.values()].reduce((n, r) => n + r.bytes, 0)
    for (const [key, r] of this.resident) {
      if (active.has(key) || wanted.has(key)) continue
      if (bytes < this.memoryBudget && this.resident.size <= 64) break
      this.remove(key)
      bytes -= r.bytes
    }
    this.status = `GLB planetarios · ${this.visible.length} baldosas · z/${[...new Set(this.visible.map((k) => k.split('/')[1]))].join(', ')}${this.requests.size ? ' · cargando…' : ''}`
  }
  renderUpdate(origin: THREE.Vector3, buildings: boolean, sim: Simulation | null) {
    this.originOffset.copy(origin)
    this.root.position.copy(origin).negate()
    if (this.buildings !== buildings) {
      this.buildings = buildings
      this.cover()
      this.pump()
    }
    const physics = new Set(this.visible)
    for (const position of this.protectedPositions) {
      const p = localToGeo(this.origin, position)
      if (p.altitude > 12000) continue
      if (
        [...physics].some((key) => {
          const t = this.ready.get(key)?.tile
          return t && mapTileId(mapTileAt(p.latitude, p.longitude, t.z)) === key
        })
      )
        continue
      for (const z of [15, 14, 13]) {
        const key = mapTileId(mapTileAt(p.latitude, p.longitude, z))
        if (this.resident.has(key)) {
          physics.add(key)
          break
        }
      }
    }
    sim?.setPlanetTiles([...physics].map((k) => this.resident.get(k)!.collision))
  }
  private groundAltitude(position: Vec3Tuple): number {
    const height = this.groundHeight(position)
    return height === undefined
      ? 0
      : localToGeo(this.origin, [position[0], height, position[2]]).altitude
  }
  groundHeight(position: Vec3Tuple): number | undefined {
    // Reuse the worker's spatial chunks instead of raycasting every rendered
    // terrain triangle whenever the camera replans its zoom coverage.
    const worldRay = new THREE.Ray(
      new THREE.Vector3(position[0], position[1] + 20000, position[2]),
      new THREE.Vector3(0, -1, 0),
    )
    let highest: number | undefined
    const matrix = new THREE.Matrix4(),
      inverse = new THREE.Matrix4(),
      box = new THREE.Box3()
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3(),
      hit = new THREE.Vector3()
    for (const key of this.visible) {
      const tile = this.resident.get(key)!.collision
      matrix.compose(
        new THREE.Vector3(...tile.pose.position),
        new THREE.Quaternion(...tile.pose.rotation),
        new THREE.Vector3(1, 1, 1),
      )
      inverse.copy(matrix).invert()
      const ray = worldRay.clone().applyMatrix4(inverse)
      for (const chunk of tile.chunks) {
        if (chunk.buildings) continue
        box.min.fromArray(chunk.bounds)
        box.max.fromArray(chunk.bounds, 3)
        if (!ray.intersectsBox(box)) continue
        const p = chunk.triangles
        for (let i = 0; i < p.length; i += 9) {
          a.fromArray(p, i)
          b.fromArray(p, i + 3)
          c.fromArray(p, i + 6)
          if (ray.intersectTriangle(a, b, c, false, hit)) {
            hit.applyMatrix4(matrix)
            if (highest === undefined || hit.y > highest) highest = hit.y
          }
        }
      }
    }
    return highest
  }

  async ensureGround(position: Vec3Tuple): Promise<void> {
    const started = Date.now()
    while (this.groundHeight(position) === undefined) {
      if (this.disposed) throw Error('Carga cancelada')
      if (Date.now() - started > 120000)
        throw Error('El terreno todavía se está preparando. Espera a que aparezca antes de jugar.')
      this.update(position, [0, 0, 0])
      await new Promise((r) => setTimeout(r, 200))
    }
  }
  inspect(ray: THREE.Raycaster, host: HTMLElement, otherDistance = Infinity): boolean {
    const hit = ray.intersectObject(this.root, true).find((h) => h.object.parent?.visible)
    if (!hit || hit.distance > otherDistance) return false
    let node: THREE.Object3D | null = hit.object
    while (node && !node.userData.planetTile) node = node.parent
    if (!node) return false
    const { key, manifest, directory } = node.userData.planetTile as {
      key: string
      manifest: PlanetManifest
      directory: string
    }
    host.replaceChildren()
    const title = document.createElement('h3')
    title.textContent = key
    const info = document.createElement('p')
    info.textContent = `GLB · ${manifest.anchor.latitude.toFixed(6)}°, ${manifest.anchor.longitude.toFixed(6)}° · marco local en metros`
    host.append(title, info)
    for (const layer of ['terrain', 'buildings-osm'] as const) {
      const link = document.createElement('a')
      link.href = directory + manifest.files[layer].path
      link.download = manifest.files[layer].download
      link.textContent =
        (layer === 'terrain' ? 'Descargar terreno' : 'Descargar edificios') +
        ` · ${(manifest.files[layer].bytes / 1e6).toFixed(2)} MB`
      link.style.display = 'block'
      host.append(link)
    }
    return true
  }
  async refreshTile(_key: string) {
    this.next = 0
    await this.discover()
  }
  private remove(key: string) {
    const r = this.resident.get(key)
    if (!r) return
    r.group.removeFromParent()
    r.group.traverse((n) => {
      const m = n as THREE.Mesh
      if (m.isMesh) {
        m.geometry.dispose()
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose()
      }
    })
    this.resident.delete(key)
  }
  dispose() {
    this.disposed = true
    this.controller.abort()
    this.worker.terminate()
    for (const key of this.resident.keys()) this.remove(key)
    this.treeTexture?.dispose()
    this.root.removeFromParent()
  }
}
