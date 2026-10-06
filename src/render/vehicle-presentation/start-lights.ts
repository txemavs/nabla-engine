/** Light switch position that follows the occupied vehicle's engine start-up. */
import type { VehicleLightController, VehicleLightMode } from './light-controller.js'

/** The part of `Simulation.vehicleInfo` that says whether the engine runs. */
export interface EngineState {
  /** Start-up phase: `cranking`, `sweep` or `running`. */
  ignition: string
  /** `off` while the vehicle is switched off (e.g. a host holding the engine). */
  helm: string
}

/** True once the start-up sequence is over and the vehicle is not switched off. */
export const engineRunning = (info: EngineState): boolean =>
  info.ignition === 'running' && info.helm !== 'off'

/**
 * Lights off while getting in and during the start-up (P, starter, needle sweep), then `mode`
 * (default `position`) once the engine runs; off again if the engine is switched off. With
 * `ignition: false` the engine runs from the first frame, so `mode` comes on at entry. A mode the
 * driver picks with H during the start-up is kept. One instance per scene view.
 */
export class StartLights {
  private vehicle: string | null = null
  private controller: VehicleLightController | undefined
  private running = false
  constructor(public mode: VehicleLightMode = 'position') {}
  /**
   * Call every frame with the occupied vehicle (null on foot), its engine state and its light
   * controller (undefined while the model is still loading or the vehicle has no lights).
   */
  update(
    vehicleId: string | null,
    engine: EngineState | null,
    controller: VehicleLightController | undefined,
  ): void {
    const running = !!engine && engineRunning(engine)
    if (vehicleId !== this.vehicle || controller !== this.controller) {
      // Entered (or the model finished loading): start from the switch position the engine allows.
      this.vehicle = vehicleId
      this.controller = controller
      this.running = running
      if (vehicleId && controller) controller.mode = running ? this.mode : 'off'
      return
    }
    if (!vehicleId || !controller || running === this.running) return
    this.running = running
    if (!running) controller.mode = 'off'
    else if (controller.mode === 'off') controller.mode = this.mode
  }
}
