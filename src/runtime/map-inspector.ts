import { Euler, Quaternion, Vector3 } from 'three'

/** Free inspection camera. Owns no simulation state: movement cannot move the player. */
export class MapInspector {
  readonly position: Vector3
  readonly home: Vector3
  readonly rotation = new Quaternion()
  yaw: number
  pitch: number
  returning = false
  constructor(position: Vector3, rotation: Quaternion) {
    this.home = position.clone()
    this.position = position.clone().add(new Vector3(0, 30, 0))
    const angles = new Euler().setFromQuaternion(rotation, 'YXZ')
    this.yaw = angles.y
    this.pitch = -Math.PI / 6
    this.look(0, 0)
  }
  look(dx: number, dy: number): void {
    if (this.returning) return
    this.yaw -= dx * 0.002
    this.pitch = Math.max(
      -Math.PI / 2 + 0.01,
      Math.min(Math.PI / 2 - 0.01, this.pitch - dy * 0.002),
    )
    this.rotation.setFromEuler(new Euler(this.pitch, this.yaw, 0, 'YXZ'))
  }
  step(keys: ReadonlySet<string>, dt: number): void {
    if (this.returning) return
    const held = (...codes: string[]) => Number(codes.some((code) => keys.has(code)))
    const forward = held('KeyW', 'ArrowUp') - held('KeyS', 'ArrowDown')
    const right = held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft')
    const length = Math.max(1, Math.hypot(forward, right))
    const speed = held('ShiftLeft', 'ShiftRight') ? 800 : 200
    const distance = Math.min(0.1, Math.max(0, dt)) * speed
    this.position.x +=
      ((-Math.sin(this.yaw) * forward + Math.cos(this.yaw) * right) / length) * distance
    this.position.z +=
      ((-Math.cos(this.yaw) * forward - Math.sin(this.yaw) * right) / length) * distance
    this.position.y += (held('KeyE', 'PageUp') - held('KeyQ', 'PageDown')) * distance
  }
}
