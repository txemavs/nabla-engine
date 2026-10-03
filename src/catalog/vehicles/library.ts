import { z } from 'zod'
import { createCarrierPortal } from '../../entity/portal/portal.js'
import { createEntity, type Entity, type Vec3Tuple } from '../../entity/schema.js'
import { vector, finite } from '../../entity/coords.js'
import { vehicleField, visualField } from '../../entity/vehicle/field.js'
import { readVehiclePresetSources } from './preset-source.js'

/**
 * A vehicle preset is a JSON file under assets/studio or assets/custom, in
 * cars, planes, ships or boats. studio is published. custom is this machine
 * only. The file is the whole definition. This module checks it and stamps an
 * id and a position. Lights, mirrors and physics stay in code.
 */
const presetSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,40}$/),
    label: z.string().min(1).max(80),
    clearance: z.number().finite().min(0).max(20),
    placement: vector,
    order: z.number().int().min(0).max(100),
    sternPortal: z.boolean().optional(),
    name: z.string().min(1).max(100),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    size: vector,
    mass: z.number().finite().min(0.1).max(100000),
    vehicle: vehicleField,
    visual: visualField,
    trailerPreset: z
      .object({
        name: z.string().min(1).max(100),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        size: vector,
        mass: finite.min(100).max(100000),
        spawnOffset: vector,
        vehicle: vehicleField,
        visual: visualField,
      })
      .strict()
      .optional(),
  })
  .strict()

export type VehiclePreset = z.infer<typeof presetSchema>

let cached: VehiclePreset[] | undefined

/** Every preset found at startup, in menu order. An empty assets folder yields none. */
export function vehiclePresets(): VehiclePreset[] {
  if (cached) return cached
  const presets: VehiclePreset[] = []
  for (const source of readVehiclePresetSources()) {
    try {
      presets.push(presetSchema.parse(source.data))
    } catch (error) {
      throw new Error(`Vehicle preset ${source.file} is invalid`, { cause: error })
    }
  }
  presets.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  const seen = new Set<string>()
  for (const preset of presets) {
    if (seen.has(preset.id)) throw new Error(`Duplicate vehicle preset id ${preset.id}`)
    seen.add(preset.id)
  }
  return (cached = presets)
}

export function hasVehiclePreset(id: string): boolean {
  return vehiclePresets().some((preset) => preset.id === id)
}

export function vehiclePreset(id: string): VehiclePreset {
  const preset = vehiclePresets().find((entry) => entry.id === id)
  if (!preset) throw new Error(`No vehicle preset "${id}"`)
  return preset
}

/** One vehicle. Omit position to use the preset's placement. */
export function presetVehicle(catalogId: string, id: string, position?: Vec3Tuple): Entity {
  const preset = vehiclePreset(catalogId)
  // Each call gets its own copy. Callers edit hubs and suspension on the entity.
  return {
    ...createEntity(id, 'vehicle', position ?? structuredClone(preset.placement)),
    name: preset.name,
    color: preset.color,
    size: structuredClone(preset.size),
    mass: preset.mass,
    vehicle: structuredClone(preset.vehicle),
    visual: structuredClone(preset.visual),
  }
}

/** The vehicle, plus the carrier stern portal when the preset asks for one. */
export function presetEntities(catalogId: string, id: string, position?: Vec3Tuple): Entity[] {
  const vehicle = presetVehicle(catalogId, id, position)
  if (!vehiclePreset(catalogId).sternPortal) return [vehicle]
  return [vehicle, createCarrierPortal(id, `${id}-stern`)]
}

/** Check if a preset has a trailer defined. */
export function hasTrailerPreset(catalogId: string): boolean {
  const preset = vehiclePresets().find((entry) => entry.id === catalogId)
  return Boolean(preset?.trailerPreset)
}

/**
 * Create a trailer entity for a tractor preset that has one defined.
 * The trailer is positioned behind the tractor based on the coupling anchor points.
 */
export function presetTrailer(
  catalogId: string,
  id: string,
  tractorPosition: Vec3Tuple,
): Entity | null {
  const preset = vehiclePreset(catalogId)
  const trailerDef = preset.trailerPreset
  if (!trailerDef) return null

  const tractorAnchor = preset.vehicle.trailer?.anchor
  const trailerKingpin = trailerDef.vehicle.trailerBody?.kingpin
  if (!tractorAnchor || !trailerKingpin) return null

  const offsetZ = tractorAnchor[2] - trailerKingpin[2]
  const position: Vec3Tuple = [
    tractorPosition[0] + (trailerDef.spawnOffset?.[0] ?? 0),
    tractorPosition[1] + (trailerDef.spawnOffset?.[1] ?? 0),
    tractorPosition[2] + offsetZ + (trailerDef.spawnOffset?.[2] ?? 0),
  ]

  return {
    ...createEntity(id, 'vehicle', position),
    name: trailerDef.name,
    color: trailerDef.color,
    size: structuredClone(trailerDef.size),
    mass: trailerDef.mass,
    vehicle: structuredClone(trailerDef.vehicle),
    visual: structuredClone(trailerDef.visual),
  }
}

/** Get both tractor and trailer entities if the preset has a trailer. */
export function presetTractorTrailer(
  catalogId: string,
  tractorId: string,
  trailerId: string,
  position?: Vec3Tuple,
): { tractor: Entity; trailer: Entity | null } {
  const preset = vehiclePreset(catalogId)
  const tractorPosition = position ?? structuredClone(preset.placement)
  const tractor = presetVehicle(catalogId, tractorId, tractorPosition)
  const trailer = presetTrailer(catalogId, trailerId, tractorPosition)
  return { tractor, trailer }
}
