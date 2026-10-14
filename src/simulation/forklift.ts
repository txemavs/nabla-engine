import { Box, Vec3, Quaternion } from './physics.js'
import type { Vehicle } from '../entity/vehicle/vehicle.js'

export type ForkliftInput = [number, number, number]
export class ForkliftMechanism {
  lift = 0
  tilt = 0
  side = 0
  private shapes: Box[] = []
  constructor(readonly vehicle: Vehicle) {
    // Two tines and the load backrest share the same chassis-local mast pivot.
    for (const size of [
      [0.105, 0.055, 1.18],
      [0.105, 0.055, 1.18],
      [0.9, 0.7, 0.06],
    ]) {
      const shape = new Box(new Vec3(size[0] / 2, size[1] / 2, size[2] / 2))
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
    const points = [
      [-0.235 + this.side, -0.06 + this.lift, -0.82],
      [0.235 + this.side, -0.06 + this.lift, -0.82],
      [this.side, 0.44 + this.lift, -0.16],
    ]
    const body = this.vehicle.body
    points.forEach((point, j) => {
      const index = body.shapes.indexOf(this.shapes[j])
      const p = rotation.vmult(new Vec3(...point))
      p.y += 0.1
      p.z -= 1.1
      body.shapeOffsets[index].copy(p)
      body.shapeOrientations[index].copy(rotation)
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
