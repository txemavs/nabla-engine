import type { Entity, SceneDocument } from './scene.js'

export function mapTileEntities(doc: SceneDocument, key: string): Entity[] {
  const suffix = key === '0_0' ? '' : `-${key}`
  const ids = new Set(
    [
      'world-terrain',
      'world-buildings',
      'world-roads',
      'world-trees',
      'world-landcover',
      'world-water',
      'world-railways',
      'world-places',
    ].map((id) => id + suffix),
  )
  const children = new Map<string, string[]>()
  for (const entity of doc.entities)
    if (entity.parentId) {
      const siblings = children.get(entity.parentId) ?? []
      siblings.push(entity.id)
      children.set(entity.parentId, siblings)
    }
  const queue = [...ids]
  for (let i = 0; i < queue.length; i++)
    for (const child of children.get(queue[i]) ?? [])
      if (!ids.has(child)) {
        ids.add(child)
        queue.push(child)
      }
  return doc.entities.filter((e) => ids.has(e.id))
}
/** Persist a compact fingerprint so saving does not turn generated map data into edits. */
export function mapFingerprint(entities: Entity[]): string {
  const text = JSON.stringify(
    [...entities].sort((a, b) => a.id.localeCompare(b.id)),
    (key, value) => {
      if (key === 'mapBaseline') return undefined
      if (value && typeof value === 'object' && !Array.isArray(value))
        return Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, value[k]]),
        )
      return value
    },
  )
  let a = 2166136261,
    b = 5381
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619)
    b = Math.imul(b, 33) ^ text.charCodeAt(i)
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')
}
