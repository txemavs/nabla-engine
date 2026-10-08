import { ejectionDefaults } from '../config/simulation.js'

/** Thrown off and flying, down on the ground (sliding, then lying still), or getting up. */
export type EjectionPhase = 'flying' | 'down' | 'rising'

/** A rider thrown off a crashed two-wheeler, from the throw until control returns. */
export interface RiderEjection {
  readonly phase: EjectionPhase
  /** Seconds in the current phase, and since the throw. */
  readonly phaseElapsed: number
  readonly elapsed: number
  /** Seconds lying still after the slide stopped (down phase). */
  readonly still: number
  /** Crash speed when thrown, m/s. */
  readonly speed: number
  /** Speed when the rider hit the ground, m/s (0 until then). */
  readonly hit: number
  /** The machine the rider came off. */
  readonly vehicleId: string
}

type EjectionSettings = typeof ejectionDefaults

/** A fresh ejection at the throw. */
export function startEjection(vehicleId: string, speed: number): RiderEjection {
  return { phase: 'flying', phaseElapsed: 0, elapsed: 0, still: 0, speed, hit: 0, vehicleId }
}

/**
 * Advance one tick: the first ground contact after `minFlightSeconds` ends the flight (`speed` is then the hit speed),
 * the slide ends below `restSpeed`, `downSeconds` later the rider gets up, and `riseSeconds`
 * after that control returns (null). `maxSeconds` without landing also starts getting up.
 */
export function stepEjection(
  e: RiderEjection,
  grounded: boolean,
  speed: number,
  groundSpeed: number,
  dt: number,
  settings: EjectionSettings = ejectionDefaults,
): RiderEjection | null {
  const elapsed = e.elapsed + dt
  const next = (phase: EjectionPhase, patch: Partial<RiderEjection> = {}): RiderEjection => ({
    ...e,
    elapsed,
    phase,
    phaseElapsed: phase === e.phase ? e.phaseElapsed + dt : 0,
    ...patch,
  })
  if (e.phase === 'rising')
    return e.phaseElapsed + dt >= settings.riseSeconds ? null : next('rising')
  if (elapsed >= settings.maxSeconds) return next('rising')
  if (e.phase === 'flying')
    return grounded && elapsed >= settings.minFlightSeconds
      ? next('down', { hit: speed, still: 0 })
      : next('flying')
  const still = grounded && groundSpeed < settings.restSpeed ? e.still + dt : 0
  return still >= settings.downSeconds ? next('rising') : next('down', { still })
}

/** Ground friction on a sliding rider: the speed left after one tick, m/s. */
export function slideSpeed(
  speed: number,
  gravity: number,
  dt: number,
  settings: EjectionSettings = ejectionDefaults,
): number {
  return Math.max(0, speed - settings.friction * gravity * dt)
}
