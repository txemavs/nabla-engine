import * as THREE from 'three'
import type { SkyClock } from '../src/sky.js'
import type { GeographicView } from './geography.js'

/** Destination state lasts through the remote scene render, then restores the main view.
 * Reuses the globe/textures; no extra geography, textures or network queue per portal.
 */
export function portalEnvironment(
  geography: GeographicView,
  scene: THREE.Scene,
  remotePosition: THREE.Vector3,
  mainPosition: THREE.Vector3,
  renderOrigin: THREE.Vector3,
  clock: SkyClock,
  ambient: THREE.AmbientLight,
  lights: THREE.DirectionalLight[],
): () => void {
  const fog = scene.fog,
    background = scene.background,
    fill = ambient.intensity
  const lightStates = lights.map((light) => ({
    light,
    intensity: light.intensity,
    color: light.color.clone(),
  }))
  const restore = () => {
    geography.update(mainPosition.toArray(), renderOrigin, clock)
    scene.fog = fog
    scene.background = background
    ambient.intensity = fill
    for (const state of lightStates) {
      state.light.intensity = state.intensity
      state.light.color.copy(state.color)
    }
  }
  try {
    geography.update(remotePosition.toArray(), renderOrigin, clock)
    const air = geography.atmosphere
    scene.background = null
    scene.fog = air.space >= 1 ? null : new THREE.Fog(air.color, air.near, air.far)
    ambient.intensity = 0.22 * air.day * (1 - air.space)
    for (const light of lights) {
      light.intensity = 3.2 * Math.max(air.day, air.space)
      light.color.set(air.day > 0.05 || air.space >= 1 ? '#fff0d8' : '#b8ccff')
    }
    return restore
  } catch (error) {
    restore()
    throw error
  }
}
