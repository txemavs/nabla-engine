import * as THREE from 'three'

/** Rigid manipulation in world metres. Physics remains owned by the engine's World/Simulation. */
export class XRObjectGrab {
  readonly position = new THREE.Vector3()
  readonly quaternion = new THREE.Quaternion()
  readonly velocity = new THREE.Vector3()
  readonly angularVelocity = new THREE.Vector3()
  hands: THREE.Object3D[] = []
  private offset = new THREE.Vector3()
  private rotationOffset = new THREE.Quaternion()
  private up = new THREE.Vector3(0, 1, 0)
  private axis = new THREE.Vector3(1, 0, 0)
  private frameRotation = new THREE.Quaternion()
  private time = 0
  private samples: { time: number; p: THREE.Vector3; q: THREE.Quaternion }[] = []

  private frame(hands: readonly THREE.Object3D[]) {
    const p = hands[0].getWorldPosition(new THREE.Vector3())
    const q = hands[0].getWorldQuaternion(new THREE.Quaternion()).normalize()
    if (hands.length === 1) return { p, q }
    const other = hands[1].getWorldPosition(new THREE.Vector3())
    const axis = other.clone().sub(p)
    p.add(other).multiplyScalar(0.5)
    // Coincident hands cannot define an axis. Keep the last orientation until separated.
    if (axis.length() < 0.035) return { p, q: this.frameRotation.clone() }
    axis.normalize()
    const transportedUp = this.up
      .clone()
      .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(this.axis, axis))
    this.axis.copy(axis)
    const otherQ = hands[1].getWorldQuaternion(new THREE.Quaternion()).normalize()
    const up = new THREE.Vector3(0, 1, 0)
      .applyQuaternion(q)
      .add(new THREE.Vector3(0, 1, 0).applyQuaternion(otherQ))
    up.addScaledVector(axis, -up.dot(axis))
    if (up.lengthSq() < 0.01) up.copy(transportedUp).addScaledVector(axis, -transportedUp.dot(axis))
    if (up.lengthSq() < 0.01) {
      up.set(Math.abs(axis.y) < 0.9 ? 0 : 1, Math.abs(axis.y) < 0.9 ? 1 : 0, 0)
      up.addScaledVector(axis, -up.dot(axis))
    }
    up.normalize()
    // Choose the continuous branch when the wrists pass through an ambiguous orientation.
    if (up.dot(transportedUp) < 0) up.negate()
    this.up.copy(up)
    const z = axis.clone().cross(up).normalize()
    up.crossVectors(z, axis).normalize()
    q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(axis, up, z)).normalize()
    this.frameRotation.copy(q)
    return { p, q }
  }

  /** Update final old-hand pose first, then rebase new ownership: 1↔2 and handoff never snap. */
  update(object: THREE.Object3D, hands: readonly THREE.Object3D[], dt: number): boolean {
    const next = [...new Set(hands)].slice(0, 2)
    const wasHeld = this.hands.length > 0
    if (wasHeld) {
      const frame = this.frame(this.hands)
      this.position.copy(this.offset).applyQuaternion(frame.q).add(frame.p)
      this.quaternion.copy(frame.q).multiply(this.rotationOffset).normalize()
      this.apply(object)
      this.sample(dt)
    } else if (next.length) {
      object.getWorldPosition(this.position)
      object.getWorldQuaternion(this.quaternion).normalize()
      this.velocity.set(0, 0, 0)
      this.angularVelocity.set(0, 0, 0)
      this.samples = [{ time: this.time, p: this.position.clone(), q: this.quaternion.clone() }]
    }
    if (next.length !== this.hands.length || next.some((h, i) => h !== this.hands[i])) {
      this.hands = next
      if (next.length) {
        const frame = this.frame(next),
          inverse = frame.q.clone().invert()
        this.offset.copy(this.position).sub(frame.p).applyQuaternion(inverse)
        this.rotationOffset.copy(inverse).multiply(this.quaternion).normalize()
      }
    }
    return wasHeld && !next.length
  }
  private apply(object: THREE.Object3D): void {
    object.position.copy(this.position)
    object.quaternion.copy(this.quaternion)
    if (object.parent) {
      object.parent.worldToLocal(object.position)
      object.quaternion
        .premultiply(object.parent.getWorldQuaternion(new THREE.Quaternion()).invert())
        .normalize()
    }
    object.updateWorldMatrix(true, true)
  }
  private sample(dt: number): void {
    if (dt === 0) return
    if (!(dt > 0 && dt <= 0.1)) {
      this.samples = []
      this.velocity.set(0, 0, 0)
      this.angularVelocity.set(0, 0, 0)
      return
    }
    this.time += dt
    this.samples.push({ time: this.time, p: this.position.clone(), q: this.quaternion.clone() })
    while (this.samples.length > 2 && this.samples[1].time < this.time - 0.08) this.samples.shift()
    const first = this.samples[0],
      elapsed = this.time - first.time
    if (elapsed <= 0) return
    this.velocity.copy(this.position).sub(first.p).divideScalar(elapsed).clampLength(0, 12)
    const delta = this.quaternion.clone().multiply(first.q.clone().invert()).normalize()
    if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w)
    const sin = Math.hypot(delta.x, delta.y, delta.z)
    this.angularVelocity.set(delta.x, delta.y, delta.z)
    if (sin > 1e-8)
      this.angularVelocity
        .multiplyScalar((2 * Math.atan2(sin, delta.w)) / (sin * elapsed))
        .clampLength(0, 50)
    else this.angularVelocity.set(0, 0, 0)
  }
  /** Floating-origin shifts change coordinates, not the player's throw velocity. */
  shiftOrigin(offset: THREE.Vector3): void {
    this.position.add(offset)
    for (const sample of this.samples) sample.p.add(offset)
  }
  reset(): void {
    this.hands = []
    this.samples = []
    this.velocity.set(0, 0, 0)
    this.angularVelocity.set(0, 0, 0)
  }
}
