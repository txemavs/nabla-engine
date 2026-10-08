import type { Entity } from '../src/entity/schema.js'

/**
 * Start a car with engine modes (the S3 `car` preset) in Bestia (S), the 400 CV mode its
 * performance, ramp and convoy tests were written for. The preset itself defaults to Normal.
 */
export function beast<T extends Entity>(entity: T): T {
  const powertrain = entity.vehicle?.powertrain
  if (!powertrain?.modes?.beast) throw new Error(`${entity.id} has no Bestia engine mode`)
  powertrain.defaultMode = 'beast'
  return entity
}
