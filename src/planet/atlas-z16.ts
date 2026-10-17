/** Normalize Atlas split Z16 cells into the shared Engine render/physics delivery contract. */
import { mapTileBounds, mapTileId, mapTileSample, type MapTile } from '../scene/mercator.js'
import type { PlanetManifest, PlanetLayerFile, PlanetGlbLayer } from './contract.js'

export const ATLAS_Z16_SCHEMA = 'atlas-z16-cell/1'

/** Only publication-local assets are accepted; the host proxy prefix is retained. */
export function adaptAtlasZ16(value: unknown, tile: MapTile, baseUrl: string): PlanetManifest {
  const m = value as any
  const anchor = mapTileSample(tile, 1, 1, 2)
  if (
    m?.schema !== ATLAS_Z16_SCHEMA ||
    tile.z !== 16 ||
    !Array.isArray(m.tile) ||
    m.tile.length !== 3 ||
    m.tile.some((n: unknown, i: number) => n !== [tile.z, tile.x, tile.y][i]) ||
    m.axes !== 'x-east,y-up,z-south' ||
    !m.origin ||
    Object.entries(anchor).some(
      ([key, n]) => !Number.isFinite(m.origin[key]) || Math.abs(m.origin[key] - n) > 1e-9,
    ) ||
    typeof m.revision !== 'string' ||
    !/^[a-zA-Z0-9-]+$/.test(m.revision) ||
    !Array.isArray(m.files)
  )
    throw new Error('Invalid Atlas Z16 cell identity or origin')
  const prefix = `/api/atlas/geo/z16/${m.revision}/assets/${tile.x}-${tile.y}/`
  const file = (f: any): PlanetLayerFile => {
    if (
      !f ||
      typeof f.url !== 'string' ||
      !f.url.startsWith(prefix) ||
      !/^[a-zA-Z0-9._-]+$/.test(f.url.slice(prefix.length)) ||
      !Number.isSafeInteger(f.bytes) ||
      f.bytes < 0 ||
      typeof f.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(f.sha256)
    )
      throw new Error('Invalid Atlas Z16 asset reference')
    const name = f.url.slice(prefix.length)
    return {
      path: name,
      download: name,
      bytes: f.bytes,
      sha256: f.sha256,
      url: baseUrl.replace(/\/+$/, '') + f.url,
    }
  }
  const roles = new Map<string, PlanetLayerFile>()
  for (const f of m.files) {
    if (typeof f.role !== 'string' || roles.has(f.role))
      throw new Error('Duplicate Atlas Z16 layer')
    if (
      !['terrain', 'buildings', 'roads', 'decks', 'tunnelfloor', 'supports', 'bridgefill'].includes(
        f.role,
      )
    )
      throw new Error('Unsupported Atlas Z16 layer')
    const ref = file(f)
    if (!ref.path.endsWith('.glb')) throw new Error('Invalid Atlas Z16 GLB')
    roles.set(f.role, ref)
  }
  const terrain = roles.get('terrain'),
    buildings = roles.get('buildings')
  if (!terrain || !buildings) throw new Error('Atlas Z16 requires terrain and buildings')
  const layers: PlanetGlbLayer[] = []
  for (const role of ['roads', 'decks', 'tunnelfloor', 'supports', 'bridgefill']) {
    const ref = roles.get(role)
    if (ref)
      layers.push({
        name: `atlas-${role}`,
        ...(role === 'roads' ? { chartOnly: true } : {}),
        kind: role === 'supports' || role === 'bridgefill' ? 'supports' : 'asphalt',
        file: ref,
      })
  }
  return {
    format: 'nabla-planet-tile-v1',
    generator: 'native-xyz-v2',
    id: mapTileId(tile),
    tile: { ...tile },
    anchor: { ...anchor },
    bounds: mapTileBounds(tile),
    // Terrain includes ground roads. Separate roads feed GPS only; decks/tunnels remain physical.
    cellVersion: 1,
    files: { terrain, 'buildings-osm': buildings },
    atlasZ16: { revision: m.revision, drivable: m.drivable === true },
    additionalLayers: layers,
    ...(m.instances ? { instances: file(m.instances) } : {}),
  }
}

/** Z16 sidecars retain parent `local`; `position` is the published child-local coordinate. */
export function adaptAtlasZ16Instances(value: unknown): { instances: Record<string, unknown>[] } {
  if (!Array.isArray(value)) throw new Error('Invalid Atlas Z16 instances')
  return {
    instances: value.slice(0, 20000).flatMap((row) => {
      if (
        !row ||
        typeof row !== 'object' ||
        !Array.isArray(row.position) ||
        row.position.length !== 3 ||
        !row.position.every((n: unknown) => typeof n === 'number' && Number.isFinite(n))
      )
        return []
      return [{ ...row, local: [...row.position] }]
    }),
  }
}
