import { createCarrier } from '../src/presets.js'
import { parseScene, type SceneDocument } from '../src/scene.js'
import { createCarrierPortals } from '../src/portal.js'

export function installCarrierPortals(raw: unknown): SceneDocument {
  const doc = parseScene(raw)
  for (const host of [...doc.entities]) {
    if (host.visual?.body.url !== '/world/ship.container.5x10.glb' || !host.vehicle?.garage)
      continue
    host.vehicle.interior ??= createCarrier(host.id).vehicle!.interior
    if (doc.entities.some((e) => e.parentId === host.id && e.portal)) continue
    let index = 1
    while (
      doc.entities.some(
        (e) => e.id === `carrier-gate-${index}-bow` || e.id === `carrier-gate-${index}-stern`,
      )
    )
      index++
    doc.entities.push(
      ...createCarrierPortals(host.id, `carrier-gate-${index}-bow`, `carrier-gate-${index}-stern`),
    )
  }
  return parseScene(doc)
}
