import * as THREE from 'three'
import type { GeoPoint } from '../../math/geo/sphere.js'
import type { SkyClock } from '../../planet/sky.js'
import { OceanSheet } from './ocean-sheet.js'
import { GeographicView } from './sky.js'

/** Engine-owned defaults for the complete planetary environment. */
export const PLANET_DEFAULTS = Object.freeze({
  sky: true,
  sun: true,
  moon: true,
  clouds: true,
  cloudAmount: 0.35,
  sea: true,
  seaLevel: 0,
  viewDistance: 80000,
  exposure: 1.08,
})

export function configureWorldRenderer(renderer: THREE.WebGLRenderer) {
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = PLANET_DEFAULTS.exposure
}

/** Shared Studio/embedded-view environment. World content and streaming remain host-owned. */
export class WorldEnvironment {
  readonly ocean: OceanSheet
  constructor(
    private readonly scene: THREE.Scene,
    private readonly sun: THREE.DirectionalLight,
    private readonly ambient: THREE.AmbientLight,
    changed: () => void = () => {},
  ) {
    this.ocean = new OceanSheet(changed)
    scene.add(this.ocean.mesh)
  }
  updateSea(
    origin: GeoPoint | undefined,
    eye: THREE.Vector3,
    renderOrigin: THREE.Vector3,
    distance: number,
    now: number,
    enabled = true,
    revealFloor = false,
  ) {
    if (origin && enabled) this.ocean.update(origin, eye, renderOrigin, distance, now, revealFloor)
    this.ocean.mesh.visible = !!origin && enabled
  }
  updateSky(
    geography: GeographicView,
    eye: THREE.Vector3,
    renderOrigin: THREE.Vector3,
    clock: SkyClock,
    distance: number,
  ) {
    geography.viewDistance = distance
    const height = geography.update(eye.toArray(), renderOrigin, clock)
    if (this.ocean.mesh.visible) this.ocean.fadeWithSky(geography.atmosphere.space)
    return height
  }
  /** Same lunar key light, ambient fill and fog in Studio and embedded viewers. */
  applyLighting(geography: GeographicView, sunEnabled = true, moonEnabled = sunEnabled) {
    const air = geography.atmosphere
    const night = 1 - Math.min(1, Math.max(0, air.day))
    this.scene.background = null
    this.ambient.intensity = (0.22 * air.day + 0.04 * night) * (1 - air.space)
    this.scene.fog = air.fog ? new THREE.Fog(air.color, air.near, air.far) : null
    const moonUp = Math.max(0, geography.moonDirection.y)
    const useMoon = geography.sunDirection.y <= 0 && moonUp > 0
    const direction = useMoon ? geography.moonDirection : geography.sunDirection
    this.sun.position.copy(direction).multiplyScalar(65)
    this.sun.intensity = !(useMoon ? moonEnabled : sunEnabled)
      ? 0
      : useMoon
        ? 0.35 * Math.min(1, moonUp * 2)
        : geography.sunDirection.y > 0
          ? 3.2 * air.day
          : 0
    this.sun.color.set(useMoon ? '#d5def2' : air.day > 0.05 ? '#fff0d8' : '#b8ccff')
    this.ocean.setLight(direction, this.sun.intensity, this.sun.color, this.ambient.intensity)
    this.ocean.followFog(this.scene.fog)
    return direction
  }
  dispose() {
    this.ocean.dispose()
  }
}
