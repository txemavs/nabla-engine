/** Own the emergency planetary floor body; it is not a terrain substitute. */
import { Body, Box, Quaternion, Vec3, type World, type Material } from './physics.js'
import type { Transform, Vec3Tuple } from '../entity/schema.js'
import { EARTH_RADIUS, type GeoPoint } from '../math/geo/sphere.js'
import { CATCH_FLOOR_DEPTH, CATCH_FLOOR_RADIUS } from '../planet/catch-floor.js'
const vec = (v: Vec3): Vec3Tuple => [v.x, v.y, v.z]
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
/** Rotate local up onto the planetary radial normal, including antipodal alignment. */
function alignUp(up: Vec3): Quaternion {
  const dot = clamp(up.y, -1, 1)
  if (dot > 0.999999) return new Quaternion(0, 0, 0, 1)
  if (dot < -0.999999) return new Quaternion(1, 0, 0, 0)
  const axis = new Vec3(up.z, 0, -up.x)
  axis.normalize()
  return new Quaternion().setFromAxisAngle(axis, Math.acos(dot))
}
export class PlanetCatchFloor {
  private catchFloor: Body | null = null
  /** Borrow the world/material; this subsystem owns only its fallback body. */
  constructor(
    private readonly world: World,
    private readonly solidMaterial: Material,
  ) {}
  /** Read the top-face world pose for presentation, without exposing the body. */
  pose(): Transform | null {
    if (!this.catchFloor) return null
    const up = this.catchFloor.quaternion.vmult(new Vec3(0, 1, 0))
    return {
      position: vec(this.catchFloor.position.vadd(up.scale(0.5))),
      rotation: [
        this.catchFloor.quaternion.x,
        this.catchFloor.quaternion.y,
        this.catchFloor.quaternion.z,
        this.catchFloor.quaternion.w,
      ],
    }
  }
  /** Follow a submerged actor; geography and water level are geodetic/metres. */
  update(geo: GeoPoint, actor: Body, waterLevel: number): void {
    const sea = waterLevel - geo.altitude
    // A floating hull sits just under the surface. Wait until the fall is real,
    // then keep the disk until the actor climbs back out.
    const sunk = this.catchFloor ? 0 : 2
    if (
      actor.position.vadd(new Vec3(0, EARTH_RADIUS + geo.altitude, 0)).length() -
        EARTH_RADIUS -
        geo.altitude >=
      sea - sunk
    ) {
      this.dropCatchFloor()
      return
    }
    const center = new Vec3(0, -(EARTH_RADIUS + geo.altitude), 0)
    const radial = actor.position.vsub(center)
    const span = radial.length()
    if (span < 1) return
    radial.scale(1 / span, radial)
    const top = center.vadd(radial.scale(EARTH_RADIUS + waterLevel - CATCH_FLOOR_DEPTH))
    if (!this.catchFloor) {
      this.catchFloor = new Body({ mass: 0, material: this.solidMaterial })
      this.catchFloor.addShape(new Box(new Vec3(CATCH_FLOOR_RADIUS, 0.5, CATCH_FLOOR_RADIUS)))
      this.seatCatchFloor(top, radial)
      this.world.addBody(this.catchFloor)
      return
    }
    const up = this.catchFloor.quaternion.vmult(new Vec3(0, 1, 0))
    const current = this.catchFloor.position.vadd(up.scale(0.5))
    const offset = top.vsub(current)
    const rise = Math.abs(offset.dot(up))
    const drift = offset.vsub(up.scale(offset.dot(up))).length()
    if (drift > CATCH_FLOOR_RADIUS * 0.45 || rise > 0.05) this.seatCatchFloor(top, radial)
  }
  /** Synchronize current and previous transforms to avoid interpolation jumps. */
  private seatCatchFloor(top: Vec3, up: Vec3): void {
    const body = this.catchFloor!
    const rotation = alignUp(up)
    const position = top.vsub(rotation.vmult(new Vec3(0, 0.5, 0)))
    body.quaternion.copy(rotation)
    body.position.copy(position)
    body.previousPosition.copy(position)
    body.previousQuaternion.copy(rotation)
    body.velocity.setZero()
    body.angularVelocity.setZero()
  }
  /** Remove the owned body; safe to call repeatedly before freeing the world. */
  dropCatchFloor(): void {
    if (!this.catchFloor) return
    this.world.removeBody(this.catchFloor)
    this.catchFloor = null
  }
}
