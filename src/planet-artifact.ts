import type { PlanetPlace } from './planet-places.js'
import { mapTileBounds, mapTileId, mapTileSample, type MapTile } from './map-tiles.js'
import type { GeoPoint } from './geography.js'
import type { PlanetCollisionChunk } from './planet-collisions.js'
export interface PlanetManifest {
  places?: PlanetPlace[]
  format: 'nabla-planet-tile-v1'
  generator: 'native-xyz-v2'
  geometryRevision?: 'native-surfaces-v2'
  id: string
  tile: MapTile
  anchor: GeoPoint
  bounds: ReturnType<typeof mapTileBounds>
  files: Record<
    'terrain' | 'buildings-osm',
    { path: string; download: string; bytes: number; sha256: string }
  >
}
export interface PlanetMesh {
  name: string
  position: Float32Array
  normal: Float32Array
  color?: Float32Array
  index?: Uint32Array
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
      !new RegExp(`^${name}-[a-f0-9]{16}\\.glb$`).test(f.path) ||
      !/^[a-f0-9]{64}$/.test(f.sha256) ||
      !Number.isInteger(f.bytes) ||
      f.bytes < 20 ||
      f.bytes > 64 * 1024 * 1024
    )
      throw Error('Invalid planet layer')
  }
  return m
}
/** Each triangle belongs to one chunk only. The chunk bounds include the whole triangle. */
export function planetCollisionChunks(meshes: PlanetMesh[]): PlanetCollisionChunk[] {
  const groups = new Map<string, { values: number[]; bounds: number[]; buildings: boolean }>()
  for (const mesh of meshes) {
    const category = mesh.metadata.category
    if (!['Terrain', 'Roads', 'Buildings'].includes(category)) continue
    if (mesh.metadata.skirt) continue
    const buildings = category === 'Buildings'
    const count = mesh.index?.length ?? mesh.position.length / 3
    for (let i = 0; i < count; i += 3) {
      const p: number[] = []
      for (let j = 0; j < 3; j++) {
        const k = (mesh.index?.[i + j] ?? i + j) * 3
        p.push(...mesh.position.subarray(k, k + 3))
      }
      const x = (p[0] + p[3] + p[6]) / 3,
        z = (p[2] + p[5] + p[8]) / 3
      const key = `${buildings ? 'b' : 'g'}/${Math.floor(x / 32)}/${Math.floor(z / 32)}`
      let group = groups.get(key)
      if (!group) {
        group = {
          values: [],
          bounds: [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity],
          buildings,
        }
        groups.set(key, group)
      }
      group.values.push(...p)
      for (let j = 0; j < 9; j++) {
        const axis = j % 3
        group.bounds[axis] = Math.min(group.bounds[axis], p[j])
        group.bounds[axis + 3] = Math.max(group.bounds[axis + 3], p[j])
      }
    }
  }
  return [...groups].map(([key, g]) => ({
    key,
    buildings: g.buildings,
    bounds: g.bounds as PlanetCollisionChunk['bounds'],
    triangles: new Float32Array(g.values),
  }))
}
