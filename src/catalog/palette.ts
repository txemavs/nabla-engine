/**
 * Stock objects a host can drop in: car, carrier, lamps.
 * Position arguments are the ground contact, not the centre of mass.
 */
import { type Entity, type Vec3Tuple } from '../entity/schema.js'
import { createA3 } from './vehicles/a3.js'
import { createPoliceCar } from './vehicles/police.js'
import { createJeep } from './vehicles/jeep.js'
import { createOutboard } from './vehicles/boat.js'
import { createCarrier } from './vehicles/carrier.js'
import { createCessna } from './vehicles/cessna.js'
import { createCarrierPortal } from '../entity/portal/portal.js'
import { createGlobeLamp } from './globe.js'
import { createHighwayLamp } from './highway.js'

export const entityCatalog = [
  { id: 'car', label: 'S3 Nabla · 400 CV', clearance: 0.62 },
  { id: 'police', label: 'Policía Municipal · Bilbao', clearance: 0.69 },
  { id: 'jeep', label: 'Jeep Wrangler', clearance: 0.86 },
  { id: 'boat', label: 'Fueraborda 6 m', clearance: 0.45 },
  { id: 'carrier', label: 'Contenedor volador', clearance: 1.2 },
  { id: 'cessna', label: 'Cessna 172', clearance: 0.95 },
  { id: 'streetlight', label: 'Farola de autopista', clearance: 4.5 },
  { id: 'globe', label: 'Farola de barrio', clearance: 2.5 },
] as const
export type CatalogId = (typeof entityCatalog)[number]['id']
/** Position is the ground contact, not the model's centre of mass. IDs belong to the host. */
export function createCatalogEntities(kind: CatalogId, id: string, ground: Vec3Tuple): Entity[] {
  const entry = entityCatalog.find((e) => e.id === kind)!
  const position: Vec3Tuple = [ground[0], ground[1] + entry.clearance, ground[2]]
  if (kind === 'police') return [createPoliceCar(id, position)]
  if (kind === 'jeep') return [createJeep(id, position)]
  if (kind === 'car') return [createA3(id, position)]
  if (kind === 'boat') return [createOutboard(id, position)]
  if (kind === 'cessna') return [createCessna(id, position)]
  if (kind === 'carrier')
    return [createCarrier(id, position), createCarrierPortal(id, `${id}-stern`)]
  if (kind === 'globe') return [createGlobeLamp(id, position, entry.label)]
  return [createHighwayLamp(id, position, entry.label)]
}
