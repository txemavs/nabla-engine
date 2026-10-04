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
 *   every other role (masks, classes, instances, roofs, OSM snapshot, licences) is
 *   listed but not consumed by the engine yet; see docs/atlas-z15-terrain.md.
 *
 * Pure data: no DOM, no network. `fetchTileManifest` performs the (verified) fetches.
 */
import {
  validatePlanetManifest,
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
  cell: { id: string; x: number; y: number; z: number }
  files: AtlasZ15File[]
  terrain: { engine: string; lidar?: string; note?: string }
  instances?: { count: number; file: string; types: string[] }
  engineCell?: { generator?: string; geometryRevision?: string }
}
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
  const adapted: PlanetManifest = structuredClone(manifest)
  if (options.relief === 'lidar') {
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
    (r) =>
      !['engine.terrain', 'engine.buildings', 'terrain.lidar', 'ground.composite'].includes(r) &&
      r !== 'ground.composite.lo',
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
