/** Switch authored GLB lights as a group, using asset intensities and starting dark. */
import { Light, Mesh, MeshStandardMaterial, type Object3D } from 'three'

export class AuthoredVehicleLights {
  private enabled = false
  private readonly lamps: { light: Light; intensity: number }[] = []
  private readonly emitters: { material: MeshStandardMaterial; intensity: number }[] = []
  constructor(model: Object3D) {
    model.traverse((node) => {
      if (node instanceof Mesh && node.userData.role === 'vehicle-emitter') {
        for (const material of Array.isArray(node.material) ? node.material : [node.material])
          if (material instanceof MeshStandardMaterial) {
            this.emitters.push({ material, intensity: material.emissiveIntensity })
            material.emissiveIntensity = 0
          }
      }
      if (!(node instanceof Light)) return
      let owner: Object3D | null = node
      while (owner && owner.userData.role !== 'vehicle-light') owner = owner.parent
      if (!owner) return
      const intensity = owner.userData.onIntensity
      if (!Number.isFinite(intensity) || intensity < 0) return
      this.lamps.push({ light: node, intensity })
      node.intensity = 0
    })
  }
  /** Null means this asset has no controllable authored light sources. */
  toggle(): boolean | null {
    if (!this.lamps.length) return null
    this.enabled = !this.enabled
    for (const lamp of this.lamps) lamp.light.intensity = this.enabled ? lamp.intensity : 0
    for (const emitter of this.emitters)
      emitter.material.emissiveIntensity = this.enabled ? emitter.intensity : 0
    return this.enabled
  }
}
