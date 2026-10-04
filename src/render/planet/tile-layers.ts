/**
 * Toggleable layers of a planet tile. A layer is a named group of the tile's meshes (by their
 * `category`) and of its photo drapes (by drape id). Hiding a layer only hides it: terrain
 * collision is untouched, so driving works the same with the road drawn or not.
 */
export interface TileLayer {
  id: string
  /** Spanish label shown to the player. */
  label: string
  /** Mesh `userData.category` values that belong to the layer. */
  categories: readonly string[]
  /** Photo drape ids (`userData.drape` of 'Drape' meshes) that belong to the layer. */
  drapes: readonly string[]
}

/** Draw order of the selector. The first layer is the road, drawn on top of the ground photo. */
export const TILE_LAYERS: readonly TileLayer[] = [
  { id: 'road', label: 'Carretera', categories: ['Roads'], drapes: ['roads'] },
  { id: 'buildings', label: 'Edificios y techos', categories: ['Buildings'], drapes: ['roofs'] },
  {
    id: 'photo',
    label: 'Foto del suelo',
    categories: [],
    drapes: [
      'terrain',
      'farmland',
      'forest',
      'scrub',
      'wetland',
      'rock',
      'sand',
      'grass',
      'residential',
      'industrial',
      'runways',
      'pitches',
    ],
  },
]

const hidden = new Set<string>()

/** Ids of the layers currently hidden (a copy). */
export function hiddenTileLayers(): string[] {
  return [...hidden]
}

/** Replace the hidden set. Unknown ids are ignored, so a stale stored choice cannot break a tile. */
export function setHiddenTileLayers(ids: Iterable<string>): void {
  hidden.clear()
  for (const id of ids) if (TILE_LAYERS.some((layer) => layer.id === id)) hidden.add(id)
}

/** True when a mesh's metadata puts it in a hidden layer. */
export function tileMeshHidden(metadata: { category?: unknown; drape?: unknown }): boolean {
  if (!hidden.size) return false
  return TILE_LAYERS.some(
    (layer) =>
      hidden.has(layer.id) &&
      ((typeof metadata.drape === 'string' && layer.drapes.includes(metadata.drape)) ||
        (typeof metadata.category === 'string' && layer.categories.includes(metadata.category))),
  )
}

/**
 * Parse `-road,-photo` (hide) / `road` or `+road` (show) into the hidden ids, starting from `base`.
 * `none` hides every layer and `all` shows them all. Unknown names are ignored.
 */
export function parseLayerSpec(
  spec: string | null | undefined,
  base: Iterable<string> = [],
): string[] {
  const out = new Set(base)
  for (const raw of (spec ?? '').split(',')) {
    const token = raw.trim().toLowerCase()
    if (!token) continue
    if (token === 'none') TILE_LAYERS.forEach((layer) => out.add(layer.id))
    else if (token === 'all') out.clear()
    else if (token.startsWith('-') && TILE_LAYERS.some((l) => l.id === token.slice(1)))
      out.add(token.slice(1))
    else {
      const id = token.replace(/^\+/, '')
      if (TILE_LAYERS.some((l) => l.id === id)) out.delete(id)
    }
  }
  return TILE_LAYERS.filter((layer) => out.has(layer.id)).map((layer) => layer.id)
}

/** Inverse of `parseLayerSpec` for URLs: `-road,-photo`, or '' when everything is shown. */
export function formatLayerSpec(hiddenIds: Iterable<string>): string {
  const set = new Set(hiddenIds)
  return TILE_LAYERS.filter((layer) => set.has(layer.id))
    .map((layer) => '-' + layer.id)
    .join(',')
}

/** Minimal storage surface (a `Storage`, or a stub in tests). */
export interface LayerStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Stored choice; a broken or unavailable store behaves as "everything shown". */
export function loadHiddenLayers(storage: LayerStorage | undefined, key: string): string[] {
  try {
    return parseLayerSpec(storage?.getItem(key), [])
  } catch {
    return []
  }
}

export function saveHiddenLayers(
  storage: LayerStorage | undefined,
  key: string,
  hiddenIds: Iterable<string>,
): void {
  try {
    storage?.setItem(key, formatLayerSpec(hiddenIds))
  } catch {
    // Private mode or a full quota: the choice just does not persist.
  }
}
