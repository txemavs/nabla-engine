import { createJeep } from '../../catalog/vehicles/jeep.js'
import type { SceneDocument } from '../document.js'

/** Mutates an already parsed, privately owned document. Preserves identity and placements. */
export function replaceLegacyJeeps(doc: SceneDocument): void {
  for (const entity of doc.entities) {
    // Upgrade only the first Wrangler preset; retain deliberately edited seat anchors.
    if (
      entity.visual?.body.url === '/world/car.jeep.wrangler.glb' &&
      entity.vehicle?.driver.every((v, i) => Math.abs(v - [-0.38, 0.8, -0.03][i]) < 1e-6)
    )
      entity.vehicle.driver = createJeep(entity.id).vehicle!.driver

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
