import { createCarrier } from '../../catalog/vehicles/carrier.js'
import { parseScene, type SceneDocument } from '../document.js'
import { createCarrierPortal } from '../../entity/portal/portal.js'

export function installCarrierPortals(raw: unknown, experimentalLargeScene = false): SceneDocument {
  const doc = parseScene(raw, experimentalLargeScene)
  for (const host of [...doc.entities]) {
    if (host.visual?.body.url !== '/world/ship.container.5x10.glb' || !host.vehicle?.garage)
      continue
    host.vehicle.interior ??= createCarrier(host.id).vehicle!.interior
    const glass = createCarrier(host.id).vehicle!.colliders.at(-1)!
    if (!host.vehicle.colliders.some((c) => JSON.stringify(c) === JSON.stringify(glass)))
      host.vehicle.colliders.push(glass)
    const removed = new Set(
      doc.entities
        .filter(
          (e) =>
            e.parentId === host.id &&
            e.portal &&
            !e.portal.clearsRamp &&
            e.transform.position[2] < -4.9,
        )
        .map((e) => e.id),
    )
    // Retire bow destinations and their children before validating saved scenes.
    let count = -1
    while (count !== removed.size) {
      count = removed.size
      for (const e of doc.entities) if (e.parentId && removed.has(e.parentId)) removed.add(e.id)
    }
    doc.entities = doc.entities.filter((e) => !removed.has(e.id))
    for (const e of doc.entities)
      if (e.portal?.pairId && removed.has(e.portal.pairId)) {
        e.portal.pairId = null
        e.portal.mode = 'closed'
      }
    if (doc.entities.some((e) => e.parentId === host.id && e.portal?.clearsRamp)) continue
    let index = 1
    while (
      doc.entities.some(
        (e) => e.id === `carrier-gate-${index}-bow` || e.id === `carrier-gate-${index}-stern`,
      )
    )
      index++
    doc.entities.push(createCarrierPortal(host.id, `carrier-gate-${index}-stern`))
  }
  return parseScene(doc, experimentalLargeScene)
}
