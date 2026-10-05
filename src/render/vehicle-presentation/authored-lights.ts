/** Switch authored GLB lights as a group, using asset intensities and starting dark. */
import {
  DataTexture,
  LinearFilter,
  Light,
  Mesh,
  MeshStandardMaterial,
  SpotLight,
  type Object3D,
} from 'three'
import { lightingDefaults } from '../../config/lighting.js'

/** Project a soft horizontal cutoff; texture +Y is up in the spotlight projection. */
export function lowBeamMask(): DataTexture {
  const size = lightingDefaults.lowBeamMaskSize
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1),
        v = y / (size - 1)
      const cutoff = Math.max(
        0,
        Math.min(1, (lightingDefaults.lowBeamCutoff - v) / lightingDefaults.lowBeamCutoffSoftness),
      )
      const spread = Math.max(
        0,
        1 - Math.pow(Math.abs(u - 0.5) * 2, lightingDefaults.lowBeamSpreadPower),
      )
      const at = (y * size + x) * 4
      data[at] = data[at + 1] = data[at + 2] = Math.round(255 * cutoff * spread)
      data[at + 3] = 255
    }
  const texture = new DataTexture(data, size, size)
  texture.minFilter = texture.magFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}

export class AuthoredVehicleLights {
  private enabled = false
  private reversing = false
  private highBeam = false
  private mask?: DataTexture
  private readonly lamps: { light: Light; intensity: number; channel?: string }[] = []
  private readonly emitters: {
    material: MeshStandardMaterial
    intensity: number
    channel?: string
  }[] = []
  constructor(model: Object3D) {
    model.traverse((node) => {
      if (node instanceof Mesh) {
        for (const material of Array.isArray(node.material) ? node.material : [node.material])
          if (
            material instanceof MeshStandardMaterial &&
            (node.userData.role === 'vehicle-emitter' || material.userData.vehicleLightChannel)
          ) {
            if (this.emitters.some((entry) => entry.material === material)) continue
            this.emitters.push({
              material,
              intensity: material.emissiveIntensity,
              channel: material.userData.vehicleLightChannel,
            })
            material.emissiveIntensity = 0
          }
      }
      if (!(node instanceof Light)) return
      let owner: Object3D | null = node
      while (owner && owner.userData.role !== 'vehicle-light') owner = owner.parent
      if (!owner) return
      const intensity = owner.userData.onIntensity
      if (!Number.isFinite(intensity) || intensity < 0) return
      this.lamps.push({ light: node, intensity, channel: owner.userData.channel })
      if (node instanceof SpotLight && owner.userData.beamPattern === 'low-beam')
        node.map = this.mask ??= lowBeamMask()
      node.intensity = 0
    })
  }
  /** Null means this asset has no controllable authored light sources. */
  toggle(): boolean | null {
    if (!this.lamps.length && !this.emitters.length) return null
    this.enabled = !this.enabled
    this.update(this.reversing)
    return this.enabled
  }
  /** Current light switch, also used by attached trailers. */
  get isEnabled(): boolean {
    return this.enabled
  }
  /** Select high/low beams independently of the master light switch. */
  toggleHighBeam(): boolean | null {
    if (!this.lamps.some((lamp) => lamp.channel === 'HighBeam')) return null
    this.highBeam = !this.highBeam
    this.update(this.reversing)
    return this.highBeam
  }
  /** Release the per-vehicle beam texture on scene disposal. */
  dispose(): void {
    for (const { light } of this.lamps)
      if (light instanceof SpotLight && light.map === this.mask) light.map = null
    this.mask?.dispose()
  }
  /** Reverse lamps follow the engaged gear independently of the driving-light switch. */
  update(reversing: boolean, enabled = this.enabled): void {
    this.reversing = reversing
    this.enabled = enabled
    const active = (channel?: string) =>
      channel === 'Reverse'
        ? reversing
        : channel === 'Indicator' || channel === 'Fog'
          ? false
          : channel === 'HighBeam'
            ? enabled && this.highBeam
            : channel === 'LowBeam'
              ? enabled && !this.highBeam
              : enabled
    for (const lamp of this.lamps) lamp.light.intensity = active(lamp.channel) ? lamp.intensity : 0
    for (const emitter of this.emitters)
      emitter.material.emissiveIntensity = active(emitter.channel) ? emitter.intensity : 0
  }
}
