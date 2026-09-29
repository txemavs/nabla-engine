import { Object3D, Vector3 } from 'three'

/** Host-driven support animation; never owns a frame loop or its mounted content. */
export class RetractableMount {
  open = false
  progress = 0
  private from = 0
  private started = 0
  private moving = false
  private readonly raised: Vector3
  private readonly travel: Vector3
  constructor(
    readonly root: Object3D,
    offset: readonly number[],
    readonly durationMs = 1800,
  ) {
    if (
      offset.length !== 3 ||
      !offset.every(Number.isFinite) ||
      !Number.isFinite(durationMs) ||
      durationMs <= 0
    )
      throw new Error('Invalid retractable mount')
    this.raised = root.position.clone()
    this.travel = new Vector3().fromArray(offset)
    this.reset()
  }
  toggle(now: number): boolean {
    // Sample the current animation before reversing, including between host frames.
    this.update(now)
    this.from = this.progress
    this.started = now
    this.open = !this.open
    this.moving = true
    return this.open
  }
  update(now: number): void {
    if (this.moving) {
      const t = Math.max(0, Math.min(1, (now - this.started) / this.durationMs))
      this.progress = this.from + ((this.open ? 1 : 0) - this.from) * t * t * (3 - 2 * t)
      this.moving = t < 1
    }
    this.root.position.copy(this.raised).addScaledVector(this.travel, 1 - this.progress)
    this.root.visible = this.progress > 0
  }
  reset(): void {
    this.open = false
    this.progress = this.from = 0
    this.moving = false
    this.update(0)
  }
}
