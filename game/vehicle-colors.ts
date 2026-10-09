import type { Entity } from '@nabla/engine/scene'
import { vehicleAppearanceDefaults } from '@nabla/engine/config/vehicle-appearance'

/** Choose once when creating a car or motorcycle; rendering only reads the saved colour. */
export function assignVehicleColor(entity: Entity, random: () => number = Math.random): void {
  const colors = entity.vehicle?.twoWheeled
    ? vehicleAppearanceDefaults.motorcycleColors
    : entity.visual?.presentation === 'nabla.s3'
      ? vehicleAppearanceDefaults.carColors
      : undefined
  if (!colors) return
  entity.color =
    colors[Math.min(colors.length - 1, Math.max(0, Math.floor(random() * colors.length)))]
}
