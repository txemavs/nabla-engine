/** Switch authored GLB lights as a group, using asset intensities and starting dark. */
import {
  DataTexture,
  LinearFilter,
  Light,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  SpotLight,
  Vector3,
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
    Cabin: 'cabin',
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

const beamCutoff = { low: 0, high: 1 }
const beamMasks = new Map<DataTexture, boolean>()

/** Degrees above the authored cutoff. Updates textures without adding shader variants. */
export function setVehicleBeamCutoff(kind: 'low' | 'high', degrees: number): void {
  if (!Number.isFinite(degrees)) return
  beamCutoff[kind] = Math.max(-5, Math.min(5, degrees))
  for (const [texture, asymmetric] of beamMasks)
    if (asymmetric === (kind === 'low')) paintBeamMask(texture, asymmetric)
}
export function getVehicleBeamCutoff(kind: 'low' | 'high'): number {
  return beamCutoff[kind]
}

export function lowBeamMask(asymmetric = true): DataTexture {
  const size = lightingDefaults.lowBeamMaskSize
  const texture = new DataTexture(new Uint8Array(size * size * 4), size, size)
  texture.minFilter = texture.magFilter = LinearFilter
  beamMasks.set(texture, asymmetric)
  texture.addEventListener('dispose', () => beamMasks.delete(texture))
  paintBeamMask(texture, asymmetric)
  return texture
}

/** Dipped cutoff with a short 45-degree rise toward the right; projection +Y is up. */
function paintBeamMask(texture: DataTexture, asymmetric: boolean): void {
  const size = lightingDefaults.lowBeamMaskSize
  const data = texture.image.data as Uint8Array
  const rampStart =
    0.5 - Math.tan(Math.PI / 180) / (2 * Math.tan(lightingDefaults.lowBeamOuterCone))
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1),
        v = y / (size - 1)
      // Equal texture-axis increments make a short 45-degree ramp, then a raised plateau.
      const edge =
        lightingDefaults.lowBeamCutoff +
        Math.tan((beamCutoff[asymmetric ? 'low' : 'high'] * Math.PI) / 180) /
          (2 * Math.tan(lightingDefaults.lowBeamOuterCone)) +
        (asymmetric ? Math.min(0.02, Math.max(0, u - rampStart)) : 0)
      const cutoff = Math.max(0, Math.min(1, (edge - v) / lightingDefaults.lowBeamCutoffSoftness))
      const spread = Math.max(
        0,
        1 - Math.pow(Math.abs(u - 0.5) * 2, lightingDefaults.lowBeamSpreadPower),
      )
      const at = (y * size + x) * 4
      data[at] = data[at + 1] = data[at + 2] = Math.round(255 * cutoff * spread)
      data[at + 3] = 255
    }
  texture.needsUpdate = true
}

export class AuthoredVehicleLights {
  private reversing = false
  private mask?: DataTexture
  private highMask?: DataTexture
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
      if (!(node instanceof Light) || this.lamps.some((lamp) => lamp.light === node)) return
      let owner: Object3D | null = node
      while (owner && owner.userData.role !== 'vehicle-light') owner = owner.parent
      if (!owner) return
      const authored = owner.userData.onIntensity
      if (!Number.isFinite(authored) || authored < 0) return
      const lampChannel = channel(owner.userData.channel)
      const beam = lampChannel === 'low' || lampChannel === 'high' || lampChannel === 'fog'
      // Driving beams share one global level and a slightly softer edge than authored.
      const intensity =
        (beam ? authored * lightingDefaults.headlightIntensityScale : authored) *
        (lampChannel === 'high' ? lightingDefaults.highBeamIntensityScale : 1)
      if (beam && node instanceof SpotLight)
        node.penumbra = Math.min(1, node.penumbra + lightingDefaults.headlightPenumbraBoost)
      // Configure the beam once in vehicle space, independently of GLB lamp axes.
      if (
        node instanceof SpotLight &&
        (lampChannel === 'high' || lampChannel === 'low') &&
        !node.userData.nablaBeamAimAdjusted
      ) {
        model.updateWorldMatrix(true, true)
        const origin = model.worldToLocal(node.getWorldPosition(new Vector3()))
        const target = model.worldToLocal(node.target.getWorldPosition(new Vector3()))
        const direction = target.clone().sub(origin)
        const length = direction.length()
        const horizontal = Math.hypot(direction.x, direction.z)
        if (length > 0 && horizontal > 1e-6) {
          const elevation =
            lampChannel === 'high' ? (2 * Math.PI) / 180 : Math.atan2(direction.y, horizontal)
          direction.x *= (Math.cos(elevation) * length) / horizontal
          direction.z *= (Math.cos(elevation) * length) / horizontal
          direction.y = Math.sin(elevation) * length
          target.copy(origin).add(direction)
          model.localToWorld(target)
          if (node.target.parent) node.target.parent.worldToLocal(target)
          node.target.position.copy(target)
          node.userData.nablaBeamAimAdjusted = true
        }
        if (lampChannel === 'high') node.angle = lightingDefaults.lowBeamOuterCone
      }
      if (node instanceof SpotLight && lampChannel === 'high')
        node.map = this.highMask ??= lowBeamMask(false)
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
      if (light instanceof SpotLight && (light.map === this.mask || light.map === this.highMask))
        light.map = null
    this.mask?.dispose()
    this.highMask?.dispose()
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
