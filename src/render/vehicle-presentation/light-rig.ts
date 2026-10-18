import { vehicleLightDefaults, type VehicleLightTuning } from './light-tuning.js'
/** Fixed renderer lights for the occupied vehicle. GLB lamps stay hidden so light count never changes. */
import { Group, PointLight, SpotLight, Vector3, type Light, type Object3D } from 'three'
import { lightingDefaults } from '../../config/lighting.js'
import { lowBeamMask } from './authored-lights.js'

export const vehicleLightBudget = Object.freeze({
  spots: lightingDefaults.vehicleSpots,
  points: lightingDefaults.vehiclePoints,
  mappedSpots: lightingDefaults.vehicleMappedSpots,
})

/** One unchanging set of vehicle lights. Capture copies the occupied car; unused slots stay at intensity 0. */
export class VehicleLightRig {
  readonly root = new Group()
  private readonly spots: SpotLight[] = []
  private readonly points: PointLight[] = []
  private readonly mask = lowBeamMask()
  private readonly world = new Vector3()
  private nextGroundPoint = 0
  private freeGroundSlot: SpotLight | undefined

  constructor() {
    this.root.name = 'Vehicle light rig'
    for (let i = 0; i < vehicleLightBudget.spots; i++) {
      const light = new SpotLight('#fff6e0', 0, 40, Math.PI / 6, 0.35, 1.5)
      light.castShadow = false
      if (i < vehicleLightBudget.mappedSpots) light.map = this.mask
      this.root.add(light, light.target)
      this.spots.push(light)
    }
    for (let i = 0; i < vehicleLightBudget.points; i++) {
      const light = new PointLight('#fff6e0', 0, 4, 2)
      light.castShadow = false
      this.root.add(light)
      this.points.push(light)
    }
  }

  /** Unmapped headlight slot, reusable by the pedestrian while no vehicle owns the rig. */
  get pedestrianLight(): SpotLight {
    return this.spots[vehicleLightBudget.mappedSpots]!
  }

  get lights(): Light[] {
    return [...this.spots, ...this.points]
  }

  /** Copy occupied-vehicle lamps into the fixed slots. Count and maps stay constant. */
  capture(spots: readonly SpotLight[], points: readonly PointLight[], offset?: Vector3): void {
    this.nextGroundPoint = points.length
    this.root.updateWorldMatrix(true, false)
    const mapped = spots.filter((light) => light.map)
    const plain = spots.filter((light) => !light.map)
    this.freeGroundSlot =
      plain.length < this.spots.length - vehicleLightBudget.mappedSpots
        ? this.spots[this.spots.length - 1]
        : undefined
    for (let i = 0; i < this.spots.length; i++)
      this.copy(
        this.spots[i],
        i < vehicleLightBudget.mappedSpots ? mapped[i] : plain[i - vehicleLightBudget.mappedSpots],
      )
    if (offset)
      for (const light of this.spots) {
        light.position.add(offset)
        light.target.position.add(offset)
      }
    for (let i = 0; i < this.points.length; i++) this.copy(this.points[i], points[i])
  }

  /** Subtle downward road wash, using a spare unmapped slot rather than another light. */
  groundGlow(
    vehicle: Object3D,
    braking = false,
    tuning: VehicleLightTuning = vehicleLightDefaults,
  ): void {
    const light = this.freeGroundSlot
    if (!light || light === this.pedestrianLight) return
    vehicle.updateWorldMatrix(true, false)
    this.world.set(tuning.rearX, tuning.rearY, 1.8 + tuning.rearZ)
    vehicle.localToWorld(this.world)
    light.position.copy(this.root.worldToLocal(this.world))
    this.world.set(tuning.rearX, -1 + tuning.rearY, 2.6 + tuning.rearZ)
    vehicle.localToWorld(this.world)
    light.target.position.copy(this.root.worldToLocal(this.world))
    light.color.set('#ff2410')
    light.intensity = 4.8 * tuning.rearIntensity * (braking ? 1.32 : 1)
    light.distance = 5 * tuning.rearReach * (braking ? 1.32 : 1)
    light.decay = 1
    light.angle = 1.3
    light.penumbra = 1
    // This slot is never the pedestrian shadow slot.
    light.castShadow = false
  }

  /** Rear road fill for bikes and articulated vehicles, reusing spare fixed point slots. */
  rearGroundGlow(
    vehicle: Object3D,
    width: number,
    length: number,
    count: 1 | 2,
    braking: boolean,
    tuning: VehicleLightTuning = vehicleLightDefaults,
    anchor?: Object3D,
  ): void {
    vehicle.updateWorldMatrix(true, false)
    for (let i = 0; i < count; i++) {
      const light = this.points[this.nextGroundPoint++]
      if (!light) return
      this.world.set(count === 1 ? 0 : (i ? 1 : -1) * width * 0.35, -0.25, length / 2 - 0.2)
      if (anchor) {
        anchor.getWorldPosition(this.world)
        vehicle.worldToLocal(this.world)
        this.world.z += 0.04
      }
      this.world.add(new Vector3(tuning.rearX, tuning.rearY, tuning.rearZ))
      vehicle.localToWorld(this.world)
      light.position.copy(this.root.worldToLocal(this.world))
      light.color.set('#ff2410')
      light.intensity = (count === 1 ? 1.8 : 1.2) * tuning.rearIntensity * (braking ? 1.32 : 1)
      light.distance = 3 * tuning.rearReach * (braking ? 1.32 : 1)
      light.decay = 1
      light.castShadow = false
    }
  }

  dispose(): void {
    for (const light of this.spots) {
      light.map = null
      light.dispose()
    }
    for (const light of this.points) light.dispose()
    this.mask.dispose()
    this.root.clear()
    this.root.removeFromParent()
  }

  private copy(slot: SpotLight | PointLight, source?: SpotLight | PointLight): void {
    if (!source) {
      slot.intensity = 0
      return
    }
    source.updateWorldMatrix(true, false)
    source.getWorldPosition(this.world)
    this.root.worldToLocal(this.world)
    slot.position.copy(this.world)
    slot.color.copy(source.color)
    slot.intensity = source.intensity
    slot.distance = source.distance
    slot.decay = source.decay
    if (!(slot instanceof SpotLight) || !(source instanceof SpotLight)) return
    // Projection slots stay mapped for a constant shader budget; copy the beam pattern.
    if (slot.map && source.map) slot.map = source.map
    slot.angle = source.angle
    slot.penumbra = source.penumbra
    source.target.updateWorldMatrix(true, false)
    source.target.getWorldPosition(this.world)
    this.root.worldToLocal(this.world)
    slot.target.position.copy(this.world)
  }
}
