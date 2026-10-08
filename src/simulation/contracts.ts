/** Device-independent input and copied player snapshots. Distances are metres; yaw is radians. */
import type { Vec3Tuple } from '../entity/schema.js'
export interface PlayerInput {
  forward: number
  right: number
  yaw: number // radians; yaw=0 faces -Z, positive turns left
  sprint: boolean
  jump: boolean // request; consumed once on the next simulation tick
  brake: boolean
  lift?: number // -1 descend, +1 ascend; neutral holds altitude
  turn?: number // -1 left, +1 right; independent of camera yaw
  riderRight?: number // two-wheelers: rider counterweight, -1 hang off left, +1 right
  riderForward?: number // two-wheelers: -1 sit back, +1 weight over the tank
  frontBrake?: number // two-wheelers: front lever held with the throttle (Shift + W + S), 0..1
}
export const idleInput = (): PlayerInput => ({
  forward: 0,
  right: 0,
  yaw: 0,
  sprint: false,
  jump: false,
  brake: false,
})
export interface PlayerSnapshot {
  position: Vec3Tuple // body centre, metres
  yaw: number
  grounded: boolean
  vehicleId: string | null
  interiorId: string | null
  speed: number // metres per second
}
