import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/** Camera-facing in yaw only: the trunk retains world up, including in portal passes. */
export class UprightBillboard extends THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  constructor(material: THREE.MeshBasicMaterial) {
    super(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), material)
    this.onBeforeRender = (_renderer, _scene, camera) => this.face(camera)
  }
  private face(camera: THREE.Camera): void {
    const p = this.getWorldPosition(new THREE.Vector3())
    const eye = camera.getWorldPosition(new THREE.Vector3()).sub(p)
    if (eye.x * eye.x + eye.z * eye.z < 1e-10) return
    const world = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.atan2(eye.x, eye.z),
    )
    const parent = this.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion()
    this.quaternion.copy(parent.invert().multiply(world))
    this.updateMatrixWorld(true)
  }
  override raycast(ray: THREE.Raycaster, hits: THREE.Intersection[]): void {
    if (ray.camera) this.face(ray.camera)
    super.raycast(ray, hits)
  }
}

/** Two fixed cutout planes in a single draw call. Keep generic gallery sprites as billboards. */
export class CrossedTree extends THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial> {
  constructor(material: THREE.MeshLambertMaterial) {
    const front = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0)
    const side = front.clone().rotateY(Math.PI / 2)
    const geometry = mergeGeometries([front, side])
    front.dispose()
    side.dispose()
    super(geometry, material)
    this.castShadow = true
    this.receiveShadow = true
  }
}

export function softenFoliage(
  material: THREE.MeshBasicMaterial | THREE.MeshLambertMaterial,
  saturation: number,
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.foliageSaturation = { value: saturation }
    shader.fragmentShader = 'uniform float foliageSaturation;\n' + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      float luminance = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      diffuseColor.rgb = mix(vec3(luminance), diffuseColor.rgb, foliageSaturation);`,
    )
  }
  material.customProgramCacheKey = () => `foliage-${saturation}`
}
