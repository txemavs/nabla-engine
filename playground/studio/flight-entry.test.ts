import { it, expect } from 'vitest'
import { flightEntry, urlPlay } from './flight-entry.js'
import { createPlanetScene } from './planet-scene.js'
import { Simulation } from '../../src/simulation.js'
import { localToGeo } from '../../src/geography.js'
it('starts piloting in flight 120m above the car without changing the editor document', () => {
  const doc = createPlanetScene({ latitude: 43.33, longitude: -1.82, altitude: 0 }, 'Test')
  doc.entities.find((e) => e.id === 'car-a')!.transform.position = [25, 600, 40]
  const before = JSON.stringify(doc)
  const entry = flightEntry(doc)
  const car = localToGeo(
    doc.geography!,
    doc.entities.find((e) => e.id === 'car-a')!.transform.position,
  )
  const ship = localToGeo(
    doc.geography!,
    entry.scene.entities.find((e) => e.id === entry.vehicleId)!.transform.position,
  )
  expect(ship.altitude - car.altitude).toBeCloseTo(120, 5)
  expect(ship.latitude).toBeCloseTo(car.latitude, 8)
  expect(ship.longitude).toBeCloseTo(car.longitude, 8)
  const sim = new Simulation(entry.scene, { planetaryTerrain: true })
  sim.startInVehicle(entry.vehicleId)
  sim.toggleFlight()
  expect(sim.player.vehicleId).toBe(entry.vehicleId)
  expect(JSON.stringify(doc)).toBe(before)
  sim.dispose()
})
it('treats play as an explicit URL switch', () => {
  for (const q of ['?play', '?play=1', '?play=true&lat=40']) expect(urlPlay(q)).toBe(true)
  for (const q of ['', '?play=0', '?play=false']) expect(urlPlay(q)).toBe(false)
})
