/** Metres, Y-up, front = -Z. Plain configuration for passive trailer axles. */
export type WheelVector = [number, number, number]

/** Per-axle configuration for trailer wheels. */
export interface TrailerAxleDefinition {
  /** Positions of wheel hubs on this axle (typically 2 for a dual-wheel axle). */
  hubs: WheelVector[]
  /** Wheel radius in metres. */
  wheelRadius: number
  /** Optional brake force; trailers may have service brakes. */
  brakeForce?: number
}

/**
 * Trailer definition for passive towed vehicles.
 * Trailers have no steering, no drive, only passive rolling wheels and optional brakes.
 */
export interface TrailerDefinition {
  /** Kingpin position in local coordinates (where the trailer couples to the tractor). */
  kingpin: WheelVector
  /** Axle configurations (can be multiple for multi-axle trailers). */
  axles: TrailerAxleDefinition[]
  /** Suspension rest length in metres. */
  suspensionRest: number
  /** Suspension travel in metres. */
  suspensionTravel?: number
  /** Suspension stiffness. */
  stiffness: number
  /** Overall brake force (distributed across axles). */
  brakeForce: number
}

/** Device-independent trailer brake command. */
export interface TrailerInput {
  /** Service brake 0..1. */
  brake: number
  /** Parking brake engaged. */
  parkingBrake: boolean
}

export const idleTrailerInput = (): TrailerInput => ({
  brake: 0,
  parkingBrake: false,
})

/** Trailer wheel contact snapshot (same format as wheeled for rendering compatibility). */
export interface TrailerWheelSnapshot {
  readonly wheelCenter: WheelVector
  readonly contactPoint: WheelVector | null
  readonly contactNormal: WheelVector | null
  readonly suspensionLength: number
  readonly isInContact: boolean
}
