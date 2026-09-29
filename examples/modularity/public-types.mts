import { createEntity, vehicleDefinition, type Entity } from '@nabla/engine'
import { createWheeledVehicle, type WheeledDefinition } from '@nabla/engine/vehicles/wheeled'
import { createBoat, type BoatWater } from '@nabla/engine/vehicles/boat'
import { createFlight, type FlightEnvironment } from '@nabla/engine/vehicles/flight'
import { Body, Vec3, Quaternion } from '@nabla/engine/physics'
import { type MonitorDefinition } from '@nabla/engine/monitors'
import { type VehiclePresentationAdapter } from '@nabla/engine/vehicle-presentation'
const car: Entity = createEntity('car', 'vehicle')
const definition: WheeledDefinition = vehicleDefinition(car)
const body = new Body({ mass: 1000 })
createWheeledVehicle(body, definition)
createBoat(body)
createFlight(body, 0)
const water: BoatWater = { sample: (keel) => ({ depth: -keel.y, up: new Vec3(0, 1, 0) }) }
const environment: FlightEnvironment = {
  height: 0,
  up: new Vec3(0, 1, 0),
  tangent: new Quaternion(),
  minimumAltitude: 0,
  planetary: false,
}
const monitor: MonitorDefinition = { width: 400, height: 200, layers: [] }
const adapter: VehiclePresentationAdapter = {
  mount() {
    return {}
  },
}
void [water, environment, monitor, adapter]
