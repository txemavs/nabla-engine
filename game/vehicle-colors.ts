import type { Entity } from '@nabla/engine/scene'
import { vehicleAppearanceDefaults } from '@nabla/engine/config/vehicle-appearance'
import { presetEntities } from '@nabla/engine/vehicles'

/**
 * Choose once when creating a vehicle whose data names a paint palette
 * (`vehicle.colorPalette`: `car` or `motorcycle`); rendering only reads the saved colour.
 */
export function assignVehicleColor(entity: Entity, random: () => number = Math.random): void {
  const palette = entity.vehicle?.colorPalette
  const colors =
    palette === 'motorcycle'
      ? vehicleAppearanceDefaults.motorcycleColors
      : palette === 'car'
        ? vehicleAppearanceDefaults.carColors
        : undefined
  if (!colors) return
  entity.color =
    colors[Math.min(colors.length - 1, Math.max(0, Math.floor(random() * colors.length)))]
}

/**
 * Whether the scene already holds a vehicle of the model a preset would add (same body GLB), so
 * a demo vehicle is not added twice. Decided by the model, never by the vehicle class.
 */
export function sceneHasPresetModel(entities: readonly Entity[], presetId: string): boolean {
  const url = presetEntities(presetId, 'preset-probe', [0, 0, 0])[0]?.visual?.body.url
  return !!url && entities.some((entity) => entity.vehicle && entity.visual?.body.url === url)
}
