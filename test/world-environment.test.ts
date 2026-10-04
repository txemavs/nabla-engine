import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { WorldEnvironment } from '../src/render/planet/world-environment.js'
import type { GeographicView } from '../src/render/planet/sky.js'
afterEach(() => vi.restoreAllMocks())
function fixture() {
  vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture())
  const scene = new THREE.Scene(),
    sun = new THREE.DirectionalLight(),
    ambient = new THREE.AmbientLight()
  const environment = new WorldEnvironment(scene, sun, ambient)
  const geography = {
    atmosphere: {
      day: 1,
      space: 0,
      fog: true,
      color: new THREE.Color('#a6bbd5'),
      near: 60000,
      far: 80000,
    },
    sunDirection: new THREE.Vector3(0.3, 0.9, 0.1).normalize(),
    moonDirection: new THREE.Vector3(0.1, 0.5, 0.2).normalize(),
  } as unknown as GeographicView
  return { scene, sun, ambient, environment, geography }
}
describe('shared Studio geographic environment', () => {
  it('uses the same daylight and fog for scene and horizon water', () => {
    const { scene, sun, ambient, environment, geography } = fixture()
    environment.applyLighting(geography)
    expect(sun.intensity).toBeCloseTo(3.2)
    expect(ambient.intensity).toBeCloseTo(0.22)
    expect((scene.fog as THREE.Fog).far).toBe(80000)
    const uniforms = environment.ocean.mesh.material.uniforms
    expect(uniforms.sunIntensity.value).toBe(sun.intensity)
    expect(uniforms.fogFar.value).toBe(80000)
    environment.dispose()
    expect(scene.children).not.toContain(environment.ocean.mesh)
  })
  it('switches to lunar key light at night and honors a disabled key light', () => {
    const { sun, ambient, environment, geography } = fixture()
    geography.atmosphere.day = 0
    geography.sunDirection.y = -1
    const direction = environment.applyLighting(geography)
    expect(direction).toBe(geography.moonDirection)
    expect(sun.intensity).toBeGreaterThan(0)
    expect(environment.ocean.mesh.material.uniforms.sunIntensity.value).toBe(sun.intensity)
    expect(ambient.intensity).toBeCloseTo(0.04)
    environment.applyLighting(geography, false)
    expect(sun.intensity).toBe(0)
    expect(environment.ocean.mesh.material.uniforms.sunIntensity.value).toBe(0)
    environment.dispose()
  })
  it('shows the curved ocean only when geographic sea is enabled', () => {
    const { environment } = fixture()
    const origin = { latitude: 43.34, longitude: -1.76, altitude: 0 }
    const eye = new THREE.Vector3(0, 300, 0),
      zero = new THREE.Vector3()
    environment.ocean.setLevel(2)
    environment.updateSea(origin, eye, zero, 80000, 2000)
    expect(environment.ocean.mesh.visible).toBe(true)
    expect(environment.ocean.mesh.material.uniforms.altitude.value).toBeCloseTo(298)
    environment.updateSea(origin, eye, zero, 80000, 2000, false)
    expect(environment.ocean.mesh.visible).toBe(false)
    environment.dispose()
  })
})
