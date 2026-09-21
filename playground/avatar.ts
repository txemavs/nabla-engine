import * as THREE from 'three'

/** Agency UI crtMesh.ts (89b0907): original five-part CRT, in metres and -Z forward. */
export function createMonitorAvatar(): THREE.Group {
  const root = new THREE.Group()
  // Agency orientation: the screen faces -Z, the direction of travel.
  const shell = new THREE.Group()
  shell.rotation.y = 0
  root.add(shell)
  const parts = [
    { p: [0, 0, 0.02], s: [0.34, 0.34, 0.28], c: [0.16, 0.14, 0.1], name: 'Housing' },
    { p: [0, 0.02, -0.125], s: [0.3, 0.26, 0.04], c: [0.58, 0.42, 0.16], name: 'Bezel' },
    { p: [0, 0.03, -0.148], s: [0.22, 0.16, 0.014], c: [0.22, 0.95, 0.32], name: 'Screen' },
    { p: [-0.09, -0.13, -0.14], s: [0.045, 0.045, 0.035], c: [0.72, 0.55, 0.18], name: 'Knob' },
    { p: [0.09, -0.13, -0.14], s: [0.045, 0.045, 0.035], c: [0.72, 0.55, 0.18], name: 'Knob' },
  ]
  for (const part of parts) {
    const color = new THREE.Color().setRGB(...(part.c as [number, number, number]))
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.15 })
    if (part.name === 'Screen') {
      material.emissive.copy(color)
      material.emissiveIntensity = 0.65
    }
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...(part.s as [number, number, number])),
      material,
    )
    mesh.position.fromArray(part.p)
    mesh.name = part.name
    mesh.castShadow = true
    mesh.receiveShadow = true
    shell.add(mesh)
  }
  root.scale.setScalar(1.65)
  return root
}

/** Presentation only: the existing player collider remains the sole locomotion body. */
export class MonitorMotion {
  private previous: THREE.Vector3 | null = null
  private velocity = new THREE.Vector3()
  private time = 0
  reset(): void {
    this.previous = null
    this.velocity.set(0, 0, 0)
  }
  update(model: THREE.Group, position: THREE.Vector3, yaw: number, dt: number): void {
    const elapsed = Math.min(Math.max(dt, 0), 0.1)
    this.time += elapsed
    const delta = this.previous ? position.clone().sub(this.previous) : new THREE.Vector3()
    const reset = !this.previous || delta.length() > 2 || elapsed < 0.001
    const measured = reset ? new THREE.Vector3() : delta.divideScalar(elapsed)
    const before = this.velocity.clone()
    if (reset) this.velocity.set(0, 0, 0)
    else this.velocity.lerp(measured, 1 - Math.exp(-10 * elapsed))
    const velocity = this.velocity.clone()
    const acceleration = reset
      ? new THREE.Vector3()
      : velocity.clone().sub(before).divideScalar(elapsed)
    this.previous = position.clone()
    const inverseYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw)
    velocity.applyQuaternion(inverseYaw)
    acceleration.applyQuaternion(inverseYaw)
    const pitch = THREE.MathUtils.clamp(velocity.z * 0.055 + acceleration.z * 0.004, -0.32, 0.32)
    const roll = THREE.MathUtils.clamp(-velocity.x * 0.055 - acceleration.x * 0.004, -0.3, 0.3)
    const target = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, 0, roll, 'YXZ'))
    if (reset) model.quaternion.copy(target)
    else model.quaternion.slerp(target, 1 - Math.exp(-7 * elapsed))
    model.position.y = 0.35 + Math.sin(this.time * 2.7) * 0.025 + Math.sin(this.time * 4.1) * 0.008
  }
}
