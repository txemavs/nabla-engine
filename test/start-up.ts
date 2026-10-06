import { roadVehicleDefaults } from '../src/config/simulation.js'

/** Seconds from entering a road vehicle until the start-up ends (cranking, then needle sweep). */
export const START_UP_SECONDS =
  roadVehicleDefaults.ignitionSweepSeconds + roadVehicleDefaults.ignitionCrankSeconds

/**
 * Step through the start-up sequence that follows entering a road vehicle, for tests whose
 * subject is driving rather than the start-up itself. The vehicle is still in P afterwards.
 */
export function finishStartUp(sim: { step(seconds: number): void }, dt = 1 / 60): void {
  for (let i = 0; i < Math.ceil(START_UP_SECONDS / dt) + 1; i++) sim.step(dt)
}
