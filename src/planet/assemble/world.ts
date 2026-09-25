/**
 * Turn one downloaded district into a scene document.
 *
 * Emitters run in an order that matches the old single pass: a feature is claimed by the
 * first emitter that accepts it. Roots are shifted back by the tile offset after parenting.
 */
import type { WorldExtract } from '../extract/contract.js'
import { parseScene, type SceneDocument } from '../../stage/scene.js'
import { validateSolid } from '../../math/solid/mesh.js'
import { mapFingerprint } from '../../scene/fingerprint.js'
import { mapTileEntities } from '../../scene/tiles.js'
import { openDistrict, type DistrictOptions } from './district.js'
import { emitBuilding } from './buildings.js'
import { emitWay } from './ways.js'
import { emitPlace } from './places.js'
import { emitTree } from './trees.js'
import { emitFurniture } from './furniture.js'
import { emitAeroway } from './aeroway.js'
import { emitCover } from './cover.js'
import { emitWaterway } from './waterway.js'
import { emitSpawn } from './spawn.js'

export { IRUN_VENTAS } from '../extract/contract.js'
export type { MapFeature, WorldExtract } from '../extract/contract.js'
export { normalizeColor } from '../extract/tags.js'

/** Bounded real-data district. No synthetic replacement for missing streets or heights. */
export function createRealWorld(data: WorldExtract, options: DistrictOptions = {}): SceneDocument {
  const d = openDistrict(data, options)
  const [ox, oz] = options.offset ?? [0, 0]
  for (const feature of data.features) {
    if (emitBuilding(d, feature)) continue
    if (emitWay(d, feature)) continue
    if (emitPlace(d, feature)) continue
    if (emitTree(d, feature)) continue
    if (emitFurniture(d, feature)) continue
    if (emitAeroway(d, feature)) continue
    if (emitCover(d, feature)) continue
    emitWaterway(d, feature)
  }
  d.entities.find((e) => e.id === d.groups[1])!.parentId = d.terrain.id
  for (const e of d.entities)
    if (!e.parentId) {
      e.transform.position[0] += ox
      e.transform.position[2] += oz
    }
  emitSpawn(d)
  let omitted = 0
  const usable = d.entities.filter((e) => {
    e.name = e.name.slice(0, 100)
    if (!e.geometry) return true
    try {
      validateSolid(e.geometry)
      return true
    } catch {
      omitted++
      return false
    }
  })
  if (omitted)
    usable.find((e) => e.id === d.groups[0])!.name =
      `Edificios OSM · ${omitted} omitidos por geometría inválida`
  const doc = parseScene(
    {
      version: 1,
      name: data.name,
      geography: { ...data.origin, imagery: 'offline' },
      sky: { mode: 'fixed', at: '2026-09-21T12:00:00.000Z' },
      entities: usable,
    },
    options.experimentalLargeScene,
  )
  doc.entities.find((e) => e.id === d.terrain.id)!.mapBaseline = mapFingerprint(
    mapTileEntities(doc, options.tileId ?? '0_0'),
  )
  return doc
}
