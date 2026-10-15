import { Box, Vec3, Quaternion } from './physics.js'
import type { Vehicle } from '../entity/vehicle/vehicle.js'

export type ForkliftInput = [number, number, number]
export class ForkliftMechanism {
  lift = 0
  tilt = 0
  side = 0
  private shapes: Box[] = []
  private get geometry() {
    return (
      this.vehicle.definition.forkliftGeometry ?? {
        pivot: [0, 0.1, -1.1],
        colliders: [
          {
            size: [0.105, 0.055, 1.18],
            transform: { position: [-0.235, -0.06, -0.82], rotation: [0, 0, 0, 1] },
          },
          {
            size: [0.105, 0.055, 1.18],
            transform: { position: [0.235, -0.06, -0.82], rotation: [0, 0, 0, 1] },
          },
          {
            size: [0.9, 0.7, 0.06],
            transform: { position: [0, 0.44, -0.16], rotation: [0, 0, 0, 1] },
          },
        ],
      }
    )
  }
  constructor(readonly vehicle: Vehicle) {
    for (const collider of this.geometry.colliders) {
      const shape = new Box(new Vec3(...collider.size).scale(0.5))
      this.shapes.push(shape)
      vehicle.body.addShape(shape)
    }
    this.update([0, 0, 0], 0)
  }
  update(input: ForkliftInput, dt: number): void {
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
    const axis = (i: number) => (Number.isFinite(input[i]) ? clamp(input[i], -1, 1) : 0)
    this.lift = clamp(this.lift + axis(0) * dt * 0.55, 0, 1.8)
    this.tilt = clamp(this.tilt + axis(1) * dt * 0.2, -0.12, 0.18)
    this.side = clamp(this.side + axis(2) * dt * 0.18, -0.18, 0.18)
    const rotation = new Quaternion().setFromAxisAngle(new Vec3(1, 0, 0), this.tilt)
    const body = this.vehicle.body
    this.geometry.colliders.forEach((collider, j) => {
      const index = body.shapes.indexOf(this.shapes[j])
      const local = new Vec3(...collider.transform.position)
      local.x += this.side
      local.y += this.lift
      const position = rotation.vmult(local).vadd(new Vec3(...this.geometry.pivot))
      body.shapeOffsets[index].copy(position)
      const rest = new Quaternion(...collider.transform.rotation)
      body.shapeOrientations[index].copy(rotation.mult(rest))
      body.updateShapeTransform(index)
    })
    if (input.some((v) => v !== 0)) {
      body.wakeUp()
      // Resting loads must wake when a fork starts moving beneath them.
      for (const load of body.world?.bodies ?? [])
        if (load.mass > 0 && load.position.distanceTo(body.position) < 5) load.wakeUp()
    }
  }
}
