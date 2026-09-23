import type { SceneDocument, Vec3Tuple } from '../../src/scene.js'

/** Surface placement is persistent while terrain streams; explicit pose edits clear it. */
export function settleGroundPlacement(
  document: SceneDocument,
  height: (position: Vec3Tuple) => number | undefined,
): boolean {
  if (!document.geography?.planetary) return false
  let changed = false
  for (const entity of document.entities) {
    if (entity.parentId || entity.groundOffset === undefined) continue
    const ground = height(entity.transform.position)
    if (ground === undefined || !Number.isFinite(ground)) continue
    const y = ground + entity.groundOffset
    if (Math.abs(y - entity.transform.position[1]) < 0.001) continue
    entity.transform.position[1] = y
    changed = true
  }
  if (document.cursorOnGround) {
    const position = document.cursor ?? [0, 0, 0]
    const ground = height(position)
    if (
      ground !== undefined &&
      Number.isFinite(ground) &&
      Math.abs(ground - position[1]) >= 0.001
    ) {
      document.cursor = [position[0], ground, position[2]]
      changed = true
    }
  }
  return changed
}

/** Recover only the exact unplaced reference trio saved by previous versions. */
export function recoverUnplacedDefaults(document: SceneDocument): SceneDocument {
  if (!document.geography?.planetary || document.cursorOnGround !== undefined) return document
  const defaults = [
    ['spawn', [-2, 1, 0]],
    ['car-a', [0, 1, 0]],
    ['carrier', [20, 2, 0]],
  ] as const
  if (
    !defaults.every(([id, position]) => {
      const e = document.entities.find((e) => e.id === id)
      return (
        e &&
        !e.parentId &&
        !e.geoAnchor &&
        e.groundOffset === undefined &&
        e.transform.position.every((v, i) => v === position[i])
      )
    })
  )
    return document
  const result = structuredClone(document)
  for (const [id] of defaults) {
    const e = result.entities.find((e) => e.id === id)!
    e.groundOffset = e.kind === 'spawn' ? 0.2 : e.vehicle?.flight ? 1.2 : 0.62
  }
  if (!result.cursor || result.cursor.every((v) => v === 0)) {
    result.cursor = [0, 0, 0]
    result.cursorOnGround = true
  }
  return result
}
