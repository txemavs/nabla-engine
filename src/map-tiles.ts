/** OGC WebMercatorQuad, XYZ addressing (north-origin rows), independent of scene frames. */
export interface MapTile {
  z: number
  x: number
  y: number
}
export const MAP_TILE_MATRIX = 'WebMercatorQuad'
export const MAP_ZOOMS = [15, 14, 13] as const
export const MERCATOR_LIMIT = 85.0511287798066
const radius = 6378137
const circumference = 2 * Math.PI * radius
const radians = Math.PI / 180

function validate(tile: MapTile): void {
  const { z, x, y } = tile
  if (
    !Number.isInteger(z) ||
    z < 0 ||
    z > 22 ||
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= 2 ** z ||
    y >= 2 ** z
  )
    throw Error('Invalid WebMercatorQuad tile')
}
export function mapTileId(tile: MapTile): string {
  validate(tile)
  return `${MAP_TILE_MATRIX}/${tile.z}/${tile.x}/${tile.y}`
}
export function parseMapTileId(id: string): MapTile {
  const match = /^WebMercatorQuad\/(\d+)\/(\d+)\/(\d+)$/.exec(id)
  if (!match) throw Error('Invalid tile ID')
  const tile = { z: Number(match[1]), x: Number(match[2]), y: Number(match[3]) }
  if (mapTileId(tile) !== id) throw Error('Noncanonical tile ID')
  return tile
}
/** Stable storage address. Scene origins and generator revisions never change identity. */
export function mapTilePath(tile: MapTile): string {
  validate(tile)
  return `z/${tile.z}/${tile.x}/${tile.y}`
}
export function parseMapTilePath(path: string): MapTile {
  if (!/^z\/\d+\/\d+\/\d+$/.test(path)) throw Error('Invalid tile path')
  const tile = parseMapTileId(path.replace(/^z\//, `${MAP_TILE_MATRIX}/`))
  if (mapTilePath(tile) !== path) throw Error('Noncanonical tile path')
  return tile
}
/** Unambiguous filenames when an asset is downloaded outside its directory. */
export function mapTileFilename(tile: MapTile, layer: 'terrain' | 'buildings-osm'): string {
  validate(tile)
  return `earth-WebMercatorQuad-z${tile.z}-x${tile.x}-y${tile.y}-${layer}.glb`
}
/** Exact shared sample lattice, including parent/child edges and the antimeridian. */
export function mapTileSample(tile: MapTile, column: number, row: number, segments: number) {
  validate(tile)
  if (
    !Number.isInteger(segments) ||
    segments < 1 ||
    segments > 256 ||
    !Number.isInteger(column) ||
    !Number.isInteger(row) ||
    column < 0 ||
    row < 0 ||
    column > segments ||
    row > segments
  )
    throw Error('Invalid tile sample')
  const n = 2 ** tile.z * segments
  return {
    longitude: ((tile.x * segments + column) / n) * 360 - 180,
    latitude: Math.atan(Math.sinh(Math.PI * (1 - (2 * (tile.y * segments + row)) / n))) / radians,
    altitude: 0,
  }
}
export function mapTileAt(latitude: number, longitude: number, z: number): MapTile {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > MERCATOR_LIMIT
  )
    throw Error('Position outside WebMercatorQuad; polar coverage needs a separate matrix')
  validate({ z, x: 0, y: 0 })
  const n = 2 ** z
  const wrapped = (((longitude + 180) % 360) + 360) % 360
  return {
    z,
    x: Math.min(n - 1, Math.floor((wrapped / 360) * n)),
    y: Math.max(
      0,
      Math.min(
        n - 1,
        Math.floor(((1 - Math.asinh(Math.tan(latitude * radians)) / Math.PI) / 2) * n),
      ),
    ),
  }
}
export function mapTileBounds(tile: MapTile) {
  validate(tile)
  const n = 2 ** tile.z
  const latitude = (row: number) => Math.atan(Math.sinh(Math.PI * (1 - (2 * row) / n))) / radians
  return {
    west: (tile.x / n) * 360 - 180,
    east: ((tile.x + 1) / n) * 360 - 180,
    north: latitude(tile.y),
    south: latitude(tile.y + 1),
  }
}
export function mapTileChildren(tile: MapTile): MapTile[] {
  validate(tile)
  if (tile.z === 22) throw Error('Maximum supported zoom')
  return [0, 1, 2, 3].map((i) => ({
    z: tile.z + 1,
    x: tile.x * 2 + (i % 2),
    y: tile.y * 2 + Math.floor(i / 2),
  }))
}
export function mapTileParent(tile: MapTile): MapTile | undefined {
  validate(tile)
  return tile.z
    ? { z: tile.z - 1, x: Math.floor(tile.x / 2), y: Math.floor(tile.y / 2) }
    : undefined
}
/** Local ground scale, not a constant tile width in physical metres. */
export function mapTileGroundWidth(latitude: number, z: number): number {
  mapTileAt(latitude, 0, z)
  return (circumference * Math.cos(latitude * radians)) / 2 ** z
}
export interface MapZoomPlan {
  roots: MapTile[]
  leaves: MapTile[]
  /** Parents first: a complete coarse cover must be available before refinement. */
  requests: MapTile[]
  budgetLimited: boolean
}
/** Three spatial zooms with a bounded quadtree, not three qualities of the same footprint. */
export function planMapZooms(options: {
  latitude: number
  longitude: number
  heightAboveGround: number
  viewDistance: number
  maxTiles?: number
}): MapZoomPlan {
  const { latitude, longitude, heightAboveGround, viewDistance } = options
  const budget = options.maxTiles ?? 96
  if (
    !Number.isFinite(heightAboveGround) ||
    !Number.isFinite(viewDistance) ||
    viewDistance <= 0 ||
    !Number.isInteger(budget) ||
    budget < 1 ||
    budget > 512
  )
    throw Error('Invalid map streaming budget')
  const center = mapTileAt(latitude, longitude, 13)
  const width = mapTileGroundWidth(latitude, 13)
  const n = 2 ** 13
  const px = (((((longitude + 180) % 360) + 360) % 360) / 360) * n
  const py = ((1 - Math.asinh(Math.tan(latitude * radians)) / Math.PI) / 2) * n
  const distance = (tile: MapTile) => {
    const scale = 2 ** (tile.z - 13)
    const cx = (tile.x + 0.5) / scale
    const dx = Math.min(Math.abs(cx - px), n - Math.abs(cx - px))
    return (
      Math.hypot(
        Math.max(0, dx - 0.5 / scale),
        Math.max(0, Math.abs((tile.y + 0.5) / scale - py) - 0.5 / scale),
      ) * width
    )
  }
  // Bound candidate enumeration even with an accidentally planetary draw distance.
  const span = Math.min(32, Math.ceil(viewDistance / width) + 1)
  const candidates: MapTile[] = []
  for (let dy = -span; dy <= span; dy++)
    for (let dx = -span; dx <= span; dx++) {
      const y = center.y + dy
      if (y < 0 || y >= n) continue
      const tile = { z: 13, x: (center.x + dx + n) % n, y }
      if (distance(tile) <= viewDistance) candidates.push(tile)
    }
  candidates.sort((a, b) => distance(a) - distance(b) || a.y - b.y || a.x - b.x)
  // Reserve room for refinement, but retain at least one coarse tile.
  const roots = candidates.slice(0, Math.max(1, Math.floor(budget / 4)))
  const leaves = [...roots]
  const requests = [...roots]
  let budgetLimited = roots.length < candidates.length || viewDistance / width > 31
  while (true) {
    const refinable = leaves.filter(
      (t) =>
        t.z < 15 &&
        Math.hypot(distance(t), Math.max(0, heightAboveGround)) < (t.z === 13 ? 3000 : 1000),
    )
    refinable.sort((a, b) => a.z - b.z || distance(a) - distance(b))
    if (!refinable.length) break
    if (leaves.length + 3 > budget) {
      budgetLimited = true
      break
    }
    const tile = refinable[0]
    const children = mapTileChildren(tile)
    leaves.splice(leaves.indexOf(tile), 1, ...children)
    requests.push(...children)
  }
  return { roots, leaves, requests, budgetLimited }
}
/** Atomic parent replacement. Never display a parent and descendants together. */
export function readyMapCover(plan: MapZoomPlan, ready: ReadonlySet<string>): MapTile[] {
  const wanted = new Set(plan.requests.map(mapTileId))
  const visit = (tile: MapTile): MapTile[] | undefined => {
    const children = tile.z < 15 ? mapTileChildren(tile) : []
    if (children.length && children.every((child) => wanted.has(mapTileId(child)))) {
      const covers = children.map(visit)
      if (covers.every((cover) => cover !== undefined)) return covers.flat() as MapTile[]
    }
    return ready.has(mapTileId(tile)) ? [tile] : undefined
  }
  return plan.roots.flatMap((root) => visit(root) ?? [])
}
