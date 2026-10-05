/** Renderer-independent vehicle light switches and channel evaluation, shared by every adapter. */
import { lightingDefaults } from '../../config/lighting.js'

export interface VehicleLampState {
  powered: boolean
  braking: boolean
  reversing: boolean
}
export type VehicleLightChannel =
  | 'position'
  | 'brake'
  | 'tail-stop'
  | 'reverse'
  | 'signal'
  | 'marker'
  | 'front-signal'
  | 'low'
  | 'high'
  | 'fog'

/** A trailer samples its tractor's controller and telemetry, without copying switches or clocks. */
export class VehicleLightController {
  enabled = false
  highBeam = false
  signal = 0
  constructor(readonly flashMs = lightingDefaults.signalFlashMs) {}
  toggleLights(): boolean {
    return (this.enabled = !this.enabled)
  }
  toggleHighBeam(): boolean {
    return (this.highBeam = !this.highBeam)
  }
  toggleSignal(side: number): void {
    this.signal = this.signal === side ? 0 : side
  }
  /** Report a selected side independently of the on/off blink phase. */
  indicating(side: number, state: VehicleLampState): boolean {
    return state.powered && side !== 0 && this.signal === side
  }
  /** Return a multiplier for an authored lamp intensity; no geometry or material names are used. */
  level(channel: VehicleLightChannel, side: number, state: VehicleLampState, now: number): number {
    if (!state.powered) return 0
    const flash = Math.floor(now / this.flashMs) % 2 === 0
    switch (channel) {
      case 'reverse':
        return Number(state.reversing)
      case 'brake':
        return Number(state.braking)
      case 'tail-stop':
        return state.braking ? lightingDefaults.brakeBoost : Number(this.enabled)
      case 'signal':
        return Number(this.indicating(side, state) && flash)
      case 'marker':
      case 'front-signal':
        return this.indicating(side, state) ? Number(flash) : Number(this.enabled)
      case 'low':
        return Number(this.enabled && !this.highBeam)
      case 'high':
        return Number(this.enabled && this.highBeam)
      case 'fog':
        return 0
      default:
        return Number(this.enabled)
    }
  }
}
