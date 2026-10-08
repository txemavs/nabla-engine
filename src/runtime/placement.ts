import type { Entity } from '../entity/schema.js'
import { wheelContactY } from '../entity/vehicle/vehicle.js'

/** Shared Studio/game clearance above loaded ground, in metres. */
export function playGroundClearance(entity: Entity): number {
  if (entity.groundOffset !== undefined) return entity.groundOffset
  if (entity.kind === 'spawn') return 0.2
  if (entity.vehicle?.flight) return 1.5
  if (entity.vehicle) return 0.06 - wheelContactY(entity.vehicle)
  return 0.85
}
