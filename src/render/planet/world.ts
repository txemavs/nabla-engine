import type { StreamDiagnostics, TileDiagnostic } from './debug.js'
import { placeLabel } from './place-label.js'
import {
  PLANET_GEOMETRY_REVISION,
  candidateAsphaltDisposition,
  planetCellVersion,
  planetTileRevision,
  validPlanetPlaces,
  validatePlanetManifest,
  type PlanetManifest,
  type PlanetPayload,
  type PlanetCollisionTile,
} from '../../planet/index.js'
import type { PlanetPhoto } from '../../planet/contract.js'
import {
  osmSnapshotHighways,
  osmSnapshotPavedAreas,
  projectOsmPavedAreas,
  projectOsmRoads,
  type OsmChartRoad,
} from '../../planet/osm-snapshot.js'
import { StaticTileError, fetchTileManifest } from './static-tiles.js'
import { atlasFileUrl, atlasPhotoFor, type AtlasZ15Options } from '../../planet/atlas-z15.js'
import { fetchOsmSnapshot } from './osm-roads.js'
import { NO_ASPHALT_MASK, asphaltMaskTexture } from './asphalt-mask.js'
import { sha256 } from '../../util/sha256.js'

export type TileDiscoveryMode = 'dynamic' | 'static'
export interface PlanetSourceOptions {
  /** Known coverage of a finite offline dataset. Omit for unrestricted streaming. */
  tiles?: readonly MapTile[]
  /**
   * Tiles known to exist, for hosts that cannot answer 404 cheaply or quietly. Unlike `tiles`, nothing
   * waits for them at startup; streaming only skips requests for tiles outside the set.
   */
  coverage?: readonly MapTile[]
  /**
   * Cells within this many cells (Chebyshev) of the player get the photo quality of `atlas.photo`;
   * farther cells get the small `lo` photo, which is ~16x lighter on the network and the GPU. A cell
   * the player approaches is upgraded. Default 1; only meaningful with `atlas`.
   */
  nearCells?: number
  /**
   * Tiles the host does not have (404/403). Holes, not errors: they are remembered here (pass a
   * `MissingTiles` with storage to keep them across sessions) so they are not requested again for a while
   * and can be reported to the tile producer. Default: an in-memory list.
   */
  missing?: MissingTiles
  /** Disable external coarse relief for self-contained examples. Coordinates remain planetary. */
  horizon?: boolean
  /** Read Atlas `nabla-z15-package/1` cells (static mode). Implies `imagery: 'package'`. */
  atlas?: AtlasZ15Options
  /**
   * Source of the photo draped over roofs, pitches and (when enabled) the ground.
   * `online` (default) streams ArcGIS World Imagery; `package` uses the orthophoto shipped
   * inside the tile package, so nothing leaves the tile host; `none` never drapes a photo.
   */
  imagery?: 'online' | 'package' | 'none'
  /**
   * Load candidate road collision GLBs for visual inspection. Default off.
   * The mesh is never installed as driving collision.
   */
  inspectRoadCollision?: boolean
  /**
   * Show the separate OSM road asphalt of version 2+ cells (`ground-road`,
   * `elevated-or-unresolved-road`) for inspection: drawn, never a collider. Default off (not drawn,
   * not loaded into collision). Bridges (`bridge-deck`, supports) always render and collide, and
   * the OSM snapshot for the GPS always loads. URL `osmRoads=1` in the game.
   */
  osmRoads?: boolean
}
import { PlanetHorizon } from './horizon.js'
import {
  carriagewayTint,
  castShadowFromBackFaces,
  matteGroundMaterial,
  ROADS_DRAPE_TINT,
  tileMeshSide,
  asphaltContrast,
  withAsphaltContrast,
  withMap,
} from './ground-material.js'
import { treeInstances } from './vegetation.js'
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
import type { Vec3Tuple } from '../../entity/schema.js'
import { restoreTileLayers } from './tile-asset.js'
import { MissingTiles, type MissingTile } from '../../planet/missing-tiles.js'
import {
  DRAPE_LAYERS,
  GROUND_DRAPE_LIFT,
  ROOF_DRAPE_LIFT,
  bakedDrapeLayers,
  buildDrapes,
  drapeMaterialAlpha,
  photoFrameTransform,
  type DrapeGeometry,
} from './drape.js'
import { PLACE_LABEL_CATEGORY, tileMeshHidden } from './tile-layers.js'
/** Satellite painted over the z15 GLB. Roofs, runways and pitches on by default. */
export const projectedLayers = new Set(['roofs', 'runways', 'pitches'])
/** A drape is drawn when it is projected and its layer (road, photo, ...) is not switched off. */
const drapeShown = (id: unknown) =>
  projectedLayers.has(String(id)) && !tileMeshHidden({ drape: id })
const drapeLayers = DRAPE_LAYERS
/**
 * Show the tile photo (see `PlanetSourceOptions.imagery`) over the ground as well as over roofs: terrain,
 * roads and every land-use surface except inland water, which keeps its own shader.
 */
export function projectGroundPhoto(enabled = true) {
  for (const layer of drapeLayers)
    if (layer.id !== 'water') projectedLayers[enabled ? 'add' : 'delete'](layer.id)
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
/** Decode a verified package orthophoto, flipped so the texture needs no `flipY` (north-up, v up). */
async function loadPackagePhoto(
  url: string,
  photo: PlanetPhoto,
  mark?: (name: string, ms: number) => void,
): Promise<ImageBitmap> {
  let started = performance.now()
  const lap = (name: string) => {
    const now = performance.now()
    mark?.(name, now - started)
    started = now
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) })
  if (!response.ok) throw new Error(`Photo ${url}: HTTP ${response.status}`)
  const bytes = await response.arrayBuffer()
  lap('photoFetch')
  if (bytes.byteLength !== photo.bytes) throw new Error(`Photo ${url}: size mismatch`)
  if ((await sha256(bytes)) !== photo.sha256) throw new Error(`Photo ${url}: checksum mismatch`)
  lap('photoVerify')
  const bitmap = await createImageBitmap(new Blob([bytes]), { imageOrientation: 'flipY' })
  lap('photoDecode')
  return bitmap
}

/**
 * Roof photos float a hand above the roof so the tiles never z-fight with the building. Photos of
 * the ground must NOT: the physics ground is the unlifted surface, and a 15 cm lift made every wheel
 * and the player look sunk into the drawn road. polygonOffset alone wins the depth test there.
 */
export { ROOF_DRAPE_LIFT, GROUND_DRAPE_LIFT }
/**
 * Dress a z15 cell with photo drapes: the ground photo (`ground.lots` when the package has it) on
 * terrain/roads, and the dedicated lean-corrected roof photo (`roof`, frame `cell+margin:0.125`) on
 * roofs. Exported for the roof-photo regression test.
 */
export function dressSatelliteRoofs(
  group: THREE.Group,
  manifest: PlanetManifest,
  changed: () => void,
  setupMaterial: (material: THREE.Material) => void,
  imagery: 'online' | 'package' | 'none' = 'online',
  photoUrl?: string,
  onPhotoError?: (error: unknown) => void,
  mark?: (name: string, ms: number) => void,
  /** Drape geometry and photo already prepared by the worker; absent = build and fetch here. */
  prepared?: { drapes: DrapeGeometry[]; photo?: ImageBitmap; roofPhoto?: ImageBitmap },
) {
  const tile = manifest.tile
  if (tile.z !== 15 || imagery === 'none') return
  if (imagery === 'package' && (!manifest.photo || !photoUrl)) return
  const baked = bakedDrapeLayers(
    group.children.flatMap((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return []
      const material = mesh.material as THREE.MeshStandardMaterial
      return [{ name: mesh.name, metadata: mesh.userData, hasMap: !!material.map }]
    }),
    planetCellVersion(manifest),
  )
  for (const node of group.children) {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || mesh.name !== 'Drape') continue
    const material = mesh.material as THREE.MeshStandardMaterial
    if (!mesh.userData.drape || !material.map) {
      mesh.visible = false
      mesh.userData.ready = false
    }
  }
  const width = planetTileFrame(tile).width
  const buckets =
    prepared?.drapes ??
    buildDrapes(
      group.children.flatMap((node) => {
        const mesh = node as THREE.Mesh
        if (!mesh.isMesh) return []
        const g = mesh.geometry
        return [
          {
            name: mesh.name,
            position: g.getAttribute('position').array as Float32Array,
            normal: g.getAttribute('normal').array as Float32Array,
            index: g.index?.array as Uint32Array | undefined,
            metadata: mesh.userData,
          },
        ]
      }),
      { width, layers: projectedLayers, baked },
    )
  if (!buckets.length) return
  const zoom = tile.z + 3
  const span = 2 ** (zoom - tile.z)
  const packaged = imagery === 'package'
  const canvas = packaged ? undefined : document.createElement('canvas')
  if (canvas) canvas.width = canvas.height = span * 256
  const ctx = canvas?.getContext('2d') ?? undefined
  const texture: THREE.Texture = canvas ? new THREE.CanvasTexture(canvas) : new THREE.Texture()
  texture.colorSpace = THREE.SRGBColorSpace
  const roofTextureMap: THREE.Texture = packaged ? new THREE.Texture() : texture
  if (packaged) roofTextureMap.colorSpace = THREE.SRGBColorSpace
  // Roof photo frame is `cell+margin:0.125` (5120² = 4096 cell px + 512 px each side): map cell
  // UVs into the inner 80 %. Without it roofs sample the transparent (RGB≈0) margin or the wrong
  // roof and render black / untextured.
  const useRoofImage = (frame: string | undefined) => {
    const { repeat, offset } = photoFrameTransform(frame)
    roofTextureMap.repeat.set(repeat, repeat)
    roofTextureMap.offset.set(offset, offset)
    roofTextureMap.userData.frame = frame ?? 'cell'
    // Fallback to the ground photo (no dedicated roof image) stays opaque.
    if (frame === 'cell' || !frame)
      for (const mesh of draped)
        if (mesh.userData.drape === 'roofs') {
          const material = mesh.material as THREE.MeshStandardMaterial
          material.transparent = false
          material.alphaTest = 0
          material.needsUpdate = true
        }
  }
  const draped: THREE.Mesh[] = []
  for (const { id, position, uv } of buckets) {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    const material = new THREE.MeshStandardMaterial({
      map: id === 'roofs' ? roofTextureMap : texture,
      color: id === 'roads' ? ROADS_DRAPE_TINT : '#ffffff',
      roughness: 1,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: drapeBias(id),
      polygonOffsetUnits: drapeBias(id),
      depthWrite: false,
      ...drapeMaterialAlpha(id, roofTextureMap !== texture),
    })
    // Asphalt contrast (draw time) before shadow setup, which chains onBeforeCompile. The terrain
    // photo gets it only through its cell's OSM road mask (relief=lidar has no road meshes).
    if (id === 'roads') withAsphaltContrast(material)
    else if (id === 'terrain') withAsphaltContrast(material, { value: NO_ASPHALT_MASK })
    const mesh = new THREE.Mesh(geometry, material)
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
      mesh.visible = drapeShown(mesh.userData.drape)
    }
    changed()
  }
  if (packaged && prepared?.photo) {
    texture.image = prepared.photo
    texture.flipY = false
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
    texture.anisotropy = 8
    texture.needsUpdate = true
    const roofBmp = prepared.roofPhoto ?? prepared.photo
    if (roofTextureMap !== texture) {
      useRoofImage(prepared.roofPhoto ? manifest.roofPhoto?.frame : 'cell')
      roofTextureMap.image = roofBmp
      roofTextureMap.flipY = false
      roofTextureMap.wrapS = roofTextureMap.wrapT = THREE.ClampToEdgeWrapping
      roofTextureMap.anisotropy = 8
      roofTextureMap.needsUpdate = true
    }
    show()
    mark?.('photoShown', performance.now())
    return
  }
  if (packaged) {
    const groundUrl = photoUrl!
    const roofUrl = manifest.roofPhoto
      ? groundUrl.slice(0, groundUrl.lastIndexOf('/') + 1) + manifest.roofPhoto.path
      : undefined
    Promise.all([
      loadPackagePhoto(groundUrl, manifest.photo!, mark),
      manifest.roofPhoto && roofUrl
        ? loadPackagePhoto(roofUrl, manifest.roofPhoto, mark)
        : Promise.resolve(undefined),
    ])
      .then(([bitmap, roofBmp]) => {
        if (group.userData.disposed) {
          bitmap.close()
          roofBmp?.close()
          return
        }
        texture.image = bitmap
        texture.flipY = false
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
        texture.anisotropy = 8
        texture.needsUpdate = true
        if (roofTextureMap !== texture) {
          useRoofImage(roofBmp ? manifest.roofPhoto?.frame : 'cell')
          roofTextureMap.image = roofBmp ?? bitmap
          roofTextureMap.flipY = false
          roofTextureMap.wrapS = roofTextureMap.wrapT = THREE.ClampToEdgeWrapping
          roofTextureMap.anisotropy = 8
          roofTextureMap.needsUpdate = true
        }
        show()
        mark?.('photoShown', performance.now())
      })
      .catch((error) => onPhotoError?.(error))
    return
  }
  let pending = span * span
  for (let row = 0; row < span; row++) {
    for (let col = 0; col < span; col++) {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.onload = () => {
        ctx!.drawImage(image, col * 256, row * 256)
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
  return planetTileRevision(manifest)
}

function roofTexture(bitmap: ImageBitmap) {
  const texture = new THREE.Texture(bitmap)
  texture.flipY = false
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true
  return texture
}

/** Where one cell spent its time, in milliseconds (`at*` values are `performance.now()` stamps). */
export interface TileTiming {
  atRequested?: number
  atWorkerDone?: number
  atInstalled?: number
  atPhotoShown?: number
  /** Worker phases (see `PlanetPayload.timings`). */
  fetch?: number
  verify?: number
  parse?: number
  photo?: number
  collision?: number
  /** Main thread: mesh install steps, the drape rebuild, the photo download/check/decode. */
  installMs?: number
  maxStepMs?: number
  drapeMs?: number
  photoFetch?: number
  photoVerify?: number
  photoDecode?: number
}

interface Resident {
  chart?: PlanetPayload['chart']
  group: THREE.Group
  collision: PlanetCollisionTile
  bytes: number
  revision: string
  buildings: boolean
  roads?: OsmChartRoad[]
  /** Paved non-road polygons (car parks) from the OSM snapshot, scene metres. */
  pavedAreas?: ReturnType<typeof projectOsmPavedAreas>
  /** OSM carriageway mask for the terrain drape's asphalt contrast; painted on demand. */
  asphaltMask?: THREE.DataTexture
  /** Same mask with north at v = 0, for the v2+ terrain texture's glTF UVs. */
  asphaltMaskNorth?: THREE.DataTexture
}
/** The last thing that went wrong while loading cells, structured so a host can phrase it. */
export interface StreamError {
  message: string
  /** `http`/`network`/`timeout`/`invalid`/`insecure` for a manifest; `cell` for a GLB; `worker` for the loader. */
  kind: string
  url?: string
  status?: number
  key?: string
}
export interface LoadDiagnostics {
  manifestsInFlight: number
  cellsInFlight: number
  installing: number
  failed: number
  missing: number
  lastError?: StreamError
}
function describeStreamError(error: unknown): StreamError {
  if (error instanceof StaticTileError)
    return { message: error.message, kind: error.kind, url: error.url, status: error.status }
  return { message: error instanceof Error ? error.message : String(error), kind: 'network' }
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
  /** Car parks and paved road areas around the visible cells (asphalt for the tyres). */
  get pavedAreas() {
    return this.visible.flatMap((key) => this.resident.get(key)?.pavedAreas ?? [])
  }
  get navigationRoads() {
    return this.visible.flatMap((key) => this.resident.get(key)?.roads ?? [])
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
  /** Per-cell timing record for diagnostics and the loading budget tests. */
  readonly tileTimings = new Map<string, TileTiming>()
  private stamp(key: string): TileTiming {
    let t = this.tileTimings.get(key)
    if (!t) this.tileTimings.set(key, (t = {}))
    return t
  }
  private requests = new Map<number, { key: string; manifest: PlanetManifest }>()
  private ready = new Map<string, PlanetManifest>()
  private retry = new Map<string, number>()
  /** Tiles the host does not have: holes, remembered and not re-requested for a while. */
  private readonly missing: MissingTiles
  /** Manifest requests that failed (not "missing"): backed off for a few seconds, reported to the player. */
  private failedManifests = new Map<string, { until: number }>()
  private manifestsInFlight = 0
  private lastError: StreamError | undefined
  private wanted: MapTile[] = []
  /** The z15 cell under the player at the last update. */
  private focus?: MapTile
  /** Worker answers received (loaded or failed): the loading screen's sign of life. */
  private settled = 0
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
    private discoveryMode: TileDiscoveryMode = 'dynamic',
    private sourceOptions: PlanetSourceOptions = {},
  ) {
    this.missing = sourceOptions.missing ?? new MissingTiles()
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
      this.settled++
      Object.assign(
        this.stamp(request.key),
        { atWorkerDone: performance.now() },
        event.data.payload?.timings,
      )
      if (event.data.payload && !this.disposed)
        this.installQueue.push({
          key: request.key,
          manifest: request.manifest,
          payload: event.data.payload,
        })
      else {
        this.retry.set(request.key, Date.now() + 15000)
        this.lastError = {
          message: event.data.error ?? 'sin datos',
          kind: 'cell',
          key: request.key,
        }
        this.status = 'GLB pendiente · ' + (event.data.error ?? 'sin datos')
      }
      this.pump()
      this.changed()
    }
    this.worker.onerror = (event) => {
      this.lastError = {
        message: event.message || 'no se pudo iniciar el cargador de celdas (worker)',
        kind: 'worker',
      }
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
  /**
   * Cells resident in memory, drawn now, wanted but missing on the host (holes), still arriving, and
   * failed (will be retried). There is no "total": streaming never needs an index of the host.
   */
  get cellStats(): {
    loaded: number
    visible: number
    missing: number
    pending: number
    failed: number
  } {
    return {
      loaded: this.resident.size,
      visible: this.visible.length,
      missing: this.missing.countAmong(this.wanted),
      pending: this.requests.size + this.installQueue.length + Number(!!this.installing),
      failed: this.failedManifests.size + this.retry.size,
    }
  }
  /** What the loading screen needs to explain a slow or failing load. */
  get loadDiagnostics(): LoadDiagnostics {
    const now = Date.now()
    return {
      manifestsInFlight: this.manifestsInFlight,
      cellsInFlight: this.requests.size,
      installing: this.installQueue.length + Number(!!this.installing),
      failed:
        [...this.failedManifests.values()].filter((f) => f.until > now).length + this.retry.size,
      missing: this.missing.countAmong(this.wanted),
      lastError: this.lastError,
    }
  }
  /** Tiles the host lacks (z/x/y, status, when), oldest first, kept across sessions when storage was given. */
  get missingTiles(): MissingTile[] {
    return this.missing.list()
  }
  /** Forget the recorded holes so they are requested again. */
  clearMissingTiles(): void {
    this.missing.clear()
    this.planKey = ''
  }
  /** The tile the host lacks under this position: nothing will ever load there. */
  missingTileAt(position: Vec3Tuple): MapTile | undefined {
    const gps = localToGeo(this.origin, position)
    const tile = mapTileAt(gps.latitude, gps.longitude, 15)
    return this.missing.has(tile) ? tile : undefined
  }
  /** Changes whenever a cell finishes loading or fails; stays equal while nothing is happening. */
  get loadProgress(): string {
    return `${this.settled}:${this.resident.size}:${this.installQueue.length}`
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
      const stepStarted = performance.now()
      const done = this.installing.steps.next().done
      const step = performance.now() - stepStarted
      const timing = this.stamp(this.installing.key)
      timing.installMs = (timing.installMs ?? 0) + step
      timing.maxStepMs = Math.max(timing.maxStepMs ?? 0, step)
      worked = true
      if (done) {
        timing.atInstalled = performance.now()
        this.installing = undefined
      }
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
  /** Cells kept in memory. */
  get maxCells(): number {
    return this.maxTiles
  }
  /** Cells kept in memory (same limits as the quality presets); applied from the next plan. */
  setMaxTiles(maxTiles: number) {
    this.maxTiles = Math.max(8, Math.min(240, Math.round(maxTiles)))
    this.planKey = ''
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
    terrain: boolean
    buildings: boolean
  }) {
    const active = new Set(this.visible)
    for (const [key, resident] of this.resident) {
      resident.group.visible = layers.glb && active.has(key)
      for (const child of resident.group.children) {
        const category = child.userData.category
        if (category === 'Trees') child.visible = layers.trees
        else if (category === 'Terrain') child.visible = layers.terrain
        else if (category === 'Buildings') child.visible = layers.buildings
      }
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
  /** Re-apply the hidden tile layers (see `setHiddenTileLayers`) to everything already loaded. */
  applyLayers() {
    this.cover()
    this.applyProjection()
  }
  applyProjection() {
    this.root.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (mesh.name === 'Drape' && mesh.userData.ready)
        mesh.visible = drapeShown(mesh.userData.drape)
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
    if (this.sourceOptions.horizon !== false) {
      this.horizon.update(gps.latitude, gps.longitude, this.relief)
      this.horizon.setFocus(mapTileAt(gps.latitude, gps.longitude, 15))
    }
    const center = mapTileAt(gps.latitude, gps.longitude, 15)
    this.focus = center
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
    const known = this.sourceOptions.coverage ?? this.sourceOptions.tiles
    if (known) {
      const available = new Set(known.map(mapTileId))
      this.wanted = this.wanted.filter((tile) => available.has(mapTileId(tile)))
    }
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
    const isStatic = this.discoveryMode === 'static'
    const now = Date.now()
    const missing = this.wanted.filter((t) => {
      const id = mapTileId(t)
      // A static host cannot regenerate a tile: older revisions and unpublished (404)
      // tiles are not re-requested on every pass.
      if (isStatic) {
        // A cell the player has come close to is read again for the full-quality photo.
        const upgrade = this.ready.get(id)?.photo?.level === 'lo' && this.photoQuality(t) === 'full'
        return (
          ((!this.resident.has(id) && !this.ready.has(id)) || upgrade) &&
          !this.missing.suppressed(t) &&
          now >= (this.failedManifests.get(id)?.until ?? 0)
        )
      }
      return (
        (!this.resident.has(id) && !this.ready.has(id)) ||
        this.ready.get(id)?.geometryRevision !== PLANET_GEOMETRY_REVISION ||
        (t.z < 15 && this.ready.get(id)?.lod?.revision !== 'mesh-lod-v1')
      )
    })
    if (!missing.length) return
    // Public requests may be ineligible; do not let the first rejected batch
    // permanently hide available/adjacent cells later in the flight plan.
    const offset = this.access ? 0 : this.discoveryOffset % missing.length
    const batch = [...missing.slice(offset), ...missing.slice(0, offset)].slice(0, 24)
    this.discoveryOffset = (offset + batch.length) % missing.length
    this.busy = true
    this.next = Date.now() + 3000
    try {
      if (this.discoveryMode === 'static') {
        await this.discoverStatic(batch)
      } else {
        await this.discoverDynamic(batch)
      }
      this.pump()
      this.changed()
    } catch (error) {
      if (!this.disposed)
        this.status =
          this.discoveryMode === 'static'
            ? 'Static tiles unavailable · ' + String(error)
            : 'Servidor planetario pendiente · ' + String(error)
    } finally {
      this.busy = false
    }
  }

  private async discoverDynamic(batch: MapTile[]) {
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
  }

  /** `atlas.photo`, except `lo` for cells farther than `nearCells` from the player. */
  private photoQuality(tile: MapTile): 'full' | 'lo' | 'none' {
    return atlasPhotoFor(
      this.sourceOptions.atlas?.photo ?? 'full',
      tile,
      this.focus,
      this.sourceOptions.nearCells,
    )
  }
  private async discoverStatic(batch: MapTile[]) {
    let notFound = 0
    await Promise.all(
      batch.map(async (tile) => {
        const id = mapTileId(tile)
        let status = 404
        this.manifestsInFlight++
        try {
          const manifest = await fetchTileManifest(tile, {
            baseUrl: this.base,
            signal: this.controller.signal,
            cors: true,
            missingStatuses: [403, 404],
            onMissing: (value) => (status = value),
            atlas: this.sourceOptions.atlas && {
              ...this.sourceOptions.atlas,
              photo: this.photoQuality(tile),
            },
          })
          if (manifest) {
            this.ready.set(id, manifest)
            this.missing.resolve(tile)
            this.failedManifests.delete(id)
            // Start this cell now; do not wait for the slowest request of the batch.
            this.pump()
            this.changed()
          } else {
            // A hole, not an error: remembered, and not asked for again for a while.
            notFound++
            this.missing.record(tile, status)
          }
        } catch (error) {
          if (this.controller.signal.aborted) return
          this.failedManifests.set(id, { until: Date.now() + 15000 })
          this.lastError = describeStreamError(error)
        } finally {
          this.manifestsInFlight--
        }
      }),
    )
    const loaded = batch.filter((t) => this.ready.has(mapTileId(t))).length
    let status = `Static tiles · ${loaded}/${batch.length} loaded · ${this.visible.length} visible`
    if (notFound) status += ` · ${notFound} not published (holes)`
    if (this.lastError && batch.some((t) => this.failedManifests.has(mapTileId(t))))
      status += ` · failed: ${this.lastError.message}`
    this.status = status
    this.access = true
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
      this.stamp(key).atRequested = performance.now()
      this.requests.set(id, { key, manifest })
      const imagery =
        this.sourceOptions.imagery ?? (this.sourceOptions.atlas ? 'package' : 'online')
      this.worker.postMessage({
        id,
        manifest,
        buildings: this.buildings,
        inspectRoadCollision: this.sourceOptions.inspectRoadCollision === true,
        osmRoads: this.sourceOptions.osmRoads === true,
        drape:
          imagery === 'package' && manifest.photo && tile.z === 15
            ? { layers: [...projectedLayers], width: planetTileFrame(tile).width }
            : undefined,
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
    const cellVersion = planetCellVersion(manifest)
    for (const data of payload.meshes) {
      // The worker already applied the OSM road policy; this guards payloads from elsewhere.
      // Bridge-deck asphalt and supports always stay (bridges have priority).
      if (
        data.metadata.nablaCandidateRoad === 'asphalt' &&
        candidateAsphaltDisposition(cellVersion, data.metadata, {
          osmRoads: this.sourceOptions.osmRoads === true,
        }) === 'drop'
      )
        continue
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(data.position, 3))
      geometry.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3))
      if (data.color) {
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
            ...withMap(photo),
            vertexColors: !!data.color,
            roughness: 1,
            side: tileMeshSide(data.side as THREE.Side, data.metadata, data.position, data.index),
          })
      if (data.metadata.drape === 'roads') withAsphaltContrast(material)
      // v2+ terrain texture is the visible ground (no photo drape over it): the asphalt contrast
      // runs on it, weighted by the cell's OSM road mask (glTF UVs: north at v = 0).
      if (
        cellVersion >= 2 &&
        data.metadata.category === 'Terrain' &&
        photo &&
        !data.metadata.skirt
      ) {
        withAsphaltContrast(material, { value: NO_ASPHALT_MASK })
        material.userData.asphaltMaskNorthAtV0 = true
      }
      if (data.metadata.drape) {
        material.depthWrite = false
        material.polygonOffset = true
        material.polygonOffsetFactor = -30
        material.polygonOffsetUnits = -30
      }
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = data.name
      mesh.visible = data.metadata.drape
        ? drapeShown(data.metadata.drape)
        : !tileMeshHidden(data.metadata)
      mesh.userData = data.metadata
      mesh.castShadow =
        !data.metadata.skirt && ['Terrain', 'Buildings'].includes(data.metadata.category)
      if (data.metadata.category === 'Terrain') castShadowFromBackFaces(material)
      mesh.receiveShadow = true
      group.add(mesh)
      restoreTileLayers(mesh)
      this.setupMaterial(material)
      yield
    }
    const imagery = this.sourceOptions.imagery ?? (this.sourceOptions.atlas ? 'package' : 'online')
    const timing = this.stamp(key)
    const drapeStarted = performance.now()
    dressSatelliteRoofs(
      group,
      manifest,
      () => this.changed(),
      (material) => this.setupMaterial(material),
      imagery,
      manifest.photo ? atlasFileUrl(this.base, manifest.tile, manifest.photo.path) : undefined,
      (error) => {
        this.status = 'Foto del terreno no disponible · ' + String(error)
        this.changed()
      },
      (name, ms) => {
        if (name === 'photoShown') timing.atPhotoShown = ms
        else (timing as Record<string, number>)[name] = ms
      },
      payload.drape && {
        drapes: payload.drape.layers,
        photo: payload.drape.photo,
        roofPhoto: payload.drape.roofPhoto,
      },
    )
    if (payload.drape?.error) {
      console.warn('Foto del terreno no disponible · ' + payload.drape.error)
      this.status = 'Foto del terreno no disponible · ' + payload.drape.error
      this.changed()
    }
    timing.drapeMs = performance.now() - drapeStarted
    group.userData.planetTile = {
      key,
      manifest,
      directory: this.base + '/' + mapTilePath(manifest.tile) + '/',
    }
    for (const place of validPlanetPlaces(manifest.places)) {
      const label = placeLabel(place.text)
      label.name = place.text
      // Layer `places`: hidden with the rest of the layer, live, through cover().
      label.userData.category = PLACE_LABEL_CATEGORY
      label.visible = !tileMeshHidden(label.userData)
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
      const material = new THREE.MeshStandardMaterial({
        map: this.treeTexture,
        alphaTest: 0.4,
        side: THREE.DoubleSide,
        roughness: 1,
      })
      this.setupMaterial(material)
      const trees = treeInstances(payload.vegetation, material)
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
    this.loadOsmSnapshot(key, manifest)
    this.cover()
    restoreSupport?.()
    this.changed()
  }
  private osmLoads = new Map<string, AbortController>()
  private loadOsmSnapshot(key: string, manifest: PlanetManifest) {
    const file = manifest.osmSnapshot
    if (!file || this.disposed) return
    this.osmLoads.get(key)?.abort()
    const ac = new AbortController()
    this.osmLoads.set(key, ac)
    const url = atlasFileUrl(this.base, manifest.tile, file.path)
    void fetchOsmSnapshot(url, file, AbortSignal.any([ac.signal, this.controller.signal]))
      .then((json) => {
        const resident = this.resident.get(key)
        if (!resident || ac.signal.aborted || this.disposed) return
        resident.roads = projectOsmRoads(osmSnapshotHighways(json), this.origin)
        resident.pavedAreas = projectOsmPavedAreas(osmSnapshotPavedAreas(json), this.origin)
        resident.bytes += resident.roads.reduce((n, road) => n + road.points.length * 16, 0)
        this.paintAsphaltMask(resident)
        this.changed()
      })
      .catch((error) => {
        if (ac.signal.aborted || this.controller.signal.aborted) return
        console.warn('OSM snapshot no disponible · ' + String(error))
      })
      .finally(() => {
        if (this.osmLoads.get(key) === ac) this.osmLoads.delete(key)
      })
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
          child.visible = !!child.userData.ready && drapeShown(child.userData.drape)
          continue
        }
        child.visible =
          (this.buildings || child.userData.category !== 'Buildings') &&
          !tileMeshHidden(child.userData)
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
    const { streamingDefaults } = await import('../../config/streaming.js')
    const started = Date.now()
    while (this.groundHeight(position) === undefined) {
      if (this.disposed) throw Error('Carga cancelada')
      if (Date.now() - started > 120000)
        throw Error('El terreno todavía se está preparando. Espera a que aparezca antes de jugar.')
      this.update(position, [0, 0, 0])
      this.flushInstall(streamingDefaults.blockingInstallBudgetMs)
      await new Promise((r) => setTimeout(r, streamingDefaults.blockingPollMs))
    }
  }
  private selection?: THREE.Mesh
  private selectionSource?: THREE.Mesh
  /** Geometry-only selection for the host overlay; never drawn into world or portal views. */
  get selectedSurface(): THREE.Mesh | undefined {
    if (!this.selection || !this.selectionSource) return undefined
    let attached = false
    for (let node: THREE.Object3D | null = this.selectionSource; node; node = node.parent) {
      if (!node.visible) return undefined
      if (node === this.root) attached = true
    }
    if (!attached) return undefined
    this.selectionSource.updateWorldMatrix(true, false)
    this.selection.matrix.copy(this.selectionSource.matrixWorld)
    this.selection.matrixWorldNeedsUpdate = true
    return this.selection
  }
  clearSelection(): void {
    if (!this.selection) return
    this.selection.removeFromParent()
    this.selection.geometry.dispose()
    ;(this.selection.material as THREE.Material).dispose()
    this.selection = undefined
    this.selectionSource = undefined
  }
  inspect(ray: THREE.Raycaster, host: HTMLElement, otherDistance = Infinity): boolean {
    this.root.updateMatrixWorld(true)
    const hit = ray.intersectObject(this.root, true).find((h) => {
      if (h.object === this.selection || h.object.userData.skirt || h.object.userData.drape)
        return false
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
        new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      )
      this.selection.matrixAutoUpdate = false
      this.selectionSource = mesh
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
  /**
   * Paint the terrain drape's road mask for the asphalt contrast: only when the contrast is not
   * neutral and the cell's OSM roads are loaded; once per cell. See `asphalt-mask.ts`.
   */
  private paintAsphaltMask(resident: Resident) {
    if (resident.asphaltMask || !resident.roads?.length || asphaltContrast() === 1) return
    const drapes: THREE.Mesh[] = []
    resident.group.traverse((node) => {
      const mesh = node as THREE.Mesh
      const terrain =
        (mesh.name === 'Drape' && mesh.userData.drape === 'terrain') ||
        mesh.userData.category === 'Terrain'
      if (mesh.isMesh && terrain) {
        const material = mesh.material as THREE.Material
        if (material.userData.asphaltMask) drapes.push(mesh)
      }
    })
    if (!drapes.length) return
    const manifest = resident.group.userData.planetTile?.manifest as PlanetManifest | undefined
    if (!manifest) return
    resident.group.updateMatrix()
    const toCell = resident.group.matrix.clone().invert()
    const y = resident.group.position.y
    const point = new THREE.Vector3()
    const roads = resident.roads
      .filter((road) => road.carriageway)
      .map((road) => ({
        width: road.width,
        points: road.points.map((p) => {
          point.set(p.x, y, p.z).applyMatrix4(toCell)
          return { x: point.x, z: point.z }
        }),
      }))
    const width = planetTileFrame(manifest.tile).width
    const mask = asphaltMaskTexture(roads, width)
    if (!mask) return
    resident.asphaltMask = mask
    for (const mesh of drapes) {
      const data = (mesh.material as THREE.Material).userData
      if (data.asphaltMaskNorthAtV0) {
        resident.asphaltMaskNorth ??= asphaltMaskTexture(roads, width, undefined, true) ?? undefined
        if (resident.asphaltMaskNorth)
          (data.asphaltMask as { value: THREE.Texture }).value = resident.asphaltMaskNorth
      } else (data.asphaltMask as { value: THREE.Texture }).value = mask
    }
    this.changed()
  }
  /** Paint missing road masks after the asphalt contrast leaves neutral (runtime slider). */
  refreshAsphaltMasks() {
    for (const resident of this.resident.values()) this.paintAsphaltMask(resident)
  }
  private remove(key: string) {
    this.osmLoads.get(key)?.abort()
    this.osmLoads.delete(key)
    const r = this.resident.get(key)
    if (!r) return
    r.asphaltMask?.dispose()
    r.asphaltMaskNorth?.dispose()
    r.chart?.bitmap.close()
    r.group.removeFromParent()
    r.group.userData.disposed = true
    r.group.traverse((n) => {
      if (n instanceof THREE.Sprite && n.userData.ownedLabelTexture) {
        n.material.map?.dispose()
        n.material.dispose()
      }
      const m = n as THREE.Mesh
      if (m.isMesh) {
        m.geometry.dispose()
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
          // The photo texture is shared by every drape mesh of the tile.
          if (m.name === 'Drape') (mat as THREE.MeshStandardMaterial).map?.dispose()
          mat.dispose()
        }
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
