import { expect, it, vi } from 'vitest'
import { Scene, Vector3 } from 'three'
import { VehicleEffects } from '../../src/runtime/vehicle-effects.js'
import { XRScaledVehicles } from '../../src/runtime/xr-scaled-vehicles.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'

it('keeps the real engine rpm while placing its sound at model scale', async () => {
  const physics = await XRScaledVehicles.create([presetVehicle('car', 'car', [0, 0.62, 0])], 0.01, {
    ignition: false,
    vehicleDamage: false,
  })
  physics.updateSurfaces([])
  for (let i = 0; i < 180; i++) physics.step(1 / 60, { throttle: 0.5, steering: 0, brake: 0 })
  const effects = new VehicleEffects(new Scene())
  const position = vi.spyOn(effects.audio, 'setVehiclePosition')
  const powertrain = vi.spyOn(effects.audio, 'powertrain')
  effects.updateAudio(
    physics.simulation,
    { version: 1, name: 'AR vehicles', entities: physics.entities },
    new Vector3(),
    1,
  )
  const realPosition = position.mock.calls.at(-1)![0]
  const rpm = powertrain.mock.calls.at(-1)![0]
  effects.updateAudio(
    physics.simulation,
    { version: 1, name: 'AR vehicles', entities: physics.entities },
    new Vector3(),
    0.01,
  )
  expect(position.mock.calls.at(-1)![0]).toEqual(realPosition.map((v) => v * 0.01))
  expect(rpm).toBeGreaterThan(0)
  expect(powertrain.mock.calls.at(-1)![0]).toBe(rpm)
  effects.dispose()
  physics.dispose()
})
