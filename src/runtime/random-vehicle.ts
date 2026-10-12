import { randomVehicleTuning } from '../config/gameplay-tuning.js'
import { presetVehicle } from '../catalog/vehicles/library.js'

export function randomRoadVehicle(random = Math.random) {
  let draw = random() * randomVehicleTuning.reduce((sum, entry) => sum + entry.weight, 0)
  const choice = randomVehicleTuning.find((entry) => (draw -= entry.weight) < 0)!
  const trailers = ['white-trailer', 'white-trailer-chassis', 'white-car-transporter']
  const trailer = () =>
    presetVehicle(trailers[Math.floor(random() * trailers.length)], 'random-trailer')
  switch (choice.kind) {
    case 'motorcycle':
      return { vehicle: presetVehicle('vfr800', 'random-vehicle') }
    case 'car':
      return { vehicle: presetVehicle('car', 'random-vehicle') }
    case 'truck':
      return { vehicle: presetVehicle('white-truck', 'random-vehicle') }
    case 'truckTrailer':
      return { vehicle: presetVehicle('white-truck', 'random-vehicle'), trailer: trailer() }
    case 'trailer':
      return { vehicle: trailer() }
  }
}
