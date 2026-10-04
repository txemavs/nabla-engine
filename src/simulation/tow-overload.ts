/** Contact-load approximation for breakable trailer couplings; Rapier exposes contact impulses. */
import { roadVehicleDefaults } from '../config/simulation.js'
import { HingeConstraint, Vec3, World } from './physics.js'

export class TowOverload {
  private readonly loadedSeconds = new WeakMap<HingeConstraint, number>()
  /** Only reverse pushing can break the coupling; ordinary braking and road support do not count. */
  step(world: World, joint: HingeConstraint, reversing: boolean, dt: number): boolean {
    if (!reversing) {
      this.loadedSeconds.delete(joint)
      return false
    }
    let impulse = 0
    const up = joint.bodyB.quaternion.vmult(new Vec3(0, 1, 0))
    for (const collider of joint.bodyB.colliders) {
      world.raw.contactPairsWith(collider, (other) => {
        if (other.parent()?.handle === joint.bodyB.raw?.handle) return
        world.raw.contactPair(collider, other, (manifold) => {
          const normal = manifold.normal()
          // Ground support must not break the kingpin merely because the trailer is heavy.
          if (Math.abs(up.x * normal.x + up.y * normal.y + up.z * normal.z) > 0.65) return
          for (let i = 0; i < manifold.numContacts(); i++)
            impulse += Math.max(0, manifold.contactImpulse(i))
        })
      })
    }
    const force = impulse / dt
    const loaded =
      force >= roadVehicleDefaults.couplingBreakForce
        ? (this.loadedSeconds.get(joint) ?? 0) + dt
        : 0
    this.loadedSeconds.set(joint, loaded)
    return (
      force >= roadVehicleDefaults.couplingImpactForce ||
      loaded >= roadVehicleDefaults.couplingBreakSeconds
    )
  }
}
