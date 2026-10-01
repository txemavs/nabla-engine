/**
 * Stock objects a host can drop in. Vehicles come from assets; lamps stay here.
 * Position arguments are the ground contact, not the centre of mass.
 */
import { type Entity, type Vec3Tuple } from '../entity/schema.js'
import { presetEntities, vehiclePresets } from './vehicles/library.js'
import { createGlobeLamp } from './globe.js'
import { createHighwayLamp } from './highway.js'

const fittings = [
  { id: 'streetlight', label: 'Farola de autopista', clearance: 4.5 },
  { id: 'globe', label: 'Farola de barrio', clearance: 2.5 },
]

export interface CatalogEntry {
  id: string
  label: string
  clearance: number
}

export const entityCatalog: CatalogEntry[] = [
  ...vehiclePresets().map((preset) => ({
    id: preset.id,
    label: preset.label,
    clearance: preset.clearance,
  })),
  ...fittings,
]

export type CatalogId = (typeof entityCatalog)[number]['id']

/** Position is the ground contact, not the model's centre of mass. IDs belong to the host. */
export function createCatalogEntities(kind: CatalogId, id: string, ground: Vec3Tuple): Entity[] {
  const entry = entityCatalog.find((item) => item.id === kind)
  if (!entry) throw new Error(`Unknown catalog entry ${kind}`)
  const position: Vec3Tuple = [ground[0], ground[1] + entry.clearance, ground[2]]
  if (vehiclePresets().some((preset) => preset.id === kind))
    return presetEntities(kind, id, position)
  if (kind === 'globe') return [createGlobeLamp(id, position, entry.label)]
  return [createHighwayLamp(id, position, entry.label)]
}
