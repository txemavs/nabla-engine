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
  private readonly projectionCamera = new THREE.PerspectiveCamera()
  private projectionKey = ''
  private readonly originals = new Map<THREE.Material, THREE.Material['onBeforeCompile']>()
  private readonly disposedMaterial = (event: { target: THREE.Material }) =>
    this.removeMaterial(event.target)
  private readonly registeredMaterials = new Set<THREE.Material>()

  /** Create CSM instance if tier is non-null. */
  init(config: CSMConfig): void {
    this.dispose()
    this.tier = config.tier
    this.projectionCamera.copy(config.camera)
    this.projectionKey = ''
    this.csm = new CSM({
      camera: this.projectionCamera,
      parent: config.scene,
      cascades: config.tier.cascades,
      maxFar: config.tier.maxFar,
      shadowMapSize: config.tier.mapSize,
      lightDirection: config.lightDirection.clone().normalize(),
      lightIntensity: config.lightIntensity ?? 3.2,
      shadowBias: -0.0003,
      lightNear: 0.1,
      lightFar: config.tier.maxFar + 500,
      lightMargin: 200,
      mode: 'practical',
    })
    this.csm.fade = true
    for (const light of this.csm.lights) {
      light.shadow.normalBias = 0.04
      light.shadow.radius = 0
      light.shadow.intensity = 0.8
    }
    for (const material of this.registeredMaterials) {
      this.bind(material)
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
    if (this.registeredMaterials.has(material)) return
    this.registeredMaterials.add(material)
    this.originals.set(material, material.onBeforeCompile)
    material.addEventListener('dispose', this.disposedMaterial)
    this.bind(material)
  }

  /** Unregister a material when it is disposed. */
  removeMaterial(material: THREE.Material): void {
    this.registeredMaterials.delete(material)
    this.csm?.shaders.delete(material)
    material.removeEventListener('dispose', this.disposedMaterial)
    this.originals.delete(material)
  }

  private bind(material: THREE.Material): void {
    if (!this.csm) return
    this.csm.setupMaterial(material)
    const setup = material.onBeforeCompile,
      original = this.originals.get(material)
    material.onBeforeCompile = (shader, renderer) => {
      original?.call(material, shader, renderer)
      setup.call(material, shader, renderer)
    }
    material.needsUpdate = true
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
  update(camera: THREE.PerspectiveCamera, origin: THREE.Vector3): void {
    if (!this.csm || !this.tier) return
    const proxy = this.projectionCamera
    proxy.copy(camera)
    proxy.position.add(origin)
    proxy.updateMatrixWorld(true)
    const key = [
      camera.fov,
      camera.aspect,
      camera.near,
      Math.min(camera.far, this.tier.maxFar),
      camera.zoom,
    ].join(':')
    if (key !== this.projectionKey) {
      this.projectionKey = key
      this.csm.updateFrustums()
    }
    this.csm.update()
    for (const light of this.csm.lights) {
      light.position.sub(origin)
      light.target.position.sub(origin)
    }
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
      for (const light of this.csm.lights) light.dispose()
      for (const [material, original] of this.originals) material.onBeforeCompile = original
      this.csm = null
    }
    this.tier = null
  }
}
