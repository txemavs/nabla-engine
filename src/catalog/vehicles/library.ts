import { z } from 'zod'
import { createCarrierPortal } from '../../entity/portal/portal.js'
import { createEntity, type Entity, type Vec3Tuple } from '../../entity/schema.js'
import { vector } from '../../entity/coords.js'
import { vehicleField, visualField } from '../../entity/vehicle/field.js'
import { readVehiclePresetSources } from './preset-source.js'
import { generatedVehicleRigs } from './generated-rigs.js'
import { hasTrailerBox, trailerBox } from './trailer-boxes.js'

/**
 * A vehicle preset is a JSON file under assets/library or assets/custom, in
 * cars, motorcycles, planes, ships or boats. studio is published. custom is this machine
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
    /**
     * Kept for Studio, examples and tests but left out of player-facing lists (the game's add
     * menu and default parked rows). The A3 Cabrio is hidden: the S3 covers it in Normal mode.
     */
    hidden: z.boolean().optional(),
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
                  ...(extracted.monitors ? { monitorMounts: extracted.monitors } : {}),
                  ...(extracted.driver
                    ? {
                        driver: extracted.driver,
                        headOffset: extracted.headOffset,
                        headRotation: extracted.headRotation,
                      }
                    : {}),
                  ...(extracted.hitch ? { hitch: extracted.hitch } : {}),
                  ...(extracted.towAnchor ? { towAnchor: extracted.towAnchor } : {}),
                },
                visual: {
                  ...authored.visual,
                  wheelRotations: extracted.wheelRotations,
                  ...(authored.visual.steering
                    ? { steering: { ...authored.visual.steering, transform: extracted.steering } }
                    : {}),
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

/** Optional cargo body when spawning a trailer chassis. */
export type PresetVehicleOptions = {
  /** Trailer box id, or `false` for a bare chassis. Omit to keep the preset default. */
  box?: string | false
}

const TRAILER_CHASSIS = 'white-trailer-chassis'
const TRAILER_COMPOSED = 'white-trailer'

function applyTrailerBox(entity: Entity, box: string | false): void {
  if (!entity.vehicle?.passive || !entity.vehicle.towAnchor || !entity.visual)
    throw new Error('Trailer box attachments require a trailer chassis')
  const chassis = vehiclePreset(TRAILER_CHASSIS)
  if (box === false) {
    delete entity.visual.attachments
    entity.vehicle.colliders = structuredClone(chassis.vehicle.colliders)
    entity.size = structuredClone(chassis.size)
    entity.mass = chassis.mass
    return
  }
  if (!hasTrailerBox(box)) throw new Error(`No trailer box "${box}"`)
  const spec = trailerBox(box)
  entity.visual.attachments = [{ url: spec.url, transform: structuredClone(spec.transform) }]
  const composed = vehiclePreset(TRAILER_COMPOSED)
  entity.vehicle.colliders = structuredClone(composed.vehicle.colliders)
  entity.size = structuredClone(composed.size)
  entity.mass = chassis.mass + spec.mass
}

/** One vehicle. Omit position to use the preset's placement. */
export function presetVehicle(
  catalogId: string,
  id: string,
  position?: Vec3Tuple,
  options?: PresetVehicleOptions,
): Entity {
  const preset = vehiclePreset(catalogId)
  // Each call gets its own copy. Callers edit hubs and suspension on the entity.
  const entity = {
    ...createEntity(id, 'vehicle', position ?? structuredClone(preset.placement)),
    name: preset.name,
    color: preset.color,
    size: structuredClone(preset.size),
    mass: preset.mass,
    vehicle: structuredClone(preset.vehicle),
    visual: structuredClone(preset.visual),
  }
  if (options?.box !== undefined) applyTrailerBox(entity, options.box)
  return entity
}

/** The vehicle, plus the carrier stern portal when the preset asks for one. */
export function presetEntities(catalogId: string, id: string, position?: Vec3Tuple): Entity[] {
  const vehicle = presetVehicle(catalogId, id, position)
  if (!vehiclePreset(catalogId).sternPortal) return [vehicle]
  return [vehicle, createCarrierPortal(id, `${id}-stern`)]
}
