/**
 * Cascaded Shadow Maps (CSM) for the planet and the entities.
 *
 * This module uses Three.js's CSM addon to provide soft, cascaded shadows
 * that stay sharp near the camera and still cover distant city blocks.
 * Configuration is driven by the shadow quality tier in performance settings.
 *
 * CSM shader injection is automatic via Three.js's CSMShader patches.
 * Materials must be registered with setupMaterial() to receive CSM uniforms.
 * Adjacent cascades fade across a distance-scaled band so the 140 m / 500 m
 * splits do not read as hard rings from the air.
 *
 * Bias is set per cascade from the world size of one shadow-map texel (see
 * `cascadeShadowBias`), times a live player factor (`setBiasScale`).
 */
import { CSM } from 'three/addons/csm/CSM.js'
import * as THREE from 'three'
import {
  cascadeShadowBias,
  normalizeShadowBias,
  shadowBiasRange,
  shadowTiers,
  type ShadowTier,
} from './shadow-tiers.js'
import { patchGroundCloudShadow } from './planet/artistic-clouds.js'

// The addon ships an older full lighting chunk. Replacing it wholesale drops
// r186's DFG lookup and multi-scattering initialization, turning metals black.
// Keep the installed engine's lighting and replace only its directional branch.
const directionalStart = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )'
const directionalEnd = '#if ( NUM_RECT_AREA_LIGHTS > 0 )'
export function cascadedLighting(standard: string, cascaded: string): string {
  const start = standard.indexOf(directionalStart)
  const end = standard.indexOf(directionalEnd, start)
  const replacementStart = cascaded.indexOf(directionalStart)
  const replacementEnd = cascaded.indexOf(directionalEnd, replacementStart)
  if ([start, end, replacementStart, replacementEnd].some((index) => index < 0))
    throw new Error('Unsupported Three.js CSM lighting layout')
  return (
    standard.slice(0, start) +
    cascaded.slice(replacementStart, replacementEnd) +
    standard.slice(end)
  )
}

/** Near-heavy cuts: the car and the façade that shades it stay in cascade 0. */
function cascadeCutMetres(count: number): number[] {
  return count >= 4 ? [140, 420, 1200] : count === 3 ? [140, 500] : [160]
}

// Three.js fade uses 0.25 * edge^2, ~1 m at the 140 m split. Grow the band with
// distance so flying shows a blend, not two hard rings, without eating the car.
const blendMin = 28
const blendMax = 120
const blendFraction = 0.18

/** World-space blend at a cascade edge. Zero at the near plane so contact stays sharp. */
export function cascadeBlendMetres(edgeMetres: number): number {
  if (edgeMetres <= 0) return 0
  return Math.min(blendMax, Math.max(blendMin, edgeMetres * blendFraction))
}

/** Extra ortho metres so the fade band can still sample this cascade. */
export function cascadeBoundPad(index: number, cascades: number, far: number): number {
  const cuts = cascadeCutMetres(cascades)
  const farEdge = index < cascades - 1 ? (cuts[index] ?? far) : far
  const facade = index === 0 ? 48 : index === 1 ? 24 : 0
  return Math.max(facade, cascadeBlendMetres(farEdge))
}

/** Widen the addon fade; the stock band is invisible at Nabla's near-heavy splits. */
export function softenCascadeSeams(source: string): string {
  const from = 'margin = 0.25 * pow( closestEdge, 2.0 );'
  if (!source.includes(from)) throw new Error('Unsupported Three.js CSM fade layout')
  return source.replaceAll(
    from,
    `margin = max( 0.25 * pow( closestEdge, 2.0 ), closestEdge <= 0.0 ? 0.0 : min( ${blendMax.toFixed(1)}, max( ${blendMin.toFixed(1)}, closestEdge * ( shadowFar - cameraNear ) * ${blendFraction.toFixed(2)} ) ) / ( shadowFar - cameraNear ) );`,
  )
}

const standardLighting = THREE.ShaderChunk.lights_fragment_begin

// Three rotates the PCF kernel with screen-space noise. The pattern changes
// every frame the camera moves, so shadows and the light they gate shimmer.
let shadowKernelFrozen = false
function freezeShadowKernel(): void {
  if (shadowKernelFrozen) return
  shadowKernelFrozen = true
  THREE.ShaderChunk.shadowmap_pars_fragment = THREE.ShaderChunk.shadowmap_pars_fragment.replaceAll(
    'interleavedGradientNoise( gl_FragCoord.xy )',
    '0.0',
  )
}

export interface CSMConfig {
  camera: THREE.PerspectiveCamera
  scene: THREE.Scene
  lightDirection: THREE.Vector3
  lightIntensity?: number
  tier: ShadowTier
}

/**
 * Identity of the camera projection for cascade rebuilds. Field of view is rounded to a
 * degree and far to a metre so a view blend does not rebuild the shadow frustums every frame.
 */
export function shadowProjectionKey(
  camera: { fov: number; aspect: number; near: number; far: number; zoom: number },
  maxFar: number,
): string {
  const far = Math.min(camera.far, maxFar)
  return [
    Math.round(camera.fov),
    camera.aspect.toFixed(3),
    camera.near.toFixed(2),
    Math.round(far),
    camera.zoom.toFixed(3),
  ].join(':')
}

export class ShadowManager {
  private csm: CSM | null = null
  private tier: ShadowTier | null = null
  private biasScale: number = shadowBiasRange.default
  private readonly projectionCamera = new THREE.PerspectiveCamera()
  private projectionKey = ''
  private readonly originals = new Map<THREE.Material, THREE.Material['onBeforeCompile']>()
  private readonly disposedMaterial = (event: { target: THREE.Material }) =>
    this.removeMaterial(event.target)
  private readonly registeredMaterials = new Set<THREE.Material>()
  private readonly shadowHold = new Map<
    THREE.DirectionalLight,
    { position: THREE.Vector3; target: THREE.Vector3 }
  >()

  /** Create CSM instance if tier is non-null. */
  init(config: CSMConfig): void {
    this.dispose()
    freezeShadowKernel()
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
      // Replaced per cascade by applyBias() once the cascade frusta are known.
      shadowBias: 0,
      lightNear: 0.1,
      lightFar: config.tier.maxFar + 500,
      lightMargin: 200,
      // The first split has to hold the car and the façade that shades it.
      // A 40 m cut follows the view, so turning drops the building out of the map.
      mode: 'custom',
      customSplitsCallback: (count, _near, far, breaks) => {
        const distances = cascadeCutMetres(count)
        for (let i = 0; i < count - 1; i++)
          breaks.push(Math.min(distances[i] / far, (i + 1) / count))
        breaks.push(1)
      },
    })
    THREE.ShaderChunk.lights_fragment_begin = softenCascadeSeams(
      cascadedLighting(standardLighting, THREE.ShaderChunk.lights_fragment_begin),
    )
    this.csm.fade = true
    this.csm.updateFrustums()
    this.padShadowBounds()
    for (const light of this.csm.lights) {
      light.shadow.radius = config.tier.radius
      light.shadow.intensity = 1
    }
    this.applyBias()
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

  /** Player factor on the tier's texel-scaled shadow bias (1 = tuned default). */
  get shadowBiasScale(): number {
    return this.biasScale
  }

  /** Change the bias factor live; no shader recompilation, the next shadow pass uses it. */
  setBiasScale(scale: number): void {
    this.biasScale = normalizeShadowBias(scale)
    this.applyBias()
  }

  /**
   * Normal and depth bias of every cascade from the world size of one of its texels. A fixed
   * offset in metres is a fraction of a texel on Baja and several on Ultra: the coarse maps
   * striped every gentle slope (acne) while the sharp one could lift contact shadows.
   */
  private applyBias(): void {
    if (!this.csm || !this.tier) return
    for (const light of this.csm.lights) {
      const cam = light.shadow.camera
      const texel = (cam.right - cam.left) / this.csm.shadowMapSize
      const bias = cascadeShadowBias(this.tier, texel, this.biasScale)
      light.shadow.normalBias = bias.normal
      // Orthographic shadow depth is linear over [near, far]: metres / range.
      light.shadow.bias = -bias.depth / Math.max(1e-6, cam.far - cam.near)
    }
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
      patchGroundCloudShadow(shader)
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
    const key = shadowProjectionKey(camera, this.tier.maxFar)
    if (key !== this.projectionKey) {
      this.projectionKey = key
      this.csm.updateFrustums()
      this.padShadowBounds()
      this.applyBias()
    }
    this.csm.update()
    for (const light of this.csm.lights) {
      const texel = (light.shadow.camera.right - light.shadow.camera.left) / this.csm.shadowMapSize
      let hold = this.shadowHold.get(light)
      if (hold && light.position.distanceTo(hold.position) < texel * 1.25) {
        light.position.copy(hold.position)
        light.target.position.copy(hold.target)
      } else {
        hold ??= { position: new THREE.Vector3(), target: new THREE.Vector3() }
        hold.position.copy(light.position)
        hold.target.copy(light.target.position)
        this.shadowHold.set(light, hold)
      }
      light.position.sub(origin)
      light.target.position.sub(origin)
    }
  }

  /** Keep façades and the cascade fade band inside each shadow map. */
  private padShadowBounds(): void {
    if (!this.csm || !this.tier) return
    this.csm.lights.forEach((light, index) => {
      const margin = cascadeBoundPad(index, this.tier!.cascades, this.tier!.maxFar)
      if (!margin) return
      const cam = light.shadow.camera
      cam.left -= margin
      cam.right += margin
      cam.bottom -= margin
      cam.top += margin
      cam.updateProjectionMatrix()
    })
  }

  /** Call when camera projection changes. */
  updateFrustums(): void {
    this.csm?.updateFrustums()
    this.applyBias()
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
    this.shadowHold.clear()
    this.tier = null
  }
}
