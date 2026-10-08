/**
 * Adapter for Z15 packages published by nabla-atlas (`nabla-z15-package/1`).
 *
 * An Atlas cell directory `{base}/z/15/{x}/{y}/` already contains a standard
 * `nabla-planet-tile-v1` manifest, so the static loader reads it unchanged. This
 * module adds only what the loader cannot know:
 *
 *   manifest.json                      -> read as is (engine `native-xyz-v2` GLBs)
 *   manifest.z15Package                -> pointer to `z15-<hash>.json` (schema, size, SHA-256)
 *   z15-<hash>.json `files[]`          -> role -> file lookup, each with size and SHA-256
 *     role engine.terrain / engine.buildings -> manifest.files.terrain / 'buildings-osm' (identical)
 *     role terrain.lidar                      -> optional replacement for files.terrain
 *     role ground.composite / .lo             -> `manifest.photo` (orthophoto draped on the tile)
 *     role roads.asphalt / road.asphalt.candidate   -> `manifest.roads` (loaded/used even if `drivable: false`)
 *     role roads.supports / road.supports.candidate -> same; `engineLoad` is provenance, not a skip
 *     role roads.collision / road.collision.candidate -> inspect-only GLB; not loaded unless inspectRoadCollision
 *   manifest.roadCandidates (schema nabla-road-candidates/1) -> same `manifest.roads` mapping
 *     per layer, manifest.json wins; a disagreeing package file is that layer's `fallback`
 *   role osm.snapshot -> `manifest.osmSnapshot` (gzip Overpass cell; in-car GPS streets)
 *   manifest.cellVersion / package cellVersion -> must agree (absent = 1). Version 2 cells carry the
 *     roads and tunnel openings in the engine terrain, so `relief=lidar` keeps the engine terrain
 *     for them (the LiDAR mesh is the v1 ground and would close the tunnel mouths).
 *   every other role (masks, classes, instances, roofs, licences) is
 *   listed but not consumed by the engine yet; see docs/terrain-folder.md.
 *
 * Pure data: no DOM, no network. `fetchTileManifest` performs the (verified) fetches.
 */
import {
  readCandidateRoads,
  validatePlanetManifest,
  type PlanetCandidateRoadFile,
  type PlanetCandidateRoadKind,
  type PlanetCandidateRoads,
  planetCellVersion,
  type PlanetManifest,
  type PlanetPhoto,
  type PlanetZ15PackageRef,
} from './contract.js'
import { mapTileId, mapTilePath, type MapTile } from '../scene/mercator.js'

export const ATLAS_Z15_SCHEMA = 'nabla-z15-package/1'
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const SHA256 = /^[a-f0-9]{64}$/
/** A package JSON is metadata; refuse anything larger than 4 MiB before parsing. */
export const ATLAS_PACKAGE_MAX_BYTES = 4 * 1024 * 1024

export interface AtlasZ15File {
  path: string
  role: string
  bytes: number
  sha256: string
  mime?: string
  sizePx?: number
  level?: string
  frame?: string
  description?: string
}
export interface AtlasZ15Package {
  schema: typeof ATLAS_Z15_SCHEMA
  packageVersion: number
  /** Cell content version (absent = 1); must match the manifest's. */
  cellVersion?: number
  cell: { id: string; x: number; y: number; z: number }
  files: AtlasZ15File[]
  terrain: { engine: string; lidar?: string; note?: string }
  instances?: { count: number; file: string; types: string[] }
  engineCell?: { generator?: string; geometryRevision?: string }
  /** Optional publisher identity copied onto `manifest.roads`. */
  roads?: { revision?: string; recipe?: string; evidenceId?: string }
}

/** Package roles the engine maps onto `manifest.roads.files`. Atlas `#49` uses `road.*.candidate`. */
export const ATLAS_ROAD_ROLES: Record<PlanetCandidateRoadKind, readonly string[]> = {
  asphalt: ['road.asphalt.candidate', 'roads.asphalt', 'roads.asphalt-candidate'],
  supports: ['road.supports.candidate', 'roads.supports', 'roads.supports-candidate'],
  collision: ['road.collision.candidate', 'roads.collision', 'roads.collision-candidate'],
}

const ATLAS_CONSUMED_ROLES = new Set([
  'engine.terrain',
  'engine.buildings',
  'terrain.lidar',
  'ground.composite',
  'ground.composite.lo',
  'osm.snapshot',
  ...Object.values(ATLAS_ROAD_ROLES).flat(),
])
export interface AtlasZ15Options {
  /** `engine` (default): drivable engine terrain with roads. `lidar`: 2 m LiDAR mesh as ground. */
  relief?: 'engine' | 'lidar'
  /** Orthophoto resolution for the draped ground. `none` keeps vertex colours. Default `full`. */
  photo?: 'full' | 'lo' | 'none'
}

/** True for a safe file name inside the cell directory (no separators, no dot files). */
export function isAtlasFileName(name: unknown): name is string {
  return typeof name === 'string' && SAFE_NAME.test(name) && !name.includes('..')
}

/** Validate the `z15Package` pointer an Atlas manifest carries. Undefined for a plain engine tile. */
export function atlasPackageRef(manifest: PlanetManifest): PlanetZ15PackageRef | undefined {
  const ref = manifest.z15Package
  if (ref === undefined) return undefined
  if (
    !ref ||
    ref.schema !== ATLAS_Z15_SCHEMA ||
    !isAtlasFileName(ref.file) ||
    !SHA256.test(ref.sha256) ||
    !Number.isInteger(ref.bytes) ||
    ref.bytes < 2 ||
    ref.bytes > ATLAS_PACKAGE_MAX_BYTES ||
    ref.packageVersion !== 1
  )
    throw new Error('Invalid Atlas Z15 package reference')
  return ref
}

/** Strictly validate a parsed `nabla-z15-package/1` document against the tile it was fetched for. */
export function validateAtlasZ15Package(value: unknown, tile: MapTile): AtlasZ15Package {
  const p = value as AtlasZ15Package
  if (
    !p ||
    p.schema !== ATLAS_Z15_SCHEMA ||
    p.packageVersion !== 1 ||
    !p.cell ||
    p.cell.id !== mapTileId(tile) ||
    p.cell.x !== tile.x ||
    p.cell.y !== tile.y ||
    p.cell.z !== tile.z ||
    !Array.isArray(p.files) ||
    !p.terrain ||
    !isAtlasFileName(p.terrain.engine)
  )
    throw new Error('Invalid Atlas Z15 package')
  const seen = new Set<string>()
  for (const f of p.files) {
    if (
      !f ||
      !isAtlasFileName(f.path) ||
      typeof f.role !== 'string' ||
      !SHA256.test(f.sha256) ||
      !Number.isInteger(f.bytes) ||
      f.bytes < 0 ||
      seen.has(f.path)
    )
      throw new Error('Invalid Atlas Z15 package file entry')
    seen.add(f.path)
  }
  if (p.terrain.lidar !== undefined && !isAtlasFileName(p.terrain.lidar))
    throw new Error('Invalid Atlas Z15 package terrain')
  return p
}

/** First file of a role, or undefined. */
export function atlasFile(pkg: AtlasZ15Package, role: string): AtlasZ15File | undefined {
  return pkg.files.find((f) => f.role === role)
}

function atlasRoadFile(
  pkg: AtlasZ15Package,
  kind: PlanetCandidateRoadKind,
): AtlasZ15File | undefined {
  for (const role of ATLAS_ROAD_ROLES[kind]) {
    const file = atlasFile(pkg, role)
    if (file) return file
  }
  return undefined
}

function candidateFromAtlas(file: AtlasZ15File): PlanetCandidateRoadFile {
  return {
    path: file.path,
    download: file.path,
    bytes: file.bytes,
    sha256: file.sha256,
    drivable: false,
  }
}

function roadsFromPackage(pkg: AtlasZ15Package): PlanetCandidateRoads | undefined {
  const files: PlanetCandidateRoads['files'] = {}
  for (const kind of ['asphalt', 'supports', 'collision'] as const) {
    const file = atlasRoadFile(pkg, kind)
    if (file) files[kind] = candidateFromAtlas(file)
  }
  if (!files.asphalt && !files.supports && !files.collision) return undefined
  return {
    drivable: false,
    revision: pkg.roads?.revision,
    recipe: pkg.roads?.recipe,
    evidenceId: pkg.roads?.evidenceId,
    files,
  }
}

/**
 * Merge the roads named by manifest.json with the roads named by the package index, per layer.
 * manifest.json is switched last by the publisher, so its file wins; a package file that
 * disagrees becomes that layer's `fallback` (loaded if the manifest's file fails). A mismatch
 * never drops the cell's roads, and a layer only one side lists is kept.
 */
function mergeCandidateRoads(
  existing: PlanetCandidateRoads | undefined,
  fromPackage: PlanetCandidateRoads | undefined,
): PlanetCandidateRoads | undefined {
  if (!existing) return fromPackage
  if (!fromPackage) return existing
  const files: PlanetCandidateRoads['files'] = { ...fromPackage.files }
  const warnings = [...(existing.warnings ?? [])]
  for (const kind of ['asphalt', 'supports', 'collision'] as const) {
    const published = existing.files[kind]
    const packaged = fromPackage.files[kind]
    if (!published) continue
    if (packaged && (published.path !== packaged.path || published.sha256 !== packaged.sha256)) {
      warnings.push(`Atlas package roads.${kind} differs from manifest.json; kept as fallback`)
      files[kind] = { ...published, fallback: published.fallback ?? packaged }
    } else files[kind] = published
  }
  return {
    drivable: existing.drivable ?? fromPackage.drivable,
    revision: existing.revision ?? fromPackage.revision,
    recipe: existing.recipe ?? fromPackage.recipe,
    evidenceId: existing.evidenceId ?? fromPackage.evidenceId,
    evidenceSha256: existing.evidenceSha256 ?? fromPackage.evidenceSha256,
    engineLoad: existing.engineLoad ?? fromPackage.engineLoad,
    provenance: existing.provenance,
    files,
    ...(warnings.length ? { warnings } : {}),
  }
}

/**
 * Build the manifest the standard loader consumes. The input is not mutated.
 * The engine terrain/buildings listed by the package must be the very files the manifest
 * already names (same path and SHA-256), otherwise the package belongs to another cell revision.
 */
export function adaptAtlasManifest(
  manifest: PlanetManifest,
  pkg: AtlasZ15Package,
  options: AtlasZ15Options = {},
): PlanetManifest {
  const tile = manifest.tile
  const engineTerrain = atlasFile(pkg, 'engine.terrain')
  const engineBuildings = atlasFile(pkg, 'engine.buildings')
  if (
    !engineTerrain ||
    engineTerrain.path !== manifest.files.terrain.path ||
    engineTerrain.sha256 !== manifest.files.terrain.sha256 ||
    pkg.terrain.engine !== engineTerrain.path
  )
    throw new Error('Atlas package engine terrain does not match manifest.json')
  if (
    engineBuildings &&
    (engineBuildings.path !== manifest.files['buildings-osm'].path ||
      engineBuildings.sha256 !== manifest.files['buildings-osm'].sha256)
  )
    throw new Error('Atlas package engine buildings do not match manifest.json')
  const version = planetCellVersion(manifest)
  if ((pkg.cellVersion ?? 1) !== version)
    throw new Error(
      `Atlas package cell version ${pkg.cellVersion ?? 1} does not match manifest.json (${version})`,
    )
  const adapted: PlanetManifest = structuredClone(manifest)
  // v2 terrain already holds the roads and tunnel openings; the LiDAR mesh would undo them.
  if (options.relief === 'lidar' && version === 1) {
    const lidar = atlasFile(pkg, 'terrain.lidar')
    if (!lidar || lidar.path !== pkg.terrain.lidar)
      throw new Error('Atlas package has no LiDAR terrain (relief=lidar)')
    adapted.files.terrain = {
      path: lidar.path,
      download: lidar.path,
      bytes: lidar.bytes,
      sha256: lidar.sha256,
    }
  }
  // Read manifest.json roads in every published shape (roads, roadCandidates, files.roads-*).
  const roads = mergeCandidateRoads(readCandidateRoads(adapted), roadsFromPackage(pkg))
  if (roads) adapted.roads = roads
  const osm = atlasFile(pkg, 'osm.snapshot')
  if (osm)
    adapted.osmSnapshot = {
      path: osm.path,
      download: osm.path,
      bytes: osm.bytes,
      sha256: osm.sha256,
    }
  const quality = options.photo ?? 'full'
  if (quality !== 'none') {
    const file = atlasFile(pkg, quality === 'full' ? 'ground.composite' : 'ground.composite.lo')
    if (file?.sizePx && file.frame === 'cell')
      adapted.photo = {
        path: file.path,
        bytes: file.bytes,
        sha256: file.sha256,
        sizePx: file.sizePx,
        level: quality,
      } satisfies PlanetPhoto
  }
  // Re-run the engine's own validation on the result (path names, hashes, sizes).
  return validatePlanetManifest(adapted, tile)
}

/** Human-readable differences between an Atlas cell and what the engine produces itself. */
export function atlasCompatibilityNotes(
  manifest: PlanetManifest,
  pkg: AtlasZ15Package,
  currentRevision: string,
): string[] {
  const notes: string[] = []
  if (manifest.geometryRevision !== currentRevision)
    notes.push(
      `geometryRevision ${manifest.geometryRevision ?? '(none)'} is older than ${currentRevision}: ` +
        'static tiles cannot be regenerated, so the older GLB is rendered as published.',
    )
  if (!pkg.terrain.lidar)
    notes.push('no LiDAR terrain in this package; relief=lidar falls back to an error')
  const unused = [...new Set(pkg.files.map((f) => f.role))].filter(
    (r) => !ATLAS_CONSUMED_ROLES.has(r),
  )
  if (unused.length) notes.push(`roles listed but not consumed by the engine: ${unused.join(', ')}`)
  return notes
}

/** URL of the package JSON, next to manifest.json. */
export function atlasPackageUrl(tilesBase: string, tile: MapTile, ref: PlanetZ15PackageRef) {
  return `${tilesBase.replace(/\/+$/, '')}/${mapTilePath(tile)}/${ref.file}`
}
/** URL of a file inside the cell directory. */
export function atlasFileUrl(tilesBase: string, tile: MapTile, name: string): string {
  if (!isAtlasFileName(name)) throw new Error('Unsafe Atlas file name')
  return `${tilesBase.replace(/\/+$/, '')}/${mapTilePath(tile)}/${name}`
}

/**
 * Photo quality for one cell: the wanted quality near the player, the small `lo` photo farther away
 * (16x fewer pixels to download, decode and keep on the GPU). `none` and `lo` are never upgraded.
 */
export function atlasPhotoFor(
  wanted: NonNullable<AtlasZ15Options['photo']>,
  tile: MapTile,
  focus: MapTile | undefined,
  nearCells = 1,
): NonNullable<AtlasZ15Options['photo']> {
  if (wanted !== 'full' || !focus) return wanted
  return Math.max(Math.abs(tile.x - focus.x), Math.abs(tile.y - focus.y)) <= nearCells
    ? 'full'
    : 'lo'
}
