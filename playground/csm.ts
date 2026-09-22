/**
 * Cascaded Shadow Maps (CSM) wrapper for the playground.
 *
 * This module uses Three.js's CSM addon to provide soft, cascaded shadows
 * that stay sharp near the camera and still cover distant city blocks.
 * Configuration is driven by the shadow quality tier in performance settings.
 *
 * CSM shader injection is automatic via Three.js's CSMShader patches.
 * Materials must be registered with setupMaterial() to receive CSM uniforms.
 */
import { CSM } from 'three/addons/csm/CSM.js'
import * as THREE from 'three'
import { shadowTiers, type ShadowTier } from './performance.js'

export interface CSMConfig {
  camera: THREE.PerspectiveCamera
  scene: THREE.Scene
  lightDirection: THREE.Vector3
  lightIntensity?: number
  tier: ShadowTier
}

export class ShadowManager {
  private csm: CSM | null = null
  private tier: ShadowTier | null = null
  private readonly registeredMaterials = new Set<THREE.Material>()

  /** Create CSM instance if tier is non-null. */
  init(config: CSMConfig): void {
    this.dispose()
    this.tier = config.tier
    this.csm = new CSM({
      camera: config.camera,
      parent: config.scene,
      cascades: config.tier.cascades,
      maxFar: config.tier.maxFar,
      shadowMapSize: config.tier.mapSize,
      lightDirection: config.lightDirection.clone().normalize(),
      lightIntensity: config.lightIntensity ?? 3.2,
      shadowBias: -0.0001,
      lightNear: 0.1,
      lightFar: config.tier.maxFar + 100,
      lightMargin: 50,
      mode: 'practical',
    })
    this.csm.fade = true
    for (const light of this.csm.lights) {
      light.shadow.normalBias = 0.06
    }
    for (const material of this.registeredMaterials) {
      this.csm.setupMaterial(material)
    }
  }

  get enabled(): boolean {
    return this.csm !== null
  }

  get lights(): THREE.DirectionalLight[] {
    return this.csm?.lights ?? []
  }

  /** Register a material for CSM shadow receiving. */
  setupMaterial(material: THREE.Material): void {
    this.registeredMaterials.add(material)
    this.csm?.setupMaterial(material)
  }

  /** Unregister a material when it is disposed. */
  removeMaterial(material: THREE.Material): void {
    this.registeredMaterials.delete(material)
  }

  /** Update light direction (e.g., from sun position). */
  setLightDirection(direction: THREE.Vector3): void {
    if (this.csm) {
      this.csm.lightDirection.copy(direction).normalize()
    }
  }

  /** Update light intensity (e.g., day/night transition). */
  setLightIntensity(intensity: number): void {
    if (this.csm) {
      for (const light of this.csm.lights) {
        light.intensity = intensity
      }
    }
  }

  /** Update light color (e.g., day/night transition). */
  setLightColor(color: THREE.ColorRepresentation): void {
    if (this.csm) {
      for (const light of this.csm.lights) {
        light.color.set(color)
      }
    }
  }

  /** Call each frame before rendering. */
  update(): void {
    this.csm?.update()
  }

  /** Call when camera projection changes. */
  updateFrustums(): void {
    this.csm?.updateFrustums()
  }

  /** Reconfigure CSM when quality setting changes. */
  reconfigure(
    qualityValue: number,
    camera: THREE.PerspectiveCamera,
    scene: THREE.Scene,
    lightDirection: THREE.Vector3,
    lightIntensity: number,
  ): void {
    const newTier = shadowTiers[qualityValue]
    if (!newTier) {
      this.dispose()
      return
    }
    const sameConfig =
      this.tier &&
      this.tier.cascades === newTier.cascades &&
      this.tier.mapSize === newTier.mapSize &&
      this.tier.maxFar === newTier.maxFar
    if (sameConfig) return
    this.init({
      camera,
      scene,
      lightDirection,
      lightIntensity,
      tier: newTier,
    })
  }

  dispose(): void {
    if (this.csm) {
      this.csm.dispose()
      this.csm.remove()
      this.csm = null
    }
    this.tier = null
  }
}
