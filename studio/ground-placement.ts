import type { SceneDocument } from '@nabla/engine'
import type { Vec3Tuple } from '@nabla/engine'

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
