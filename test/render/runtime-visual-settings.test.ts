import { expect, it } from 'vitest'
import { Group, Texture } from 'three'
import {
  createWorldVisualSettings,
  setGroundPhotoAnisotropy,
} from '../../src/render/planet/world.js'
import { setHiddenTileLayers, tileMeshHidden } from '../../src/render/planet/tile-layers.js'
import {
  bindSmokeDensity,
  smokeDensityFor,
  setSmokeDensity,
} from '../../src/render/entity/smoke-density.js'
import {
  createBeamSettings,
  lowBeamMask,
  setVehicleBeamCutoff,
} from '../../src/render/vehicle-presentation/authored-lights.js'

it('keeps terrain filtering and uploaded photo preferences separate', () => {
  const a = createWorldVisualSettings(),
    b = createWorldVisualSettings()
  const photoA = new Texture(),
    photoB = new Texture()
  photoA.anisotropy = photoB.anisotropy = 8
  a.photos.add(photoA)
  b.photos.add(photoB)
  setHiddenTileLayers(['road'], a.hidden)
  expect(tileMeshHidden({ category: 'Roads' }, a.hidden)).toBe(true)
  expect(tileMeshHidden({ category: 'Roads' }, b.hidden)).toBe(false)
  setGroundPhotoAnisotropy(2, a)
  expect(photoA.anisotropy).toBe(2)
  expect(photoB.anisotropy).toBe(8)
  expect(b.anisotropy).toBe(8)
  photoA.dispose()
  photoB.dispose()
})
it('resolves late smoke emitters through their owning scene', () => {
  const a = new Group(),
    b = new Group(),
    outlet = new Group()
  const densityA = { value: 1 },
    densityB = { value: 0.8 }
  bindSmokeDensity(a, densityA)
  bindSmokeDensity(b, densityB)
  const uniform = smokeDensityFor(outlet)
  a.add(outlet)
  setSmokeDensity(20, densityA)
  expect(uniform.value).toBe(0.2)
  expect(smokeDensityFor(b).value).toBe(0.8)
  b.add(outlet)
  expect(uniform.value).toBe(0.8)
})
it('updates only the owning runtime beam masks, including masks allocated later', () => {
  const a = createBeamSettings(),
    b = createBeamSettings()
  const first = lowBeamMask(true, a),
    second = lowBeamMask(true, b)
  const original = new Uint8Array(second.image.data as Uint8Array)
  setVehicleBeamCutoff('low', 3, a)
  expect(second.image.data).toEqual(original)
  expect(first.image.data).not.toEqual(original)
  const late = lowBeamMask(true, a)
  expect(late.image.data).toEqual(first.image.data)
  first.dispose()
  expect(a.masks.has(first)).toBe(false)
  setVehicleBeamCutoff('low', -2, b)
  expect(late.image.data).not.toEqual(second.image.data)
  late.dispose()
  second.dispose()
})
