import { createEntity, type Entity, type Vec3Tuple } from './scene.js'
import { createA3, createCarrier } from './presets.js'
import { createCarrierPortals } from './portal.js'

export const entityCatalog = [
  { id: 'car', label: 'Audi A3 Cabrio', clearance: 0.62 },
  { id: 'carrier', label: 'Contenedor volador', clearance: 1.2 },
  { id: 'streetlight', label: 'Farola de autopista', clearance: 4.5 },
] as const
export type CatalogId = (typeof entityCatalog)[number]['id']
/** Position is the ground contact, not the model's centre of mass. IDs belong to the host. */
export function createCatalogEntities(kind: CatalogId, id: string, ground: Vec3Tuple): Entity[] {
  const entry = entityCatalog.find((e) => e.id === kind)!
  const position: Vec3Tuple = [ground[0], ground[1] + entry.clearance, ground[2]]
  if (kind === 'car') return [createA3(id, position)]
  if (kind === 'carrier')
    return [createCarrier(id, position), ...createCarrierPortals(id, `${id}-bow`, `${id}-stern`)]
  const lamp = createEntity(id, 'box', position)
  lamp.name = entry.label
  lamp.size = [0.24, 9, 0.24]
  lamp.color = '#6d7680'
  lamp.light = { color: '#ffe0ad', intensity: 1800, distance: 32, enabled: true, nightOnly: true }
  return [lamp]
}
