import { z } from 'zod'
import { createCarrierPortal } from '../../entity/portal/portal.js'
import { createEntity, type Entity, type Vec3Tuple } from '../../entity/schema.js'
import { vector } from '../../entity/coords.js'
import { vehicleField, visualField } from '../../entity/vehicle/field.js'
import { readVehiclePresetSources } from './preset-source.js'
import { generatedVehicleRigs } from './generated-rigs.js'

/**
 * A vehicle preset is a JSON file under assets/studio or assets/custom, in
 * cars, planes, ships or boats. studio is published. custom is this machine
 * only. GLB-backed stock presets merge generated anchor poses before schema
 * validation. This module stamps an id and position without loading a renderer.
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
      const { rig, ...authored } = source.data as VehiclePreset & { rig?: string }
      if (rig !== undefined && rig !== 'glb') throw new Error(`Unknown rig source: ${rig}`)
      const extracted = rig === 'glb' ? generatedVehicleRigs[authored.id] : undefined
      if (rig === 'glb' && (!extracted || extracted.source !== authored.visual.body.url))
        throw new Error(`Missing generated GLB rig for ${authored.id}; run rigs:generate`)
      presets.push(
        presetSchema.parse(
          extracted
            ? {
                ...authored,
                vehicle: {
                  ...authored.vehicle,
                  hubs: extracted.hubs,
                  ...(extracted.hitch ? { hitch: extracted.hitch } : {}),
                },
                visual: {
                  ...authored.visual,
                  wheelRotations: extracted.wheelRotations,
                  steering: { ...authored.visual.steering, transform: extracted.steering },
                },
              }
            : authored,
        ),
      )
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
