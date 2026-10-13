import { expect, it } from 'vitest'
import { resetGameSettings } from '../../game/reset-settings.js'
it('clears game preferences and per-model settings without clearing terrain or unrelated data', () => {
  const storage = Object.assign(Object.create(null), {
    'nabla.weaponPoses': '{}',
    'nabla.cameraFov': '25',
    'nabla.driverPose': '{}',
    'nabla.actionCam': 'false',
    'nabla.actionCamSettings': '{"strideMetres":3}',
    'nabla.mirrors:/bike.glb': '{}',
    'nabla.steeringWheel:/car.glb': '{}',
    'nabla.terrain.cache': 'keep',
    'other.app': 'keep',
  })
  Object.defineProperty(storage, 'removeItem', {
    value: (key: string) => {
      delete storage[key]
    },
  })
  resetGameSettings(storage)
  expect(Object.keys(storage)).toEqual(['nabla.terrain.cache', 'other.app'])
})
