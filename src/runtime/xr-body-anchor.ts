import * as THREE from 'three'

/** Head-relative body frame shared by carried equipment and AR driving stations. No head pitch/roll. */
export function updateXRBodyAnchor(body: THREE.Object3D, camera: THREE.Camera): void {
  body.position.copy(camera.getWorldPosition(new THREE.Vector3()))
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
    camera.getWorldQuaternion(new THREE.Quaternion()),
  )
  body.rotation.set(0, Math.atan2(-forward.x, -forward.z), 0)
  body.updateWorldMatrix(true, true)
}

/** Estimate torso yaw: looking around inside the neck range must not drag the inventory. */
export class XRBodyAnchor {
  private yaw: number | undefined
  private readonly forward = new THREE.Vector3()
  private readonly rotation = new THREE.Quaternion()
  reset(): void {
    this.yaw = undefined
  }
  update(body: THREE.Object3D, camera: THREE.Camera, dt: number): void {
    body.position.copy(camera.getWorldPosition(this.forward))
    this.forward.set(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(this.rotation))
    // Heading becomes ambiguous when looking straight up/down. Keep the torso steady.
    if (Math.hypot(this.forward.x, this.forward.z) > 0.2) {
      const headYaw = Math.atan2(-this.forward.x, -this.forward.z)
      if (this.yaw === undefined) this.yaw = headYaw
      else {
        const delta = Math.atan2(Math.sin(headYaw - this.yaw), Math.cos(headYaw - this.yaw))
        const excess = Math.max(0, Math.abs(delta) - THREE.MathUtils.degToRad(35))
        const elapsed = Number.isFinite(dt) ? THREE.MathUtils.clamp(dt, 0, 0.1) : 0
        const step = Math.min(excess * (1 - Math.exp(-5 * elapsed)), (elapsed * Math.PI) / 3)
        this.yaw += Math.sign(delta) * step
      }
    }
    body.rotation.set(0, this.yaw ?? 0, 0)
    body.updateWorldMatrix(true, true)
  }
}
