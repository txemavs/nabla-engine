import { repairPortalFrame } from './portal-frame.js'
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'

/** Owns shared geometry/textures. Views own their cloned materials and transforms. */
export class AssetLibrary {
  private readonly loader = new GLTFLoader()
  private readonly cache = new Map<string, Promise<GLTF>>()
  async instantiate(url: string): Promise<THREE.Group> {
    let pending = this.cache.get(url)
    if (!pending) {
      pending = this.loader.loadAsync(url).then((gltf) => {
        if (url === '/world/portal.frame.glb') {
          gltf.scene.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return
            const source = object.geometry
            object.geometry = repairPortalFrame(source)
            source.dispose()
          })
        }
        return gltf
      })
      this.cache.set(url, pending)
      pending.catch(() => this.cache.delete(url))
    }
    const source = await pending
    const instance = source.scene.clone(true)
    instance.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.userData.sharedAssetGeometry = true
      const clone = (material: THREE.Material) => {
        const copy = material.clone()
        if (copy.transparent) copy.depthWrite = false
        return copy
      }
      object.material = Array.isArray(object.material)
        ? object.material.map(clone)
        : clone(object.material)
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      object.castShadow = materials.every((m) => !m.transparent || m.opacity > 0.95)
      object.receiveShadow = true
    })
    return instance
  }
}
export const assets = new AssetLibrary()

export function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (object instanceof THREE.Sprite && object.userData.ownedLabelTexture) {
      object.material.map?.dispose()
      object.material.dispose()
    }
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      if (!object.userData.sharedAssetGeometry) object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((m) => m.dispose())
    }
  })
}
