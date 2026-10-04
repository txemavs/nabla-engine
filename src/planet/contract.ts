/**
 * Published planet tile: the GLB manifest and the collision chunk shape.
 * Labels live in `places.ts`. The metre frame and the source grid live in `tiles.ts`.
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
  files: Record<
    'terrain' | 'buildings-osm',
    { path: string; download: string; bytes: number; sha256: string }
  >
  /** Present when an external producer (nabla-atlas) published a Z15 package next to this manifest. */
  z15Package?: PlanetZ15PackageRef
  /**
   * Orthophoto draped over the tile (the compatibility composite of an Atlas package).
   * Set only by the Atlas adapter; the standard preparation service never writes it.
   */
  photo?: PlanetPhoto
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
    const f = m.files?.[name]
    if (
      !f ||
      !isPublishedGlbPath(tile, name, f.path) ||
      !/^[a-f0-9]{64}$/.test(f.sha256) ||
      !Number.isInteger(f.bytes) ||
      f.bytes < 20 ||
      f.bytes > 64 * 1024 * 1024
    )
      throw Error('Invalid planet layer')
  }
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
