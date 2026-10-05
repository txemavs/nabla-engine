/**
 * Published planet tile: the GLB manifest and the collision chunk shape.
 * Labels live in `places.ts`. The metre frame and the source grid live in `tiles.ts`.
 *
 * Optional candidate road layers (asphalt + bridge supports) are visual only. Atlas
 * writes them with `drivable: false`, hash-named files and provenance; see `roads`.
 * Candidate collision is a separate inspect file and is never the default driveable mesh.
 */
import type { GeoPoint } from '../math/geo/sphere.js'
import {
  isPublishedGlbPath,
  mapTileBounds,
  mapTileId,
  mapTileSample,
  type MapTile,
} from '../scene/mercator.js'
import type { PlanetPlace } from './places.js'

/** Bump when a published GLB must be regenerated. v5 drapes pitch photos. */
export const PLANET_GEOMETRY_REVISION = 'native-surfaces-v5'

const SHA256 = /^[a-f0-9]{64}$/
const CANDIDATE_ROAD_STEM =
  /^(asphalt|supports|road-collision|roads-asphalt|roads-supports|roads-collision)(-candidate)?(-[a-f0-9]{16}|-[a-f0-9]{64})?\.glb$/
const FILE_ROAD_KEYS = {
  asphalt: 'roads-asphalt',
  supports: 'roads-supports',
  collision: 'roads-collision',
} as const

export type PlanetRequiredLayer = 'terrain' | 'buildings-osm'
export type PlanetCandidateRoadKind = 'asphalt' | 'supports' | 'collision'
export type PlanetCandidateRoadFileKey = (typeof FILE_ROAD_KEYS)[PlanetCandidateRoadKind]
export type PlanetGlbKind = PlanetRequiredLayer | PlanetCandidateRoadKind

export interface PlanetLayerFile {
  path: string
  download: string
  bytes: number
  sha256: string
}

/** One candidate road GLB. `drivable` is always false after validation. */
export interface PlanetCandidateRoadFile extends PlanetLayerFile {
  drivable?: false
}

/**
 * Candidate road layers published beside terrain/buildings.
 *
 * Expected keys (Atlas publisher / manual Zaisa patch):
 * - `drivable: false` (required meaning; explicit `true` is rejected)
 * - `files.asphalt` / `files.supports` — visual GLBs, hash-named
 * - `files.collision` — inspect-only; the loader does not use it for driving
 * - `revision` / `recipe` / `evidenceId` / `provenance` — cache identity and audit
 *
 * A producer may also place the same files on `files.roads-asphalt` (etc.);
 * validation lifts them into this object.
 */
export interface PlanetCandidateRoads {
  drivable: false
  revision?: string
  recipe?: string
  evidenceId?: string
  provenance?: Record<string, unknown>
  files: Partial<Record<PlanetCandidateRoadKind, PlanetCandidateRoadFile>>
}

export interface PlanetManifest {
  lod?: {
    revision: string
    inputTriangles: number
    outputTriangles: number
    maxErrorMeters: number
    sources?: string[]
  }
  places?: PlanetPlace[]
  format: 'nabla-planet-tile-v1'
  generator: 'native-xyz-v2'
  geometryRevision?: typeof PLANET_GEOMETRY_REVISION
  id: string
  tile: MapTile
  anchor: GeoPoint
  bounds: ReturnType<typeof mapTileBounds>
  files: Record<PlanetRequiredLayer, PlanetLayerFile> &
    Partial<Record<PlanetCandidateRoadFileKey, PlanetCandidateRoadFile>>
  /** Present when an external producer (nabla-atlas) published a Z15 package next to this manifest. */
  z15Package?: PlanetZ15PackageRef
  /**
   * Orthophoto draped over the tile (the compatibility composite of an Atlas package).
   * Set only by the Atlas adapter; the standard preparation service never writes it.
   */
  photo?: PlanetPhoto
  /** Optional candidate asphalt / supports / collision. Absent on engine-only tiles. */
  roads?: PlanetCandidateRoads
}
/** Pointer to the `nabla-z15-package/1` JSON that lists every file of an Atlas cell. */
export interface PlanetZ15PackageRef {
  schema: 'nabla-z15-package/1'
  file: string
  sha256: string
  bytes: number
  packageVersion: number
}
/** One north-up image covering exactly the tile (Web Mercator, row 0 = north). */
export interface PlanetPhoto {
  path: string
  bytes: number
  sha256: string
  sizePx: number
  level: 'full' | 'lo'
}
export interface PlanetMesh {
  name: string
  position: Float32Array
  normal: Float32Array
  color?: Float32Array
  index?: Uint32Array
  uv?: Float32Array
  map?: ImageBitmap
  tint: string
  side: number
  metadata: Record<string, any>
}
export interface PlanetPayload {
  chart?: { bitmap: ImageBitmap; bounds: [number, number, number, number] }
  meshes: PlanetMesh[]
  chunks: PlanetCollisionChunk[]
  bytes: number
  buildings: boolean
  vegetation: { position: [number, number, number]; size: [number, number] }[]
  /** Orthophoto drape prepared by the worker: triangles per layer, plus the decoded photo. */
  drape?: {
    layers: { id: string; position: Float32Array; uv: Float32Array }[]
    photo?: ImageBitmap
    error?: string
  }
  /** Worker milliseconds per phase (download, SHA-256, GLB parse, photo decode, collision build). */
  timings?: { fetch: number; verify: number; parse: number; photo: number; collision: number }
}
export interface PlanetCollisionChunk {
  key: string
  bounds: [number, number, number, number, number, number]
  buildings: boolean
  triangles: Float32Array
}

export interface PlanetGlbLayer {
  name: PlanetRequiredLayer | PlanetCandidateRoadFileKey
  kind: PlanetGlbKind
  file: PlanetLayerFile
}

/** Hash-named or evidence-named candidate road GLB inside the cell directory. */
export function isCandidateRoadGlbPath(path: string): boolean {
  return typeof path === 'string' && CANDIDATE_ROAD_STEM.test(path)
}

export function isCandidateRoadKind(kind: string): kind is PlanetCandidateRoadKind {
  return kind === 'asphalt' || kind === 'supports' || kind === 'collision'
}

/** True when extras mark a mesh as Atlas/engine candidate road (never driveable). */
export function isCandidateRoadMesh(
  metadata: { nablaCandidateRoad?: unknown } | undefined,
): boolean {
  return isCandidateRoadKind(String(metadata?.nablaCandidateRoad ?? ''))
}

/** Stamp worker extras so visual candidates render and stay out of driving collision. */
export function tagCandidateRoadMesh(
  metadata: Record<string, any>,
  kind: PlanetCandidateRoadKind,
): Record<string, any> {
  metadata.nablaCandidateRoad = kind
  metadata.drivable = false
  if (kind === 'collision') metadata.category = 'RoadCollision'
  else if (!metadata.category) metadata.category = 'Roads'
  return metadata
}

function layerFile(
  value: unknown,
  pathOk: (path: string) => boolean,
  label: string,
): PlanetLayerFile {
  const f = value as PlanetLayerFile
  if (
    !f ||
    !pathOk(f.path) ||
    !SHA256.test(f.sha256) ||
    !Number.isInteger(f.bytes) ||
    f.bytes < 20 ||
    f.bytes > 64 * 1024 * 1024
  )
    throw Error(label)
  return {
    path: f.path,
    download: typeof f.download === 'string' && f.download ? f.download : f.path,
    bytes: f.bytes,
    sha256: f.sha256,
  }
}

function rejectDrivable(value: unknown, label: string): void {
  if (value === true) throw Error(label)
}

function candidateRoadFile(value: unknown): PlanetCandidateRoadFile {
  const raw = value as PlanetCandidateRoadFile
  rejectDrivable(raw?.drivable, 'Candidate road layers cannot be marked drivable')
  const file = layerFile(raw, isCandidateRoadGlbPath, 'Invalid planet road layer')
  return { ...file, drivable: false }
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

/**
 * Normalize `roads` plus optional `files.roads-*` keys. Missing `drivable` becomes false;
 * explicit `true` is rejected so candidates cannot become the default driveable mesh.
 */
export function readCandidateRoads(manifest: PlanetManifest): PlanetCandidateRoads | undefined {
  const block = manifest.roads
  if (block !== undefined && (!block || typeof block !== 'object'))
    throw Error('Invalid planet road layers')
  rejectDrivable(block?.drivable, 'Candidate road layers cannot be marked drivable')
  const files: PlanetCandidateRoads['files'] = { ...(block?.files ?? {}) }
  for (const kind of ['asphalt', 'supports', 'collision'] as const) {
    const lifted = manifest.files?.[FILE_ROAD_KEYS[kind]]
    if (lifted && !files[kind]) files[kind] = lifted
  }
  const present = (['asphalt', 'supports', 'collision'] as const).filter((kind) => files[kind])
  if (!block && !present.length) return undefined
  if (!present.length) throw Error('Invalid planet road layers')
  const normalized: PlanetCandidateRoads['files'] = {}
  for (const kind of present) normalized[kind] = candidateRoadFile(files[kind])
  return {
    drivable: false,
    revision: optionalText(block?.revision),
    recipe: optionalText(block?.recipe),
    evidenceId: optionalText(block?.evidenceId),
    provenance:
      block?.provenance && typeof block.provenance === 'object' ? block.provenance : undefined,
    files: normalized,
  }
}

/** Concatenated candidate hashes, or the publisher revision when present. */
export function planetRoadRevision(roads: PlanetCandidateRoads): string {
  if (roads.revision) return roads.revision
  return (['asphalt', 'supports', 'collision'] as const)
    .map((kind) => roads.files[kind]?.sha256)
    .filter((hash): hash is string => !!hash)
    .join(':')
}

/** Resident-tile cache identity: terrain, buildings, photo, then candidate road revision. */
export function planetTileRevision(manifest: PlanetManifest): string {
  return (
    manifest.files.terrain.sha256 +
    ':' +
    manifest.files['buildings-osm'].sha256 +
    (manifest.photo ? ':' + manifest.photo.sha256 : '') +
    (manifest.roads ? ':' + planetRoadRevision(manifest.roads) : '')
  )
}

export function planetTileGlbLayers(
  manifest: PlanetManifest,
  options: { buildings?: boolean; inspectRoadCollision?: boolean } = {},
): PlanetGlbLayer[] {
  const layers: PlanetGlbLayer[] = [
    { name: 'terrain', kind: 'terrain', file: manifest.files.terrain },
  ]
  if (options.buildings !== false)
    layers.push({
      name: 'buildings-osm',
      kind: 'buildings-osm',
      file: manifest.files['buildings-osm'],
    })
  const roads = manifest.roads?.files
  if (roads?.asphalt) layers.push({ name: 'roads-asphalt', kind: 'asphalt', file: roads.asphalt })
  if (roads?.supports)
    layers.push({ name: 'roads-supports', kind: 'supports', file: roads.supports })
  if (options.inspectRoadCollision && roads?.collision)
    layers.push({ name: 'roads-collision', kind: 'collision', file: roads.collision })
  return layers
}

/** Cache Storage key. Road layers include the SHA-256 so an in-place replace cannot reuse stale bytes. */
export function planetGlbCacheKey(url: string, file: PlanetLayerFile, kind: PlanetGlbKind): string {
  return isCandidateRoadKind(kind) ? `${url}?sha256=${file.sha256}` : url
}

export function validatePlanetManifest(value: unknown, tile: MapTile): PlanetManifest {
  const m = value as PlanetManifest
  const anchor = mapTileSample(tile, 1, 1, 2)
  if (
    !m ||
    m.format !== 'nabla-planet-tile-v1' ||
    m.generator !== 'native-xyz-v2' ||
    m.id !== mapTileId(tile) ||
    !m.tile ||
    mapTileId(m.tile) !== m.id ||
    !m.tile ||
    !m.anchor ||
    Object.entries(anchor).some(
      ([key, n]) =>
        !Number.isFinite(m.anchor[key as keyof GeoPoint]) ||
        Math.abs(m.anchor[key as keyof GeoPoint] - n) > 1e-9,
    )
  )
    throw Error('Invalid native planet manifest')
  for (const name of ['terrain', 'buildings-osm'] as const) {
    m.files[name] = layerFile(
      m.files?.[name],
      (path) => isPublishedGlbPath(tile, name, path),
      'Invalid planet layer',
    )
  }
  const roads = readCandidateRoads(m)
  if (roads) m.roads = roads
  else delete m.roads
  return m
}

/** True when `child` lies inside `parent` on the Web Mercator quadtree. */
export function coversTile(parent: MapTile, child: MapTile): boolean {
  const scale = 2 ** (child.z - parent.z)
  return (
    parent.z <= child.z &&
    Math.floor(child.x / scale) === parent.x &&
    Math.floor(child.y / scale) === parent.y
  )
}
