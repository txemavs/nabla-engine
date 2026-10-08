import type { Vec3Tuple } from '../entity/schema.js'
import type { Simulation } from '../simulation/simulation.js'

/** Heights of one vehicle against the loaded ground, in metres (world Y). */
export interface VehicleGroundAudit {
  id: string
  name: string
  /** Ground under the body origin, from the same source `restParkedOnGround` uses. */
  ground: number | null
  bodyY: number
  /** Lowest wheel bottom (wheel centre minus its radius). */
  wheelBottom: number | null
  /** Ground under each wheel centre. */
  wheelGround: (number | null)[]
  /** Physics contact point per wheel (what the tyres really rest on). */
  contact: (number | null)[]
  /** Smallest wheel-bottom minus ground over the wheels: negative means sunk into the render ground. */
  minClearance: number | null
  /** Largest wheel-bottom minus ground: positive means floating. */
  maxClearance: number | null
}

export interface PlayerGroundAudit {
  mode: 'vehicle' | 'on-foot'
  /** Collider centre. */
  y: number
  /** Ground under the player. */
  ground: number | null
  /** Collider bottom minus ground. */
  feetClearance: number | null
  /** Nearest enterable vehicle id (null when none is in reach). */
  nearestVehicle: string | null
  /** Distance in metres to every vehicle, to explain a missing interaction hint. */
  distances: Record<string, number>
}

export interface GroundAudit {
  vehicles: VehicleGroundAudit[]
  player: PlayerGroundAudit
}

const finite = (value: number | undefined): number | null =>
  value !== undefined && Number.isFinite(value) ? value : null

/**
 * Measure where vehicles and the player sit relative to the ground. A diagnostic only: it reads
 * the simulation and the ground provider and changes neither. Used by tests and the headless
 * checks of the terrain example to prove nothing is sunk or floating.
 */
export function auditGround(
  sim: Pick<
    Simulation,
    'entityTransform' | 'wheelTransforms' | 'wheelContactInfo' | 'player' | 'nearestVehicle'
  >,
  vehicles: readonly { id: string; name: string; wheelRadius: number; rearWheelRadius?: number }[],
  ground: (position: Vec3Tuple) => number | undefined,
  playerHalfHeight: number,
): GroundAudit {
  const rows = vehicles.map((v): VehicleGroundAudit => {
    const body = sim.entityTransform(v.id).position
    const wheels = sim.wheelTransforms(v.id)
    const contacts = sim.wheelContactInfo(v.id)
    const wheelGround = wheels.map((w) => finite(ground(w.position)))
    const radius = (i: number) =>
      wheels.length === 2 && i === 1 ? (v.rearWheelRadius ?? v.wheelRadius) : v.wheelRadius
    const bottoms = wheels.map((w, i) => w.position[1] - radius(i))
    const clearances = bottoms.flatMap((bottom, i) =>
      wheelGround[i] === null ? [] : [bottom - wheelGround[i]!],
    )
    return {
      id: v.id,
      name: v.name,
      ground: finite(ground(body)),
      bodyY: body[1],
      wheelBottom: bottoms.length ? Math.min(...bottoms) : null,
      wheelGround,
      contact: contacts.map((c) => c.contactPoint?.[1] ?? null),
      minClearance: clearances.length ? Math.min(...clearances) : null,
      maxClearance: clearances.length ? Math.max(...clearances) : null,
    }
  })
  const player = sim.player
  const here = finite(ground(player.position))
  const distances: Record<string, number> = {}
  for (const v of vehicles) {
    const p = sim.entityTransform(v.id).position
    distances[v.id] = Math.hypot(
      p[0] - player.position[0],
      p[1] - player.position[1],
      p[2] - player.position[2],
    )
  }
  return {
    vehicles: rows,
    player: {
      mode: player.vehicleId ? 'vehicle' : 'on-foot',
      y: player.position[1],
      ground: here,
      feetClearance: here === null ? null : player.position[1] - playerHalfHeight - here,
      nearestVehicle: sim.nearestVehicle(),
      distances,
    },
  }
}
