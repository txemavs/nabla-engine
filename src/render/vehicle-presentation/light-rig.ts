/** Fixed renderer lights for the occupied vehicle. GLB lamps stay hidden so light count never changes. */
import { Group, PointLight, SpotLight, Vector3, type Light } from 'three'
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

  get lights(): Light[] {
    return [...this.spots, ...this.points]
  }

  /** Copy occupied-vehicle lamps into the fixed slots. Count and maps stay constant. */
  capture(spots: readonly SpotLight[], points: readonly PointLight[]): void {
    this.root.updateWorldMatrix(true, false)
    const mapped = spots.filter((light) => light.map)
    const plain = spots.filter((light) => !light.map)
    for (let i = 0; i < this.spots.length; i++)
      this.copy(
        this.spots[i],
        i < vehicleLightBudget.mappedSpots ? mapped[i] : plain[i - vehicleLightBudget.mappedSpots],
      )
    for (let i = 0; i < this.points.length; i++) this.copy(this.points[i], points[i])
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
    slot.angle = source.angle
    slot.penumbra = source.penumbra
    source.target.updateWorldMatrix(true, false)
    source.target.getWorldPosition(this.world)
    this.root.worldToLocal(this.world)
    slot.target.position.copy(this.world)
  }
}
