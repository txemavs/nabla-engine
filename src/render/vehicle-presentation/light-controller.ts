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

/**
 * Driving-light switch position: `off` (apagadas), `position` (posición: front and rear position
 * lamps, no beam) or `low` (cruce: position lamps plus dipped beams; `highBeam` swaps them for
 * main beams). H cycles off → position → low → off.
 */
export type VehicleLightMode = 'off' | 'position' | 'low'
/** Order of `VehicleLightController.toggleLights` (H). */
export const vehicleLightCycle: readonly VehicleLightMode[] = ['off', 'position', 'low']

/** A trailer samples its tractor's controller and telemetry, without copying switches or clocks. */
export class VehicleLightController {
  mode: VehicleLightMode = 'off'
  highBeam = false
  signal = 0
  constructor(readonly flashMs = lightingDefaults.signalFlashMs) {}
  /** Any driving light on (position or dipped). Setting true from `off` selects dipped beams. */
  get enabled(): boolean {
    return this.mode !== 'off'
  }
  set enabled(on: boolean) {
    this.mode = !on ? 'off' : this.mode === 'off' ? 'low' : this.mode
  }
  /** Step the light switch: off → position → low (dipped) → off. Returns the new mode. */
  cycleLights(): VehicleLightMode {
    const next = (vehicleLightCycle.indexOf(this.mode) + 1) % vehicleLightCycle.length
    return (this.mode = vehicleLightCycle[next])
  }
  /** `cycleLights`, reporting whether any driving light is now on. */
  toggleLights(): boolean {
    this.cycleLights()
    return this.enabled
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
        return Number(this.mode === 'low' && !this.highBeam)
      case 'high':
        return Number(this.mode === 'low' && this.highBeam)
      case 'fog':
        return 0
      default:
        return Number(this.enabled)
    }
  }
  /**
   * Like `level`, for a lens emitter rather than a light source: in position mode a low-beam lens
   * keeps a faint `positionLensGlow`, so a lamp unit without its own position bulb still glows.
   */
  glow(channel: VehicleLightChannel, side: number, state: VehicleLampState, now: number): number {
    if (channel === 'low' && state.powered && this.mode === 'position')
      return lightingDefaults.positionLensGlow
    return this.level(channel, side, state, now)
  }
}
