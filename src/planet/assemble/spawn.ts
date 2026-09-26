/** The sample car, carrier and player spawn that every generated district includes. */
import { createEntity } from '../../entity/schema.js'
import { rotationDegrees } from '../../math/frame/vectors.js'
import { createA3 } from '../../catalog/a3.js'
import { createCarrier } from '../../catalog/carrier.js'
import type { District } from './district.js'

export function emitSpawn(d: District): void {
  const car = createA3('car-a', [0, d.height(0, 0) + 0.85, 0])
  car.transform.rotation = rotationDegrees(0, -1, 0)
  const carrier = createCarrier('carrier', [20, d.height(20, 0) + 1.5, 0])
  carrier.name = 'Nave · Ventas'
  const spawn = createEntity('spawn', 'spawn', [-2, d.height(-2, 0) + 0.1, 0])
  d.entities.push(car, carrier, spawn)
}
