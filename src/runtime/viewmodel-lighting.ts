import * as THREE from 'three'

/** Copy world lights without moving them; reuse the world's already rendered shadow maps. */
export class ViewmodelLighting {
  readonly root = new THREE.Group()
  private lights = new Map<THREE.Light, THREE.Light>()

  sync(world: THREE.Scene): void {
    const active = new Set<THREE.Light>()
    world.updateMatrixWorld(true)
    world.traverseVisible((object) => {
      if (!(object instanceof THREE.Light)) return
      active.add(object)
      let light = this.lights.get(object)
      if (!light) {
        light = object.clone(false)
        this.lights.set(object, light)
        this.root.add(light)
      }
      // Copy photometric properties; transforms below are world-relative, not parent-relative.
      const shadow = 'shadow' in object ? object.shadow : undefined
      const target =
        light instanceof THREE.DirectionalLight || light instanceof THREE.SpotLight
          ? light.target
          : undefined
      light.copy(object, false)
      object.matrixWorld.decompose(light.position, light.quaternion, light.scale)
      if (
        (light instanceof THREE.DirectionalLight && object instanceof THREE.DirectionalLight) ||
        (light instanceof THREE.SpotLight && object instanceof THREE.SpotLight)
      ) {
        if (target) light.target = target
        object.target.updateWorldMatrix(true, false)
        light.target.position.setFromMatrixPosition(object.target.matrixWorld)
        this.root.add(light.target)
      }
      if (shadow && 'shadow' in light) light.shadow = shadow
    })
    for (const [source, light] of this.lights) {
      if (active.has(source)) continue
      light.removeFromParent()
      if (light instanceof THREE.DirectionalLight || light instanceof THREE.SpotLight)
        light.target.removeFromParent()
      this.lights.delete(source)
    }
  }
}
