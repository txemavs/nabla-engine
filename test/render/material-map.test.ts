import * as THREE from 'three'
import { afterEach, expect, it, vi } from 'vitest'
import { matteGroundMaterial, withMap } from '../../src/render/planet/ground-material.js'

afterEach(() => vi.restoreAllMocks())

it('a ground mesh without a photo does not pass an undefined map to three.js', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const bare = matteGroundMaterial({ color: '#fff', ...withMap(undefined), vertexColors: true })
  expect(warn).not.toHaveBeenCalled()
  expect(bare.map).toBeNull()
  // The old call shape is what produced the warning, once per material.
  new THREE.MeshStandardMaterial({ map: undefined })
  expect(warn).toHaveBeenCalledTimes(1)
  expect(String(warn.mock.calls[0][0])).toContain("parameter 'map' has value of undefined")
})

it('keeps the photo when there is one', () => {
  const photo = new THREE.Texture()
  expect(matteGroundMaterial({ ...withMap(photo) }).map).toBe(photo)
})
