import { createJeep } from '../../catalog/vehicles/jeep.js'
import type { SceneDocument } from '../document.js'

/** Mutates an already parsed, privately owned document. Preserves identity and placements. */
export function replaceLegacyJeeps(doc: SceneDocument): void {
  for (const entity of doc.entities) {
    if (entity.kind !== 'vehicle' || entity.visual?.body.url !== '/world/car.jeep.gladiator.glb')
      continue
    const replacement = createJeep(entity.id)
    entity.size = replacement.size
    entity.mass = replacement.mass
    entity.vehicle = replacement.vehicle
    entity.visual = replacement.visual
    if (entity.name === 'Jeep Gladiator') entity.name = replacement.name
  }
}
