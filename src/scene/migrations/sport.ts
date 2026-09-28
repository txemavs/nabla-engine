import { createA3 } from '../../catalog/vehicles/a3.js'
import type { SceneDocument } from '../document.js'

/** Upgrade recognised stock presets only; keep paint, placement and authored tuning. */
export function upgradeSportPresets(doc: SceneDocument): void {
  for (const e of doc.entities) {
    const v = e.vehicle
    if (!v) continue
    if (
      e.visual?.body.url === '/world/car.audi.a3.cabrio.glb' &&
      !v.powertrain &&
      v.engineForce === 2600 &&
      v.brakeForce === 36 &&
      !v.drivenWheels
    ) {
      const preset = createA3(e.id).vehicle!
      v.powertrain = preset.powertrain
      v.drivenWheels = 'all'
      v.brakeForce = preset.brakeForce
      if (e.name === 'Audi A3 Cabrio') e.name = 'Audi S3 Nabla · 400 CV DSG'
    }
    if (
      e.visual?.body.url === '/world/car.ford.focus.police.glb' &&
      v.engineForce === 2200 &&
      v.brakeForce === 65 &&
      v.drivenWheels === 'all'
    )
      v.drivenWheels = 'front'
  }
}
