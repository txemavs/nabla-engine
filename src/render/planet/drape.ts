/**
 * Ground-photo drape geometry: the triangles of a cell's ground, roads, roofs and land-use surfaces,
 * lifted a hair and given planar UVs so one orthophoto of the cell can be painted over all of them.
 *
 * Pure typed-array code with no THREE or DOM, so it runs in the streaming worker. It used to run on
 * the main thread at install time and cost ~140 ms of frame time per cell.
 */

/** One drape layer. `ground` is the land-use `groundLayer` it paints; roads/terrain are special-cased. */
export interface DrapeLayer {
  id: string
  ground?: number
  roads?: boolean
  terrain?: boolean
}
export const DRAPE_LAYERS: readonly DrapeLayer[] = [
  { id: 'farmland', ground: 4 },
  { id: 'forest', ground: 5 },
  { id: 'scrub', ground: 6 },
  { id: 'wetland', ground: 7 },
  { id: 'rock', ground: 8 },
  { id: 'sand', ground: 9 },
  { id: 'grass', ground: 10 },
  { id: 'water', ground: 11 },
  { id: 'residential', ground: 2 },
  { id: 'industrial', ground: 3 },
  { id: 'terrain', terrain: true },
  { id: 'roads', roads: true },
]

/** Roof photos float a hand above the roof; ground photos must not (see `world.ts`). */
export const ROOF_DRAPE_LIFT = 0.15
export const GROUND_DRAPE_LIFT = 0.005

/** The mesh data a drape is cut from (a subset of `PlanetMesh`). */
export interface DrapeSource {
  name: string
  position: Float32Array
  normal: Float32Array
  index?: Uint32Array | Uint16Array
  metadata: Record<string, any>
}
export interface DrapeGeometry {
  /** Layer id: `roofs`, `runways`, `pitches`, `roads`, `terrain` or a land-use id. */
  id: string
  position: Float32Array
  uv: Float32Array
}

/** Which drape layer a source mesh feeds, and whether it is a roof (steep faces are skipped). */
function layerOf(mesh: DrapeSource): { id: string; roofs: boolean } | undefined {
  const m = mesh.metadata
  if (m.skirt || mesh.name === 'Drape') return undefined
  switch (m.category) {
    case 'Buildings':
      return { id: 'roofs', roofs: true }
    case 'Aeroway':
      return { id: 'runways', roofs: false }
    case 'Pitch':
      return { id: 'pitches', roofs: false }
    case 'Roads':
      return { id: 'roads', roofs: false }
    case 'Terrain':
      return { id: 'terrain', roofs: false }
  }
  const layer = DRAPE_LAYERS.find(
    (item) => item.ground !== undefined && item.ground === m.groundLayer,
  )
  return layer ? { id: layer.id, roofs: false } : undefined
}

/**
 * Cut the drape triangles. `layers` are the projected layer ids; `baked` ids already carry their own
 * textured drape in the GLB and are skipped. `width` is the cell's ground width in metres.
 */
export function buildDrapes(
  meshes: readonly DrapeSource[],
  options: { width: number; layers: ReadonlySet<string>; baked?: ReadonlySet<string> },
): DrapeGeometry[] {
  const { width, layers, baked } = options
  const sources = new Map<string, { mesh: DrapeSource; roofs: boolean }[]>()
  for (const mesh of meshes) {
    const layer = layerOf(mesh)
    if (!layer || !layers.has(layer.id) || baked?.has(layer.id)) continue
    const list = sources.get(layer.id) ?? []
    list.push({ mesh, roofs: layer.roofs })
    sources.set(layer.id, list)
  }
  const out: DrapeGeometry[] = []
  for (const [id, list] of sources) {
    // First pass keeps the kept triangles' corner ids, so the arrays are allocated once.
    let corners = 0
    const kept = list.map(({ mesh, roofs }) => {
      const count = mesh.index ? mesh.index.length : mesh.position.length / 3
      const keep = new Uint8Array(Math.floor(count / 3))
      const n = mesh.normal
      for (let t = 0; t < keep.length; t++) {
        const a = mesh.index ? mesh.index[t * 3] : t * 3,
          b = mesh.index ? mesh.index[t * 3 + 1] : t * 3 + 1,
          c = mesh.index ? mesh.index[t * 3 + 2] : t * 3 + 2
        if (roofs && (n[a * 3 + 1] + n[b * 3 + 1] + n[c * 3 + 1]) / 3 < 0.55) continue
        keep[t] = 1
        corners += 3
      }
      return keep
    })
    if (!corners) continue
    const position = new Float32Array(corners * 3),
      uv = new Float32Array(corners * 2)
    let v = 0
    list.forEach(({ mesh, roofs }, i) => {
      const p = mesh.position,
        lift = roofs ? ROOF_DRAPE_LIFT : GROUND_DRAPE_LIFT
      const keep = kept[i]
      for (let t = 0; t < keep.length; t++) {
        if (!keep[t]) continue
        for (let k = 0; k < 3; k++) {
          const c = mesh.index ? mesh.index[t * 3 + k] : t * 3 + k
          const x = p[c * 3],
            y = p[c * 3 + 1],
            z = p[c * 3 + 2]
          position[v * 3] = x
          position[v * 3 + 1] = y + lift
          position[v * 3 + 2] = z
          uv[v * 2] = 0.5 + x / width
          uv[v * 2 + 1] = 0.5 - z / width
          v++
        }
      }
    })
    out.push({ id, position, uv })
  }
  return out
}
