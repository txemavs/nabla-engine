import type { StreamDiagnostics, TileDiagnostic } from './debug.js'
import { placeLabel } from './place-label.js'
import {
  PLANET_GEOMETRY_REVISION,
  validPlanetPlaces,
  validatePlanetManifest,
  type PlanetManifest,
  type PlanetPayload,
  type PlanetCollisionTile,
} from '../../planet/index.js'
import { PlanetHorizon } from './horizon.js'
import { carriagewayTint, matteGroundMaterial } from './ground-material.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import * as THREE from 'three'
import {
  mapTileAt,
  mapTileId,
  mapTilePath,
  planMapZooms,
  planetReadyCover,
  type MapTile,
  type MapZoomPlan,
} from '../../scene/mercator.js'
import { geoToLocal, localFrame, localToGeo, type GeoPoint } from '../../math/geo/sphere.js'
import { planetTileFrame } from '../../planet/tiles.js'
import { SURFACE_LAYERS } from '../../planet/land/surface.js'
import type { Simulation } from '../../simulation/simulation.js'
import type { Vec3Tuple } from '../../stage/scene.js'
import { restoreTileLayers } from './tile-asset.js'
/** Satellite painted over the z15 GLB. Roofs, runways and pitches on by default. */
export const projectedLayers = new Set(['roofs', 'runways', 'pitches'])
const drapeLayers: { id: string; ground?: number; roads?: boolean; terrain?: boolean }[] = [
  { id: 'farmland', ground: 4 },
  { id: 'forest', ground: 5 },
  { id: 'scrub', ground: 6 },
  { id: 'wetland', ground: 7 },
  { id: 'rock', ground: 8 },
  { id: 'sand', ground: 9 },
  { id: 'grass', ground: 10 },
  { id: 'water', ground: 11 },
  { id: 'residential', ground: 2 },
  { id: 'industrial', ground: 3 },
  { id: 'terrain', terrain: true },
  { id: 'roads', roads: true },
]
// Delete after the next GLB regen. Published cells still carry the old beige;
// the publisher palette is already #8c8a86. See nabla-world landcover.ts.
const retiredResidential = ['#d0c8b8', '#c4b8a4', '#b0a28e'].map((hex) => new THREE.Color(hex))
const residentialGray = new THREE.Color('#8c8a86')

function washResidential(colors: Float32Array): void {
  for (let i = 0; i < colors.length; i += 3) {
    const known = retiredResidential.some(
      (color) =>
        Math.abs(colors[i] - color.r) < 0.02 &&
        Math.abs(colors[i + 1] - color.g) < 0.02 &&
        Math.abs(colors[i + 2] - color.b) < 0.02,
    )
    if (!known) continue
    colors[i] = residentialGray.r
    colors[i + 1] = residentialGray.g
    colors[i + 2] = residentialGray.b
  }
}

function inlandWater(metadata: { category?: string; groundLayer?: number }) {
  return metadata.category === 'Surfaces' && metadata.groundLayer === SURFACE_LAYERS.water
}
function drapeBias(id: string): number {
  if (id === 'roofs') return -30
  if (id === 'runways') return -24
  if (id === 'pitches') return -16
  if (id === 'roads') return -20
  return -(drapeLayers.find((layer) => layer.id === id)?.ground ?? 1)
}
function dressSatelliteRoofs(
  group: THREE.Group,
  manifest: PlanetManifest,
  changed: () => void,
  setupMaterial: (material: THREE.Material) => void,
) {
  const tile = manifest.tile
  if (tile.z !== 15) return
  const baked = new Set<string>()
  for (const node of group.children) {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || mesh.name !== 'Drape') continue
    const id = String(mesh.userData.drape ?? '')
    const material = mesh.material as THREE.MeshStandardMaterial
    if (id && material.map) baked.add(id)
    else {
      mesh.visible = false
      mesh.userData.ready = false
    }
  }
  const width = planetTileFrame(tile).width
  const buckets = new Map<string, number[]>()
  const take = (id: string, mesh: THREE.Mesh, roofs: boolean) => {
    if (!projectedLayers.has(id) || baked.has(id)) return
    const position = mesh.geometry.getAttribute('position')
    const normal = mesh.geometry.getAttribute('normal')
    const index = mesh.geometry.index
    const xyz = buckets.get(id) ?? []
    const triCount = (index ? index.count : position.count) / 3
    for (let t = 0; t < triCount; t++) {
      const ids = [0, 1, 2].map((k) => (index ? index.getX(t * 3 + k) : t * 3 + k))
      if (roofs && (normal.getY(ids[0]) + normal.getY(ids[1]) + normal.getY(ids[2])) / 3 < 0.55)
        continue
      for (const i of ids) {
        xyz.push(
          position.getX(i),
          position.getY(i) + 0.15,
          position.getZ(i),
          0.5 + position.getX(i) / width,
          0.5 - position.getZ(i) / width,
        )
      }
    }
    if (xyz.length) buckets.set(id, xyz)
  }
  for (const node of group.children) {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || mesh.userData.skirt || mesh.name === 'Drape') continue
    if (mesh.userData.category === 'Buildings') take('roofs', mesh, true)
    else if (mesh.userData.category === 'Aeroway') take('runways', mesh, false)
    else if (mesh.userData.category === 'Pitch') take('pitches', mesh, false)
    else if (mesh.userData.category === 'Roads') take('roads', mesh, false)
    else if (mesh.userData.category === 'Terrain') take('terrain', mesh, false)
    else {
      const layer = drapeLayers.find((item) => item.ground === mesh.userData.groundLayer)
      if (layer) take(layer.id, mesh, false)
    }
  }
  if (!buckets.size) return
  const zoom = tile.z + 3
  const span = 2 ** (zoom - tile.z)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = span * 256
  const ctx = canvas.getContext('2d')!
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const draped: THREE.Mesh[] = []
  for (const [id, xyz] of buckets) {
    const geometry = new THREE.BufferGeometry()
    const position = new Float32Array((xyz.length / 5) * 3)
    const uv = new Float32Array((xyz.length / 5) * 2)
    for (let i = 0, v = 0; i < xyz.length; i += 5, v++) {
      position.set(xyz.slice(i, i + 3), v * 3)
      uv.set(xyz.slice(i + 3, i + 5), v * 2)
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 1,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: drapeBias(id),
        polygonOffsetUnits: drapeBias(id),
        depthWrite: false,
      }),
    )
    setupMaterial(mesh.material)
    mesh.name = 'Drape'
    mesh.userData.drape = id
    mesh.userData.ready = false
    mesh.visible = false
    mesh.castShadow = false
    mesh.receiveShadow = true
    group.add(mesh)
    draped.push(mesh)
  }
  const show = () => {
    for (const mesh of draped) {
      mesh.userData.ready = true
      mesh.visible = projectedLayers.has(mesh.userData.drape)
    }
    changed()
  }
  let pending = span * span
  for (let row = 0; row < span; row++) {
    for (let col = 0; col < span; col++) {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.onload = () => {
        ctx.drawImage(image, col * 256, row * 256)
        if (--pending === 0) {
          texture.needsUpdate = true
          show()
        }
      }
      image.onerror = () => {
        if (--pending === 0) show()
      }
      image.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${tile.y * span + row}/${tile.x * span + col}`
    }
  }
}

function tileRevision(manifest: PlanetManifest) {
  return manifest.files.terrain.sha256 + ':' + manifest.files['buildings-osm'].sha256
}

function roofTexture(bitmap: ImageBitmap) {
  const texture = new THREE.Texture(bitmap)
  texture.flipY = false
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true
  return texture
}

interface Resident {
  chart?: PlanetPayload['chart']
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
  get chartTiles() {
    return this.visible.flatMap((key) => {
      const r = this.resident.get(key)
      if (!r?.chart) return []
      r.group.updateMatrix()
      return [{ ...r.chart, matrix: r.group.matrix }]
    })
  }
  get navigationPlaces() {
    const seen = new Set<string>()
    return this.visible.flatMap((key) => {
      const r = this.resident.get(key)!
      const manifest = r.group.userData.planetTile.manifest as PlanetManifest
      r.group.updateMatrix()
      return validPlanetPlaces(manifest.places).flatMap((place) => {
        if (seen.has(place.id)) return []
        seen.add(place.id)
        // Stored labels sit 20m above terrain; HUD signs sit at 120m.
        return [
          {
            id: place.id,
            text: place.text,
            position: new THREE.Vector3(...place.position)
              .add(new THREE.Vector3(0, 100, 0))
              .applyMatrix4(r.group.matrix),
          },
        ]
      })
    })
  }
  private simulation: Simulation | null = null
  private horizon: PlanetHorizon
  private treeTexture: THREE.Texture | undefined
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
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
  private discoveryOffset = 0
  private next = 0
  private distance = 4000
  private relief = 2
  /** z15 city meshes kept in memory. Quality sets this; the horizon is separate. */
  private maxTiles = 64
  private planKey = ''
  private originOffset = new THREE.Vector3()
  private controller = new AbortController()
  private protectedPositions: Vec3Tuple[] = []
  private buildings = true
  private access = true
  private createSea: () => THREE.Material = () =>
    new THREE.MeshStandardMaterial({
      color: '#102f43',
      roughness: 0.3,
      metalness: 0.03,
      envMapIntensity: 0,
    })
  constructor(
    private origin: GeoPoint,
    private changed: () => void,
    private setupMaterial: (m: THREE.Material) => void,
    private base = import.meta.env.VITE_WORLD_PREPARED_URL || '/prepared',
    private api = import.meta.env.VITE_WORLD_PREPARE_API || '/prepare',
  ) {
    this.horizon = new PlanetHorizon(origin, changed, `${base}/photos`, setupMaterial)
    this.root.add(this.horizon.root)
    this.worker.onmessage = (
      event: MessageEvent<{ id: number; payload?: PlanetPayload; error?: string }>,
    ) => {
      const request = this.requests.get(event.data.id)
      if (!request) {
        event.data.payload?.chart?.bitmap.close()
        return
      }
      this.requests.delete(event.data.id)
      if (event.data.payload && !this.disposed)
        this.installQueue.push({
          key: request.key,
          manifest: request.manifest,
          payload: event.data.payload,
        })
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
  private installQueue: { key: string; manifest: PlanetManifest; payload: PlanetPayload }[] = []
  private installing: { key: string; steps: Generator<void> } | undefined
  private lastInstallMs = 0
  private maxInstallMs = 0
  private staging = new Set<THREE.Group>()
  private streamMode: 'ground' | 'flight' | 'model' = 'ground'
  setStreamMode(mode: 'ground' | 'flight' | 'model'): void {
    this.streamMode = mode
    this.planKey = ''
  }
  get installMilliseconds(): number {
    return this.lastInstallMs
  }
  get diagnostics(): StreamDiagnostics {
    const ids = new Map(this.wanted.map((tile) => [mapTileId(tile), tile]))
    for (const [key] of this.resident) {
      const tile = this.ready.get(key)?.tile
      if (tile) ids.set(key, tile)
    }
    const loading = new Set([...this.requests.values()].map((r) => r.key))
    const queued = new Set(this.installQueue.map((r) => r.key))
    if (this.installing) queued.add(this.installing.key)
    const visible = new Set(this.visible)
    const tiles: TileDiagnostic[] = [...ids].map(([key, tile]) => ({
      tile,
      kind: 'mesh',
      state: visible.has(key)
        ? 'visible'
        : queued.has(key)
          ? 'installing'
          : loading.has(key)
            ? 'downloading'
            : this.resident.has(key)
              ? 'resident'
              : this.retry.has(key)
                ? 'retry'
                : 'planned',
    }))
    return {
      tiles: [...tiles, ...this.horizon.diagnostics],
      residentBytes: [...this.resident.values()].reduce((sum, r) => sum + r.bytes, 0),
      budgetBytes: this.memoryBudget,
      pending: this.requests.size + queued.size,
      installMs: this.lastInstallMs,
      maxInstallMs: this.maxInstallMs,
      distance: this.distance,
    }
  }
  /** Time-sliced mesh staging; publication remains atomic. A single mesh is an indivisible task. */
  flushInstall(budgetMs = 1.5): boolean {
    const started = performance.now()
    let worked = false
    do {
      if (!this.installing) {
        const job = this.installQueue.shift()
        if (!job) break
        this.installing = { key: job.key, steps: this.install(job.key, job.manifest, job.payload) }
      }
      const done = this.installing.steps.next().done
      worked = true
      if (done) this.installing = undefined
    } while (performance.now() - started < budgetMs)
    this.lastInstallMs = performance.now() - started
    this.maxInstallMs = Math.max(this.maxInstallMs, this.lastInstallMs)
    if (worked) this.pump()
    return worked
  }
  private concurrency = 2
  private ahead = 8
  private memoryBudget = 160 * 1024 * 1024
  setQuality(concurrent: number, ahead: number, retain = false, maxTiles = 64) {
    this.concurrency = Math.max(1, Math.min(3, concurrent))
    this.ahead = Math.min(45, Math.max(0, ahead))
    this.memoryBudget = (retain ? 320 : 160) * 1024 * 1024
    this.maxTiles = Math.max(8, Math.min(240, Math.round(maxTiles)))
  }
  setDistance(distance: number) {
    this.distance = distance
  }
  setRelief(span: number) {
    this.relief = span
  }
  setOcean(blocks: MapTile[]) {
    this.horizon.setOcean(blocks)
  }
  /** Applied after streaming, which turns groups back on every frame. */
  applyViewLayers(layers: {
    glb: boolean
    relief: boolean
    photo14: boolean
    photo12: boolean
    trees: boolean
  }) {
    const active = new Set(this.visible)
    for (const [key, resident] of this.resident) {
      resident.group.visible = layers.glb && active.has(key)
      for (const child of resident.group.children)
        if (child.userData.category === 'Trees') child.visible = layers.trees
    }
    const showHorizon = layers.relief || layers.photo14 || layers.photo12
    this.horizon.root.visible = showHorizon
    if (showHorizon) this.horizon.applyViewLayers(layers)
  }
  useSea(create: () => THREE.Material) {
    this.createSea = create
    for (const resident of this.resident.values())
      for (const child of resident.group.children) {
        const mesh = child as THREE.Mesh
        if (!inlandWater(mesh.userData)) continue
        const previous = mesh.material as THREE.MeshStandardMaterial
        mesh.material = this.riverMaterial(previous.side)
        mesh.receiveShadow = true
        this.setupMaterial(mesh.material as THREE.Material)
        restoreTileLayers(mesh)
        previous.dispose()
      }
  }
  /** Same sea shader. The glint stays; the wave also tints the body so it reads from above. */
  private riverMaterial(side: THREE.Side) {
    const material = this.createSea() as THREE.MeshStandardMaterial
    material.polygonOffset = true
    material.polygonOffsetFactor = -1
    material.polygonOffsetUnits = -1
    material.color.set('#102f43')
    material.vertexColors = false
    material.side = side
    return material
  }
  applyProjection() {
    this.root.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (mesh.name === 'Drape' && mesh.userData.ready)
        mesh.visible = projectedLayers.has(mesh.userData.drape)
    })
    this.changed()
  }
  update(
    position: Vec3Tuple,
    velocity: Vec3Tuple,
    _protected: Vec3Tuple[] = [],
    eye?: Vec3Tuple,
  ): void {
    if (this.disposed) return
    this.protectedPositions = _protected
    const gps = localToGeo(this.origin, position)
    const height = Math.max(
      0,
      (eye ? localToGeo(this.origin, eye).altitude : gps.altitude) - this.groundAltitude(position),
    )
    // Relief span is the quality control. Do not inflate it with altitude:
    // a hidden 40 km ring was rebuilding hundreds of photo meshes in flight.
    this.horizon.update(gps.latitude, gps.longitude, this.relief)
    this.horizon.setFocus(mapTileAt(gps.latitude, gps.longitude, 15))
    const center = mapTileAt(gps.latitude, gps.longitude, 15)
    const planKey = `${mapTileId(center)}:${this.distance}:${this.maxTiles}:${this.streamMode}:${Math.floor(height / 500)}`
    if (!this.plan || planKey !== this.planKey) {
      this.planKey = planKey
      this.plan = planMapZooms({
        latitude: gps.latitude,
        longitude: gps.longitude,
        heightAboveGround: height,
        viewDistance: this.distance,
        maxTiles: this.maxTiles,
        adaptive: this.streamMode !== 'ground',
      })
    }
    const plan = this.plan
    if (!plan) return
    const ahead = localToGeo(this.origin, [
      position[0] + velocity[0] * this.ahead,
      position[1],
      position[2] + velocity[2] * this.ahead,
    ])
    const future = mapTileAt(ahead.latitude, ahead.longitude, 15)
    const protectedTiles = _protected
      .map((p) => localToGeo(this.origin, p))
      .filter((p) => p.altitude < 12000)
      .map((p) => mapTileAt(p.latitude, p.longitude, 15))
    const corridor: MapTile[] = []
    for (let step = 0; step <= 8; step++) {
      const p = localToGeo(this.origin, [
        position[0] + (velocity[0] * this.ahead * step) / 8,
        position[1],
        position[2] + (velocity[2] * this.ahead * step) / 8,
      ])
      corridor.push(mapTileAt(p.latitude, p.longitude, 15))
    }
    this.wanted = [
      ...new Map(
        [center, ...protectedTiles, ...corridor, ...plan.requests, future].map((t) => [
          mapTileId(t),
          t,
        ]),
      ).values(),
    ]
    const needed = new Set(this.wanted.map(mapTileId))
    this.installQueue = this.installQueue.filter((job) => {
      if (needed.has(job.key)) return true
      job.payload.chart?.bitmap.close()
      for (const mesh of job.payload.meshes) mesh.map?.close()
      return false
    })
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
      (t) =>
        (!this.resident.has(mapTileId(t)) && !this.ready.has(mapTileId(t))) ||
        this.ready.get(mapTileId(t))?.geometryRevision !== PLANET_GEOMETRY_REVISION ||
        (t.z < 15 && this.ready.get(mapTileId(t))?.lod?.revision !== 'mesh-lod-v1'),
    )
    if (!missing.length) return
    // Public requests may be ineligible; do not let the first rejected batch
    // permanently hide available/adjacent cells later in the flight plan.
    const offset = this.access ? 0 : this.discoveryOffset % missing.length
    const batch = [...missing.slice(offset), ...missing.slice(0, offset)].slice(0, 24)
    this.discoveryOffset = (offset + batch.length) % missing.length
    this.busy = true
    this.next = Date.now() + 3000
    try {
      const response = await fetch(this.api + '/tiles', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: batch.map(mapTilePath) }),
        signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(15000)]),
      })
      if (!response.ok) throw Error(`HTTP ${response.status}`)
      const data = await response.json()
      this.access = !!data.authorized
      for (const tile of batch) {
        const value = data.available?.[mapTilePath(tile)]
        if (value) this.ready.set(mapTileId(tile), validatePlanetManifest(value, tile))
      }
      this.status = this.access
        ? 'Preparando GLB en el servidor…'
        : data.generationAccess === 'neighbors'
          ? 'GLB vecinos y otros zooms · generación pública limitada · activa tu sesión para otras zonas'
          : 'Generación GLB desactivada · activa el acceso privado en la barra inferior'
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
      if (
        this.requests.size + this.installQueue.length + Number(!!this.installing) >=
        this.concurrency
      )
        break
      const key = mapTileId(tile),
        manifest = this.ready.get(key)
      if (
        !manifest ||
        this.installing?.key === key ||
        this.installQueue.some((job) => job.key === key) ||
        (this.resident.has(key) &&
          this.resident.get(key)!.revision === tileRevision(manifest) &&
          (!this.buildings || this.resident.get(key)!.buildings)) ||
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
  private *install(key: string, manifest: PlanetManifest, payload: PlanetPayload): Generator<void> {
    const group = new THREE.Group()
    this.staging.add(group)
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
      if (data.color) {
        if (data.metadata.groundLayer === SURFACE_LAYERS.residential) washResidential(data.color)
        geometry.setAttribute('color', new THREE.BufferAttribute(data.color, 3))
      }
      if (data.uv) geometry.setAttribute('uv', new THREE.BufferAttribute(data.uv, 2))
      if (data.index) geometry.setIndex(new THREE.BufferAttribute(data.index, 1))
      geometry.computeBoundingSphere()
      const photo = data.map ? roofTexture(data.map) : undefined
      const material = inlandWater(data.metadata)
        ? this.riverMaterial(data.side as THREE.Side)
        : (data.metadata.category === 'Buildings' || data.metadata.drape
            ? (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p)
            : matteGroundMaterial)({
            color: carriagewayTint(data.metadata, data.tint),
            map: photo,
            vertexColors: !!data.color,
            roughness: 1,
            side: data.side as THREE.Side,
          })
      if (data.metadata.drape) {
        material.depthWrite = false
        material.polygonOffset = true
        material.polygonOffsetFactor = -30
        material.polygonOffsetUnits = -30
      }
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = data.name
      mesh.visible = !data.metadata.drape || projectedLayers.has(String(data.metadata.drape))
      mesh.userData = data.metadata
      mesh.castShadow =
        !data.metadata.skirt && ['Terrain', 'Buildings'].includes(data.metadata.category)
      mesh.receiveShadow = true
      group.add(mesh)
      restoreTileLayers(mesh)
      this.setupMaterial(material)
      yield
    }
    dressSatelliteRoofs(
      group,
      manifest,
      () => this.changed(),
      (material) => this.setupMaterial(material),
    )
    group.userData.planetTile = {
      key,
      manifest,
      directory: this.base + '/' + mapTilePath(manifest.tile) + '/',
    }
    for (const place of validPlanetPlaces(manifest.places)) {
      const label = placeLabel(place.text)
      label.name = place.text
      const gps = localToGeo(manifest.anchor, place.position)
      // Cached label metadata is 20m above ground; display at 1000m AGL.
      label.position.fromArray(
        geoToLocal(manifest.anchor, { ...gps, altitude: gps.altitude + 980 }),
      )
      group.add(label)
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
    yield
    const restoreSupport = this.simulation?.capturePlanetSupport((p) => this.groundHeight(p))
    this.remove(key)
    group.visible = false
    this.root.add(group)
    this.staging.delete(group)
    this.resident.set(key, {
      group,
      chart: payload.chart,
      collision: {
        id: key + '@' + manifest.files.terrain.sha256,
        pose: { position, rotation },
        chunks: payload.chunks,
        poles: payload.vegetation.flatMap((v, i) => {
          const height = v.size[1]
          if (!(height > 0.5)) return []
          const radius = 0.35
          const x = v.position[0],
            y = v.position[1],
            z = v.position[2]
          return [
            {
              key: `t${i}`,
              center: [x, y + height / 2, z] as [number, number, number],
              half: [radius, height / 2, radius] as [number, number, number],
              bounds: [x - radius, y, z - radius, x + radius, y + height, z + radius] as [
                number,
                number,
                number,
                number,
                number,
                number,
              ],
            },
          ]
        }),
      },
      bytes:
        // CPU arrays plus a matching GPU copy; driver allocations are not directly observable.
        payload.meshes.reduce(
          (n, m) =>
            n +
            2 *
              (m.position.byteLength +
                m.normal.byteLength +
                (m.color?.byteLength ?? 0) +
                (m.index?.byteLength ?? 0) +
                (m.uv?.byteLength ?? 0)) +
            (m.map ? m.map.width * m.map.height * 4 * 2 : 0),
          0,
        ) +
        validPlanetPlaces(manifest.places).length * 512 * 64 * 4 +
        (payload.chart ? 1024 * 1024 * 4 : 0) +
        payload.chunks.reduce((n, c) => n + c.triangles.byteLength, 0),
      revision: tileRevision(manifest),
      buildings: payload.buildings,
    })
    this.cover()
    restoreSupport?.()
    this.changed()
  }
  private cover() {
    if (!this.plan) return
    const cover = planetReadyCover(this.plan, new Set(this.resident.keys())).map(mapTileId)
    // Keep the last city cover if the new plan has nothing ready yet.
    this.visible = cover.length ? cover : this.visible
    this.horizon.setCoverage(this.visible.map((key) => this.ready.get(key)!.tile))
    const active = new Set(this.visible)
    for (const [key, r] of this.resident) {
      r.group.visible = active.has(key)
      for (const child of r.group.children) {
        if (child.name === 'Drape') {
          child.visible = !!child.userData.ready && projectedLayers.has(child.userData.drape)
          continue
        }
        child.visible = this.buildings || child.userData.category !== 'Buildings'
      }
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
    this.simulation = sim
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
      if (
        p.altitude > 12000 ||
        !Number.isFinite(p.latitude) ||
        !Number.isFinite(p.longitude) ||
        Math.abs(p.latitude) > 85
      )
        continue
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
    sim?.setPlanetTiles([
      ...this.horizon.collisionTiles,
      ...[...physics].map((k) => this.resident.get(k)!.collision),
    ])
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
    for (const tile of [
      ...this.horizon.collisionTiles,
      ...this.visible.map((key) => this.resident.get(key)!.collision),
    ]) {
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
      this.flushInstall(1.5)
      this.update(position, [0, 0, 0])
      await new Promise((r) => setTimeout(r, 200))
    }
  }
  private selection?: THREE.Mesh
  clearSelection(): void {
    if (!this.selection) return
    this.selection.removeFromParent()
    this.selection.geometry.dispose()
    ;(this.selection.material as THREE.Material).dispose()
    this.selection = undefined
  }
  inspect(ray: THREE.Raycaster, host: HTMLElement, otherDistance = Infinity): boolean {
    this.root.updateMatrixWorld(true)
    const hit = ray.intersectObject(this.root, true).find((h) => {
      if (h.object === this.selection || h.object.userData.skirt) return false
      for (let node: THREE.Object3D | null = h.object; node; node = node.parent)
        if (!node.visible) return false
      return true
    })
    if (!hit || hit.distance > otherDistance) return false
    let node: THREE.Object3D | null = hit.object
    while (node && !node.userData.planetTile) node = node.parent
    if (!node) return false
    const { key, manifest, directory } = node.userData.planetTile as {
      key: string
      manifest: PlanetManifest
      directory: string
    }
    this.clearSelection()
    const mesh = hit.object as THREE.Mesh
    const part = mesh.userData.parts?.find(
      (p: { start: number; count: number }) =>
        hit.faceIndex !== undefined &&
        hit.faceIndex !== null &&
        hit.faceIndex * 3 >= p.start &&
        hit.faceIndex * 3 < p.start + p.count,
    )
    const building = mesh.userData.category === 'Buildings'
    if (building && mesh.geometry) {
      const geometry = mesh.geometry.clone()
      if (part) geometry.setDrawRange(part.start, part.count)
      this.selection = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color: '#ffd54f',
          wireframe: true,
          depthTest: false,
          transparent: true,
          opacity: 0.65,
        }),
      )
      this.selection.renderOrder = 1000
      mesh.add(this.selection)
    }
    host.replaceChildren()
    const title = document.createElement('h3')
    title.textContent = building
      ? `Edificio · ${part?.source?.tags?.name ?? part?.id ?? mesh.name}`
      : key
    const info = document.createElement('p')
    info.textContent = `GLB · ${manifest.anchor.latitude.toFixed(6)}°, ${manifest.anchor.longitude.toFixed(6)}° · marco local en metros`
    host.append(title, info)
    if (building) {
      const source = document.createElement('p')
      source.textContent = `Baldosa: ${key} · ${part?.source?.id ?? 'Edificio del GLB'}`
      host.append(source)
    }
    this.changed()
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
    r.chart?.bitmap.close()
    r.group.removeFromParent()
    r.group.traverse((n) => {
      if (n instanceof THREE.Sprite && n.userData.ownedLabelTexture) {
        n.material.map?.dispose()
        n.material.dispose()
      }
      const m = n as THREE.Mesh
      if (m.isMesh) {
        m.geometry.dispose()
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose()
      }
    })
    this.resident.delete(key)
  }
  dispose() {
    this.clearSelection()
    this.disposed = true
    this.controller.abort()
    this.worker.terminate()
    this.installing?.steps.return(undefined)
    for (const job of this.installQueue) {
      job.payload.chart?.bitmap.close()
      for (const mesh of job.payload.meshes) mesh.map?.close()
    }
    this.installQueue = []
    for (const group of this.staging)
      group.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (mesh.isMesh) {
          mesh.geometry.dispose()
          for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
            material.dispose()
        }
      })
    this.staging.clear()
    this.horizon.dispose()
    for (const key of this.resident.keys()) this.remove(key)
    this.treeTexture?.dispose()
    this.root.removeFromParent()
  }
}
