/** Conservative actor envelopes and exit corridors; does not move actors. */
import { OBB } from 'three/addons/math/OBB.js'
import { Matrix3, Matrix4, Quaternion as RenderQuaternion, Vector3 } from 'three'
import { Body, Box, Quaternion, Vec3 } from './physics.js'
import type { Vehicle } from '../entity/vehicle/vehicle.js'
import type { Entity, Vec3Tuple } from '../entity/schema.js'
const vec = (v: Vec3): Vec3Tuple => [v.x, v.y, v.z]
/** Include authored bodywork, suspension and tyre rims in world-space metres. */
export function portalEnvelope(body: Body, vehicle?: Vehicle): Vec3Tuple[] {
  const points: Vec3Tuple[] = []
  const addBox = (half: Vec3, offset: Vec3, q: Quaternion) => {
    for (const x of [-1, 1])
      for (const y of [-1, 1])
        for (const z of [-1, 1]) {
          const point = q.vmult(new Vec3(x * half.x, y * half.y, z * half.z)).vadd(offset)
          points.push(vec(body.pointToWorldFrame(point)))
        }
  }
  body.shapes.forEach((shape, i) => {
    if (shape instanceof Box)
      addBox(shape.halfExtents, body.shapeOffsets[i], body.shapeOrientations[i])
  })
  if (vehicle) {
    const [w, h, l] = vehicle.entity.size
    // Include bodywork and the full suspension/wheel envelope, not just the chassis collider.
    const floor = Math.min(
      ...vehicle.definition.hubs.map(
        (hub, i) =>
          hub[1] +
          vehicle.definition.suspensionRest -
          vehicle.definition.wheelRadius -
          vehicle.raycast.wheelInfos[i].suspensionLength,
      ),
    )
    const radius = vehicle.definition.wheelRadius
    // Bodywork starts above the tire bottoms. Extending the lowest spring height
    // over the full car length invents corners below the road under pitch.
    addBox(
      new Vec3(w / 2, (h - radius) / 2, l / 2),
      new Vec3(0, floor + (h + radius) / 2, 0),
      new Quaternion(),
    )
    vehicle.definition.hubs.forEach((hub, i) => {
      const wheel = vehicle.raycast.wheelInfos[i]
      const centre = new Vec3(
        hub[0],
        hub[1] + vehicle.definition.suspensionRest - wheel.suspensionLength,
        hub[2],
      )
      const steering = new Quaternion().setFromAxisAngle(new Vec3(0, 1, 0), wheel.steering)
      for (const side of [-1, 1])
        for (let j = 0; j < 16; j++) {
          const angle = (j * Math.PI) / 8
          const rim = steering
            .vmult(
              new Vec3(side * radius * 0.37, Math.cos(angle) * radius, Math.sin(angle) * radius),
            )
            .vadd(centre)
          points.push(vec(body.pointToWorldFrame(rim)))
        }
    })
  }
  return points
}
/** Check a conservative exit corridor against active and distance-suspended physical obstacles. */
export function portalExitBlocked(
  body: Body,
  position: Vector3,
  quaternion: RenderQuaternion,
  destination: Entity,
  candidates: readonly Body[],
): boolean {
  const normal = new Vector3(0, 0, 1).applyQuaternion(
    new RenderQuaternion(...destination.transform.rotation),
  )
  const shapeBoxes = (other: Body): OBB[] =>
    other.shapes.flatMap((shape, i) => {
      if (!(shape instanceof Box) || !shape.collisionResponse) return []
      const p = other.pointToWorldFrame(other.shapeOffsets[i]),
        q = other.quaternion.mult(other.shapeOrientations[i])
      return [
        new OBB(
          new Vector3(...vec(p)),
          new Vector3(...vec(shape.halfExtents)).multiplyScalar(0.995),
          new Matrix3().setFromMatrix4(
            new Matrix4().makeRotationFromQuaternion(new RenderQuaternion(q.x, q.y, q.z, q.w)),
          ),
        ),
      ]
    })
  const obstacles = [...new Set(candidates)].filter((b) => b !== body).flatMap(shapeBoxes)
  // Check a clear exit corridor at transfer time; cross-seam contacts are not simulated.
  const length = Math.max(...body.shapes.map((s) => s.boundingSphereRadius), 1) + 0.25
  for (let distance = 0; distance <= length; distance += 0.25) {
    for (let i = 0; i < body.shapes.length; i++) {
      const shape = body.shapes[i]
      if (!(shape instanceof Box)) continue
      const centre = new Vector3(...vec(body.shapeOffsets[i]))
        .applyQuaternion(quaternion)
        .add(position)
        .addScaledVector(normal, distance)
      const q = quaternion
        .clone()
        .multiply(
          new RenderQuaternion(
            ...([
              body.shapeOrientations[i].x,
              body.shapeOrientations[i].y,
              body.shapeOrientations[i].z,
              body.shapeOrientations[i].w,
            ] as [number, number, number, number]),
          ),
        )
      const bounds = new OBB(
        centre,
        new Vector3(...vec(shape.halfExtents)).multiplyScalar(0.98),
        new Matrix3().setFromMatrix4(new Matrix4().makeRotationFromQuaternion(q)),
      )
      if (obstacles.some((obstacle) => bounds.intersectsOBB(obstacle))) return true
    }
  }
  return false
}
