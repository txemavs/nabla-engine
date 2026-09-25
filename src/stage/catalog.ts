import { type Entity, type Vec3Tuple } from './scene.js'
import { createA3 } from '../catalog/a3.js'
import { createCarrier } from '../catalog/carrier.js'
import { createCarrierPortals } from '../entity/portal/portal.js'
import { createGlobeLamp } from '../catalog/globe.js'
import { createHighwayLamp } from '../catalog/highway.js'

export const entityCatalog = [
  { id: 'car', label: 'Audi A3 Cabrio', clearance: 0.62 },
  { id: 'carrier', label: 'Contenedor volador', clearance: 1.2 },
  { id: 'streetlight', label: 'Farola de autopista', clearance: 4.5 },
  { id: 'globe', label: 'Farola de barrio', clearance: 2.2 },
] as const
export type CatalogId = (typeof entityCatalog)[number]['id']
/** Position is the ground contact, not the model's centre of mass. IDs belong to the host. */
export function createCatalogEntities(kind: CatalogId, id: string, ground: Vec3Tuple): Entity[] {
  const entry = entityCatalog.find((e) => e.id === kind)!
  const position: Vec3Tuple = [ground[0], ground[1] + entry.clearance, ground[2]]
  if (kind === 'car') return [createA3(id, position)]
  if (kind === 'carrier')
    return [createCarrier(id, position), ...createCarrierPortals(id, `${id}-bow`, `${id}-stern`)]
  if (kind === 'globe') return [createGlobeLamp(id, position, entry.label)]
  return [createHighwayLamp(id, position, entry.label)]
}
