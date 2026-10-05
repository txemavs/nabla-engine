/** Turn keyboard taps into a gradual steering demand; analog controls bypass this filter. */
import { controlDefaults } from '../../config/controls.js'
export class KeyboardSteering {
  private value = 0
  private vehicle: string | null = null
  reset(): void {
    this.value = 0
    this.vehicle = null
  }
  update(vehicle: string | null, demand: number, elapsed: number): number {
    if (vehicle !== this.vehicle) {
      this.value = 0
      this.vehicle = vehicle
    }
    if (!vehicle) return demand
    // A non-finite demand or frame time must never poison the filter state: NaN would stay in
    // `value` forever and freeze steering until the vehicle changes.
    demand = Number.isFinite(demand) ? Math.max(-1, Math.min(1, demand)) : 0
    if (!Number.isFinite(this.value)) this.value = 0
    const dt = Number.isFinite(elapsed)
      ? Math.min(controlDefaults.steeringMaxStepSeconds, Math.max(0, elapsed))
      : 0
    // Build steering gently; release/countersteer promptly so the filter never feels stuck.
    const tau =
      demand === 0 || demand * this.value < 0
        ? controlDefaults.steeringReleaseSeconds
        : controlDefaults.steeringRiseSeconds
    this.value += (demand - this.value) * (1 - Math.exp(-dt / tau))
    if (Math.abs(this.value) < controlDefaults.steeringSnapThreshold) this.value = 0
    return this.value
  }
}
