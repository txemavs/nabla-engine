/** Switch authored GLB lights as a group, using asset intensities and starting dark. */
import {
  DataTexture,
  LinearFilter,
  Light,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  SpotLight,
  type Object3D,
} from 'three'
import { lightingDefaults } from '../../config/lighting.js'
import {
  VehicleLightController,
  type VehicleLampState,
  type VehicleLightChannel,
  type VehicleLightMode,
} from './light-controller.js'

/** Translate the GLB contract once at load time; rendering uses common channels. */
function channel(value?: string): VehicleLightChannel {
  const channels: Record<string, VehicleLightChannel> = {
    Tail_Stop: 'tail-stop',
    Reverse: 'reverse',
    Indicator: 'signal',
    Marker: 'marker',
    LowBeam: 'low',
    HighBeam: 'high',
    Fog: 'fog',
    Brake: 'brake',
  }
  return channels[value ?? ''] ?? 'position'
}

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
  private reversing = false
  private mask?: DataTexture
  private readonly lamps: {
    light: Light
    intensity: number
    channel: VehicleLightChannel
    side: number
  }[] = []
  private readonly emitters: {
    material: MeshStandardMaterial
    intensity: number
    channel: VehicleLightChannel
    side: number
  }[] = []
  constructor(
    model: Object3D,
    readonly controller = new VehicleLightController(),
  ) {
    this.absorb(model)
  }
  /** Bind lamps from another GLB (a cargo box) onto this vehicle's light controller. */
  absorb(model: Object3D): void {
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
              channel: channel(material.userData.vehicleLightChannel),
              side:
                material.userData.vehicleLightSide === 'L'
                  ? -1
                  : material.userData.vehicleLightSide === 'R'
                    ? 1
                    : 0,
            })
            material.emissiveIntensity = 0
          }
      }
      if (!(node instanceof Light)) return
      let owner: Object3D | null = node
      while (owner && owner.userData.role !== 'vehicle-light') owner = owner.parent
      if (!owner) return
      const authored = owner.userData.onIntensity
      if (!Number.isFinite(authored) || authored < 0) return
      const lampChannel = channel(owner.userData.channel)
      const beam = lampChannel === 'low' || lampChannel === 'high' || lampChannel === 'fog'
      // Driving beams share one global level and a slightly softer edge than authored.
      const intensity = beam ? authored * lightingDefaults.headlightIntensityScale : authored
      if (beam && node instanceof SpotLight)
        node.penumbra = Math.min(1, node.penumbra + lightingDefaults.headlightPenumbraBoost)
      this.lamps.push({
        light: node,
        intensity,
        channel: lampChannel,
        side: owner.userData.side === 'L' ? -1 : owner.userData.side === 'R' ? 1 : 0,
      })
      if (node instanceof SpotLight && owner.userData.beamPattern === 'low-beam')
        node.map = this.mask ??= lowBeamMask()
      node.intensity = 0
      node.visible = false
    })
  }
  /** Hidden GLB lamps. A shared rig copies the occupied vehicle into a fixed renderer budget. */
  illuminators(): { spots: SpotLight[]; points: PointLight[] } {
    const spots: SpotLight[] = []
    const points: PointLight[] = []
    for (const { light } of this.lamps) {
      if (light instanceof SpotLight) spots.push(light)
      else if (light instanceof PointLight) points.push(light)
    }
    return { spots, points }
  }
  /** Null means this asset has no controllable authored light sources. */
  toggle(): boolean | null {
    return this.cycle() === null ? null : this.controller.enabled
  }
  /** Step the light switch (off → position → low → off); null without authored light sources. */
  cycle(): VehicleLightMode | null {
    if (!this.lamps.length && !this.emitters.length) return null
    this.controller.cycleLights()
    this.update(this.reversing)
    return this.controller.mode
  }
  /** Current light switch, also used by attached trailers. */
  get isEnabled(): boolean {
    return this.controller.enabled
  }
  /** Select high/low beams independently of the master light switch. */
  toggleHighBeam(): boolean | null {
    if (!this.lamps.some((lamp) => lamp.channel === 'high')) return null
    this.controller.toggleHighBeam()
    this.update(this.reversing)
    return this.controller.highBeam
  }
  /** Release the per-vehicle beam texture on scene disposal. */
  dispose(): void {
    for (const { light } of this.lamps)
      if (light instanceof SpotLight && light.map === this.mask) light.map = null
    this.mask?.dispose()
  }
  /** Reverse lamps follow the engaged gear independently of the driving-light switch. */
  update(reversing: boolean, enabled = this.controller.enabled): void {
    this.reversing = reversing
    this.controller.enabled = enabled
    this.apply({ powered: true, braking: false, reversing }, 0)
  }
  /** Render authored bindings using the same controller as cars, or the towing vehicle's controller. */
  apply(state: VehicleLampState, now: number, controller = this.controller): void {
    this.reversing = state.reversing
    for (const lamp of this.lamps)
      lamp.light.intensity = controller.level(lamp.channel, lamp.side, state, now) * lamp.intensity
    for (const emitter of this.emitters)
      emitter.material.emissiveIntensity =
        controller.glow(emitter.channel, emitter.side, state, now) * emitter.intensity
  }
}
