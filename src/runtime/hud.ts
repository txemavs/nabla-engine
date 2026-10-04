/** Shared gameplay HUD. Hosts choose its visibility; gameplay text and telemetry have one owner. */
export interface GameHudState {
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
    this.root.style.cssText =
      'position:absolute;left:16px;bottom:16px;z-index:30;pointer-events:none;color:white;text-shadow:0 1px 3px black;font:14px system-ui;white-space:pre-line'
    this.telemetry.style.fontSize = '24px'
    this.root.append(this.telemetry, this.hint, this.debug)
    host.append(this.root)
  }
  /** Render the same frame model in any browser host without reading the simulation again. */
  update(state: GameHudState): void {
    this.telemetry.textContent = state.vehicle
      ? `${state.vehicle} · ${Math.round(state.speedKmh)} km/h${state.gear === null ? '' : ` · ${state.gearLabel ?? (state.gear < 0 ? 'R' : 'D' + state.gear)}`}`
      : this.text(state.cameraMode)
    this.hint.textContent = this.text(state.interaction)
    this.debug.textContent = state.wheelDebug
    this.debug.hidden = !state.wheelDebug
  }
  /** Remove only the DOM owned by this HUD. */
  dispose(): void {
    this.root.remove()
  }
}
