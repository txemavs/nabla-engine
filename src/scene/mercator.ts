/**
 * OGC WebMercatorQuad, XYZ addressing with north-origin rows.
 *
 * This is the streamed scene grid. It is independent of a scene origin and of the
 * published GLB frame in `planet/tiles.ts`.
 */

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

const publishedStem = { terrain: 'terra', 'buildings-osm': 'build' } as const

/** Stored GLB name. The stamp is UTC, to the minute, so a later publish is a different file. */
export function publishedGlbName(
  tile: MapTile,
  layer: 'terrain' | 'buildings-osm',
  at: Date,
): string {
  validate(tile)
  if (Number.isNaN(at.getTime())) throw Error('Invalid publish time')
  const stamp = at.toISOString().replace(/\D/g, '').slice(0, 12)
  return `${publishedStem[layer]}-${tile.z}-${tile.x}-${tile.y}-${stamp}.glb`
}
/** A stored GLB: the readable stamp, or a hash name from before that stamp existed. */
export function isPublishedGlbPath(
  tile: MapTile,
  layer: 'terrain' | 'buildings-osm',
  path: string,
): boolean {
  return (
    new RegExp(`^${layer}-[a-f0-9]{16}\\.glb$`).test(path) ||
    new RegExp(`^${publishedStem[layer]}-${tile.z}-${tile.x}-${tile.y}-\\d{12}\\.glb$`).test(path)
  )
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

/** Geographic center of a tile. */
export function tileCenterGeo(tile: MapTile): { latitude: number; longitude: number } {
  const bounds = mapTileBounds(tile)
  return {
    latitude: (bounds.north + bounds.south) / 2,
    longitude: (bounds.west + bounds.east) / 2,
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
  /** Zoom 15 only. Zoom 14 and 13 are photos, not meshes. */
  requests: MapTile[]
  budgetLimited: boolean
}
/** z15 GLBs inside the draw distance. Coarser zooms are photographs of those meshes. */
export function planMapZooms(options: {
  latitude: number
  longitude: number
  heightAboveGround: number
  viewDistance: number
  maxTiles?: number
  adaptive?: boolean
}): MapZoomPlan {
  const { latitude, longitude, viewDistance } = options
  const budget = options.maxTiles ?? 96
  if (
    !Number.isFinite(options.heightAboveGround) ||
    !Number.isFinite(viewDistance) ||
    viewDistance <= 0 ||
    !Number.isInteger(budget) ||
    budget < 1 ||
    budget > 512
  )
    throw Error('Invalid map streaming budget')
  if (options.adaptive)
    return adaptiveMapPlan(
      options.latitude,
      options.longitude,
      options.heightAboveGround,
      viewDistance,
      budget,
    )
  const center = mapTileAt(latitude, longitude, 15)
  const width = mapTileGroundWidth(latitude, 15)
  const n = 2 ** 15
  const px = (((((longitude + 180) % 360) + 360) % 360) / 360) * n
  const py = ((1 - Math.asinh(Math.tan(latitude * radians)) / Math.PI) / 2) * n
  const distance = (tile: MapTile) => {
    const dx = Math.min(Math.abs(tile.x + 0.5 - px), n - Math.abs(tile.x + 0.5 - px))
    return Math.hypot(Math.max(0, dx - 0.5), Math.max(0, Math.abs(tile.y + 0.5 - py) - 0.5)) * width
  }
  // Bound candidate enumeration even with an accidentally planetary draw distance.
  const span = Math.min(48, Math.ceil(viewDistance / width) + 1)
  const candidates: MapTile[] = []
  for (let dy = -span; dy <= span; dy++)
    for (let dx = -span; dx <= span; dx++) {
      const y = center.y + dy
      if (y < 0 || y >= n) continue
      const tile = { z: 15, x: (center.x + dx + n) % n, y }
      if (distance(tile) <= viewDistance) candidates.push(tile)
    }
  candidates.sort((a, b) => distance(a) - distance(b) || a.y - b.y || a.x - b.x)
  const roots = candidates.slice(0, budget)
  return {
    roots,
    leaves: roots,
    requests: roots,
    budgetLimited: roots.length < candidates.length || viewDistance / width > 31,
  }
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

/** Progressive first paint, but an existing parent remains until every child is complete. */
export function planetReadyCover(plan: MapZoomPlan, ready: ReadonlySet<string>): MapTile[] {
  const wanted = new Set(plan.requests.map(mapTileId))
  const visit = (tile: MapTile): { tiles: MapTile[]; complete: boolean } => {
    const children = tile.z < 15 ? mapTileChildren(tile) : []
    const covers =
      children.length && children.every((c) => wanted.has(mapTileId(c))) ? children.map(visit) : []
    if (covers.length && covers.every((c) => c.complete))
      return { tiles: covers.flatMap((c) => c.tiles), complete: true }
    if (ready.has(mapTileId(tile))) return { tiles: [tile], complete: true }
    return { tiles: covers.flatMap((c) => c.tiles), complete: false }
  }
  return plan.roots.flatMap((t) => visit(t).tiles)
}

/** Mixed visual coverage. Ancestors remain requested until complete children can replace them. */
function adaptiveMapPlan(
  latitude: number,
  longitude: number,
  height: number,
  distance: number,
  budget: number,
): MapZoomPlan {
  const center = mapTileAt(latitude, longitude, 13),
    width = mapTileGroundWidth(latitude, 13),
    n = 2 ** 13
  const candidates: MapTile[] = []
  const span = Math.min(24, Math.ceil(distance / width) + 1)
  const groundDistance = (tile: MapTile) => {
    const b = mapTileBounds(tile),
      lon = (b.west + b.east) / 2,
      lat = (b.north + b.south) / 2
    const dx =
      ((Math.min(Math.abs(lon - longitude), 360 - Math.abs(lon - longitude)) * Math.PI) / 180) *
      radius *
      Math.cos((latitude * Math.PI) / 180)
    const dy = (((lat - latitude) * Math.PI) / 180) * radius
    return Math.max(0, Math.hypot(dx, dy) - mapTileGroundWidth(latitude, tile.z) * 0.71)
  }
  for (let dy = -span; dy <= span; dy++)
    for (let dx = -span; dx <= span; dx++) {
      const y = center.y + dy
      if (y < 0 || y >= n) continue
      const tile = { z: 13, x: (center.x + dx + n) % n, y }
      if (groundDistance(tile) <= distance) candidates.push(tile)
    }
  candidates.sort((a, b) => groundDistance(a) - groundDistance(b))
  const roots = candidates.slice(0, Math.max(1, Math.floor(budget / 3)))
  const requests = [...roots],
    leaves = [...roots]
  const near = Math.max(500, Math.min(2000, distance * 0.3))
  while (requests.length + 4 <= budget) {
    const next = leaves
      .filter(
        (tile) =>
          tile.z < 15 &&
          Math.hypot(groundDistance(tile), height) <
            (tile.z === 13 ? Math.max(near * 2, distance * 0.65) : near),
      )
      .sort((a, b) => groundDistance(a) - groundDistance(b))[0]
    if (!next) break
    const children = mapTileChildren(next)
    leaves.splice(leaves.indexOf(next), 1, ...children)
    requests.push(...children)
  }
  return {
    roots,
    leaves,
    requests,
    budgetLimited: roots.length < candidates.length || requests.length + 4 > budget,
  }
}
