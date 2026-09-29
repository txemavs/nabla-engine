import * as THREE from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'
/** Fit the whole mirror from the eye position, independently of head rotation.
 * The viewer's orientation only decides whether the mirror is visible.
 */
export function fitMirrorCamera(
  target: THREE.PerspectiveCamera,
  viewer: THREE.PerspectiveCamera,
  mirror: THREE.Mesh,
  aspect = 384 / 256,
): void {
  viewer.getWorldPosition(target.position)
  target.up.set(0, 1, 0).transformDirection(mirror.matrixWorld)
  target.lookAt(mirror.getWorldPosition(new THREE.Vector3()))
  target.updateMatrixWorld(true)
  mirror.geometry.computeBoundingBox()
  const box = mirror.geometry.boundingBox!
  let slope = 0
  target.aspect = aspect
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) {
        const p = new THREE.Vector3(x, y, z)
          .applyMatrix4(mirror.matrixWorld)
          .applyMatrix4(target.matrixWorldInverse)
        slope = Math.max(
          slope,
          Math.abs(p.y) / Math.max(0.001, -p.z),
          Math.abs(p.x) / (Math.max(0.001, -p.z) * target.aspect),
        )
      }
  target.fov = THREE.MathUtils.radToDeg(2 * Math.atan(slope * 1.02))
  target.near = Math.min(viewer.near, 0.01)
  target.far = viewer.far
  target.updateProjectionMatrix()
}
/** Optical elevation follows the car rather than the driver's head pitch. */
export function raisedMirrorNormal(
  normal: THREE.Vector3,
  up: THREE.Vector3,
  degrees = -2,
): THREE.Vector3 {
  const n = normal.clone().normalize()
  const tangent = up.clone().addScaledVector(n, -up.dot(n)).normalize()
  const angle = THREE.MathUtils.degToRad(degrees)
  return n.multiplyScalar(Math.cos(angle)).addScaledVector(tangent, Math.sin(angle)).normalize()
}
export interface MirrorPolicy {
  width?: number
  height?: number
  intervalMs?: number
}
/** Side mirrors render only in the occupied cockpit, at most 8 Hz. */
export class CarMirrors {
  private entries: {
    normal: THREE.Vector3
    up: THREE.Vector3
    rotation: THREE.Quaternion
    original: THREE.Mesh
    mirror: Reflector
    render: Reflector['onBeforeRender']
    capture: THREE.PerspectiveCamera
  }[] = []
  private next = 0
  private frames = 0
  constructor(
    candidates: readonly THREE.Mesh[],
    carUp = new THREE.Vector3(0, 1, 0),
    tilt = -2,
    private readonly policy: MirrorPolicy = {},
  ) {
    if (
      ![policy.width ?? 384, policy.height ?? 256, policy.intervalMs ?? 125].every(
        (v) => Number.isFinite(v) && v > 0,
      )
    )
      throw new Error('Invalid mirror policy')
    for (const original of candidates) {
      if (!original.parent || !original.geometry.getAttribute('normal')) {
        console.warn('Mirror omitted: missing parent or surface normals')
        continue
      }
      original.updateWorldMatrix(true, false)
      const geometry = original.geometry.clone()
      geometry.applyMatrix4(original.matrix)
      geometry.computeBoundingBox()
      const centre = geometry.boundingBox!.getCenter(new THREE.Vector3())
      const normals = geometry.getAttribute('normal'),
        normal = new THREE.Vector3()
      for (let i = 0; i < normals.count; i++)
        normal.add(new THREE.Vector3().fromBufferAttribute(normals, i))
      normal.normalize()
      const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
      const basis = new THREE.Matrix4().compose(centre, rotation, new THREE.Vector3(1, 1, 1))
      geometry.applyMatrix4(basis.clone().invert())
      // The authored lens is slightly curved. Place a planar reflection at its
      // frontmost surface so the oblique clip plane excludes its own housing.
      geometry.computeBoundingBox()
      centre.addScaledVector(normal, geometry.boundingBox!.max.z + 0.003)
      const positions = geometry.getAttribute('position')
      for (let i = 0; i < positions.count; i++) positions.setZ(i, 0)
      positions.needsUpdate = true
      geometry.computeBoundingBox()
      geometry.computeBoundingSphere()
      const mirror = new Reflector(geometry, {
        textureWidth: policy.width ?? 384,
        textureHeight: policy.height ?? 256,
        color: 0xaaaaaa,
        multisample: 0,
        clipBias: 0.003,
      })
      mirror.position.copy(centre)
      // Tilt the glass toward vehicle-up (both GLB housings use different local axes).
      // The property specifies glass tilt; the reflected view changes at twice that angle.
      const up = carUp
        .clone()
        .applyQuaternion(original.parent!.getWorldQuaternion(new THREE.Quaternion()).invert())
      const raisedNormal = raisedMirrorNormal(normal, up, tilt)
      // Preserve the lens roll: reconstructing a quaternion from +Z is ambiguous
      // near -Z and can rotate the silhouette out of its housing.
      mirror.quaternion
        .copy(rotation)
        .premultiply(new THREE.Quaternion().setFromUnitVectors(normal, raisedNormal))
      mirror.visible = false
      original.parent!.add(mirror)
      const render = mirror.onBeforeRender
      mirror.onBeforeRender = () => {}
      this.entries.push({
        original,
        mirror,
        render,
        normal,
        up,
        rotation,
        capture: new THREE.PerspectiveCamera(),
      })
    }
  }
  setTilt(degrees: number): void {
    const tilt = THREE.MathUtils.clamp(degrees, -5, 12)
    for (const e of this.entries)
      e.mirror.quaternion
        .copy(e.rotation)
        .premultiply(
          new THREE.Quaternion().setFromUnitVectors(
            e.normal,
            raisedMirrorNormal(e.normal, e.up, tilt),
          ),
        )
    this.next = 0
  }
  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    enabled: boolean,
    now: number,
  ): void {
    for (const e of this.entries) {
      e.mirror.visible = enabled
      e.original.visible = !enabled
    }
    renderer.domElement.dataset.mirrorActive = String(enabled && this.entries.length > 0)
    renderer.domElement.dataset.mirrorFrames = String(this.frames)
    if (!enabled || now < this.next) return
    this.next = now + (this.policy.intervalMs ?? 125)
    scene.updateMatrixWorld(true)
    camera.updateMatrixWorld(true)
    const projection = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    )
    const frustum = new THREE.Frustum().setFromProjectionMatrix(projection)
    const background = scene.background,
      autoClear = renderer.autoClear
    const visible = this.entries.map((e) => e.mirror.visible)
    try {
      // No recursive mirror captures; keep an inexpensive atmospheric background.
      for (const e of this.entries) {
        e.mirror.visible = false
        e.original.visible = true
      }
      if (!scene.background) scene.background = scene.fog?.color ?? new THREE.Color('#50677d')
      renderer.autoClear = true
      for (const e of this.entries) {
        if (!frustum.intersectsObject(e.mirror)) continue
        const eye = camera.position.clone().sub(e.mirror.getWorldPosition(new THREE.Vector3()))
        const normal = new THREE.Vector3(0, 0, 1).transformDirection(e.mirror.matrixWorld)
        if (eye.dot(normal) <= 0) continue
        fitMirrorCamera(
          e.capture,
          camera,
          e.mirror,
          (this.policy.width ?? 384) / (this.policy.height ?? 256),
        )
        e.original.visible = false
        e.render.call(
          e.mirror,
          renderer,
          scene,
          e.capture,
          e.mirror.geometry,
          e.mirror.material as THREE.Material,
          null!,
        )
        e.mirror.visible = false
        e.original.visible = true
        this.frames++
      }
    } finally {
      scene.background = background
      renderer.autoClear = autoClear
      this.entries.forEach((e, i) => {
        e.mirror.visible = visible[i]
        e.original.visible = !enabled
      })
      renderer.domElement.dataset.mirrorFrames = String(this.frames)
    }
  }
  dispose(): void {
    for (const e of this.entries) {
      e.original.visible = true
      e.mirror.removeFromParent()
      e.mirror.geometry.dispose()
      e.mirror.dispose()
    }
    this.entries = []
  }
}
