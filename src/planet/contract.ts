/**
 * Published planet tile: the GLB manifest and the collision chunk shape.
 * Labels live in `places.ts`. The metre frame and the source grid live in `tiles.ts`.
 *
 * Optional candidate road layers (asphalt + bridge supports). Two published shapes:
 * - `#88` `roads.files.{asphalt,supports,collision}`
 * - Atlas `#49` `roadCandidates.layers.{asphalt,supports,collision}` (schema
 *   `nabla-road-candidates/1`). Not written into `files`.
 *
 * Atlas may mark them `drivable: false` / `engineLoad` as provenance only; those
 * fields do not skip asphalt/supports. Collision stays inspect-only
 * (`&inspectRoads=collision`) and is not the default driving collider.
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
const ROAD_KINDS = ['asphalt', 'supports', 'collision'] as const

/** Atlas `#49` top-level candidate pointer. Not written into `files`. */
export const ROAD_CANDIDATES_SCHEMA = 'nabla-road-candidates/1'

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

/** One candidate road GLB. `drivable` / `engineLoad` are Atlas provenance only and do not gate the loader. */
export interface PlanetCandidateRoadFile extends PlanetLayerFile {
  drivable?: boolean
  role?: string
  engineLoad?: string
}

/** Atlas `#49` layer pointer. `download` is optional; the loader defaults it to `path`. */
export type PlanetPublishedRoadLayer = Omit<PlanetCandidateRoadFile, 'download'> & {
  download?: string
}

/**
 * Normalized candidate road layers the loader consumes (`roads.files.*`).
 *
 * Accepted published keys:
 * - `#88` `roads.files.{asphalt,supports,collision}` (also `files.roads-*`)
 * - Atlas `#49` `roadCandidates.layers.{asphalt,supports,collision}`
 *
 * `drivable` and `engineLoad` are provenance/acceptance only; `false` / `opt-in`
 * do not skip asphalt/supports. `files.collision` stays inspect-only.
 * `revision` / `evidenceSha256` / layer hashes feed the resident cache key.
 */
export interface PlanetCandidateRoads {
  drivable?: boolean
  revision?: string
  recipe?: string
  evidenceId?: string
  evidenceSha256?: string
  engineLoad?: Partial<Record<PlanetCandidateRoadKind, string>>
  provenance?: Record<string, unknown>
  files: Partial<Record<PlanetCandidateRoadKind, PlanetCandidateRoadFile>>
}

/**
 * Atlas `#49` published pointer. Schema `nabla-road-candidates/1`.
 * Layers are `{ path, sha256, bytes, role, engineLoad }`; collision also has
 * `optIn` / `drivingCollision: false`. Not copied into `files`.
 */
export interface PlanetRoadCandidates {
  schema?: typeof ROAD_CANDIDATES_SCHEMA
  review?: string
  drivable?: boolean
  engineLoad?: Partial<Record<PlanetCandidateRoadKind, string>>
  recipe?: string
  evidenceId?: string
  evidenceSha256?: string
  publication?: string
  layers: Partial<Record<PlanetCandidateRoadKind, PlanetPublishedRoadLayer>>
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
  /** Optional candidate asphalt / supports / collision (`#88` shape). Absent on engine-only tiles. */
  roads?: PlanetCandidateRoads
  /** Atlas `#49` shape. Normalized into `roads` by `readCandidateRoads`. */
  roadCandidates?: PlanetRoadCandidates
  /**
   * Offline OSM snapshot (`osm.snapshot` / `osm-*.json.gz`) from an Atlas Z15 package.
   * Set only by the Atlas adapter; used by the in-car GPS for named streets.
   */
  osmSnapshot?: PlanetLayerFile
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

/** True when extras mark a mesh as an Atlas/engine candidate road layer. */
export function isCandidateRoadMesh(
  metadata: { nablaCandidateRoad?: unknown } | undefined,
): boolean {
  return isCandidateRoadKind(String(metadata?.nablaCandidateRoad ?? ''))
}

/** True only for the inspect collision GLB. Asphalt/supports stay in driving collision. */
export function isInspectRoadCollisionMesh(
  metadata: { nablaCandidateRoad?: unknown } | undefined,
): boolean {
  return metadata?.nablaCandidateRoad === 'collision'
}

/** Stamp worker extras. Asphalt/supports keep category Roads so they render and collide. */
export function tagCandidateRoadMesh(
  metadata: Record<string, any>,
  kind: PlanetCandidateRoadKind,
): Record<string, any> {
  metadata.nablaCandidateRoad = kind
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

function publishedDrivable(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function candidateRoadFile(value: unknown): PlanetCandidateRoadFile {
  const raw = value as PlanetCandidateRoadFile
  const file = layerFile(raw, isCandidateRoadGlbPath, 'Invalid planet road layer')
  const drivable = publishedDrivable(raw?.drivable)
  return drivable === undefined ? file : { ...file, drivable }
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

function publishedEngineLoad(
  value: unknown,
): Partial<Record<PlanetCandidateRoadKind, string>> | undefined {
  if (!value || typeof value !== 'object') return undefined
  const out: Partial<Record<PlanetCandidateRoadKind, string>> = {}
  for (const kind of ROAD_KINDS) {
    const load = (value as Record<string, unknown>)[kind]
    if (typeof load === 'string' && load) out[kind] = load
  }
  return Object.keys(out).length ? out : undefined
}

function takeRoadFile(
  files: PlanetCandidateRoads['files'],
  kind: PlanetCandidateRoadKind,
  value: unknown,
): void {
  if (value === undefined) return
  const file = candidateRoadFile(value)
  const existing = files[kind]
  if (existing && (existing.path !== file.path || existing.sha256 !== file.sha256))
    throw Error('Invalid planet road layers')
  files[kind] = existing ?? file
}

/**
 * Normalize `#88` `roads.files.*`, Atlas `#49` `roadCandidates.layers.*`, and
 * optional `files.roads-*`. `drivable` and `engineLoad` are provenance only.
 */
export function readCandidateRoads(manifest: PlanetManifest): PlanetCandidateRoads | undefined {
  const block = manifest.roads
  const published = manifest.roadCandidates
  if (block !== undefined && (!block || typeof block !== 'object'))
    throw Error('Invalid planet road layers')
  if (published !== undefined && (!published || typeof published !== 'object'))
    throw Error('Invalid planet road layers')
  if (published?.schema !== undefined && published.schema !== ROAD_CANDIDATES_SCHEMA)
    throw Error('Invalid planet road layers')
  if (
    published?.layers !== undefined &&
    (!published.layers || typeof published.layers !== 'object')
  )
    throw Error('Invalid planet road layers')
  const files: PlanetCandidateRoads['files'] = {}
  for (const kind of ROAD_KINDS) {
    takeRoadFile(files, kind, published?.layers?.[kind])
    takeRoadFile(files, kind, manifest.files?.[FILE_ROAD_KEYS[kind]])
    takeRoadFile(files, kind, block?.files?.[kind])
  }
  const present = ROAD_KINDS.filter((kind) => files[kind])
  if (!block && !published && !present.length) return undefined
  if (!present.length) throw Error('Invalid planet road layers')
  const normalized: PlanetCandidateRoads['files'] = {}
  for (const kind of present) normalized[kind] = files[kind]!
  return {
    drivable: publishedDrivable(block?.drivable) ?? publishedDrivable(published?.drivable),
    revision: optionalText(block?.revision),
    recipe: optionalText(block?.recipe) ?? optionalText(published?.recipe),
    evidenceId: optionalText(block?.evidenceId) ?? optionalText(published?.evidenceId),
    evidenceSha256: optionalText(published?.evidenceSha256),
    engineLoad:
      publishedEngineLoad(published?.engineLoad) ?? publishedEngineLoad(block?.engineLoad),
    provenance:
      block?.provenance && typeof block.provenance === 'object' ? block.provenance : undefined,
    files: normalized,
  }
}

/** Publisher revision, Atlas evidence hash, or concatenated candidate hashes. */
export function planetRoadRevision(roads: PlanetCandidateRoads): string {
  if (roads.revision) return roads.revision
  if (roads.evidenceSha256) return roads.evidenceSha256
  return ROAD_KINDS.map((kind) => roads.files[kind]?.sha256)
    .filter((hash): hash is string => !!hash)
    .join(':')
}

/** Resident-tile cache identity: terrain, buildings, photo, then candidate road revision. */
export function planetTileRevision(manifest: PlanetManifest): string {
  const roads = readCandidateRoads(manifest)
  return (
    manifest.files.terrain.sha256 +
    ':' +
    manifest.files['buildings-osm'].sha256 +
    (manifest.photo ? ':' + manifest.photo.sha256 : '') +
    (roads ? ':' + planetRoadRevision(roads) : '')
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
  const roads = readCandidateRoads(manifest)?.files
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
