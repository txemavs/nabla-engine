/** Shared gameplay HUD. Hosts choose its visibility; gameplay text and telemetry have one owner. */
export interface GameHudState {
  /** Speed readout for the active control profile; omitted keeps it (road vehicles). */
  showSpeed?: boolean
  /** Gear readout for the active control profile; omitted keeps it. */
  showGear?: boolean
  speedKmh: number
  gear: number | null
  /** Display text such as R, N, P, D or M3; falls back to the raw gear number. */
  gearLabel?: string | null
  vehicle: string | null
  cameraMode: string
  interaction: string
  wheelDebug: string
}
import { createRuntimeText, type RuntimeText } from './messages.js'

/**
 * Seated telemetry line: vehicle name, then speed and gear only when the control profile
 * shows them (road: `S3 · 42 km/h · D3`; flight: `Carrier`). Null on foot.
 */
export function hudTelemetry(state: GameHudState): string | null {
  if (!state.vehicle) return null
  const parts = [state.vehicle]
  if (state.showSpeed ?? true) parts.push(`${Math.round(state.speedKmh)} km/h`)
  if ((state.showGear ?? true) && state.gear !== null)
    parts.push(state.gearLabel ?? (state.gear < 0 ? 'R' : 'D' + state.gear))
  return parts.join(' · ')
}

export class GameHud {
  readonly root = document.createElement('div')
  private readonly telemetry = document.createElement('output')
  private readonly hint = document.createElement('div')
  private readonly debug = document.createElement('pre')
  constructor(
    host: HTMLElement,
    private readonly text: RuntimeText = createRuntimeText(),
  ) {
    this.root.className = 'nabla-game-hud'
    this.telemetry.className = 'nabla-game-hud-telemetry'
    this.hint.className = 'nabla-game-hud-hint'
    this.root.append(this.telemetry, this.hint, this.debug)
    host.append(this.root)
  }
  /** Render the same frame model in any browser host without reading the simulation again. */
  update(state: GameHudState): void {
    this.telemetry.textContent = hudTelemetry(state) ?? this.text(state.cameraMode)
    this.hint.textContent = this.text(state.interaction)
    this.debug.textContent = state.wheelDebug
    this.debug.hidden = !state.wheelDebug
  }
  /** Remove only the DOM owned by this HUD. */
  dispose(): void {
    this.root.remove()
  }
}
