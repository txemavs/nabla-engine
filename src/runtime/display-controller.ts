import {
  autoResolutionScaleRange,
  resolveDisplaySettings,
  type DisplaySettings,
} from '../config/display.js'
import { AdaptiveResolutionScale, type ResolutionScaleState } from './resolution-scale.js'

/** Per-runtime display policy. The runtime still owns rendering, resizing and the frame loop. */
export class RuntimeDisplayController {
  private current: DisplaySettings
  private readonly adaptive: AdaptiveResolutionScale

  constructor(settings?: Partial<DisplaySettings>, preset?: string) {
    this.current = resolveDisplaySettings(settings, preset)
    this.adaptive = new AdaptiveResolutionScale({
      mode: this.current.resolutionScaleMode,
      scale: this.current.resolutionScale,
    })
    this.adaptive.setTargetFrameMs(this.current.maxFps ? 1000 / this.current.maxFps : null)
  }

  get settings(): Readonly<DisplaySettings> {
    return this.current
  }

  get state(): ResolutionScaleState {
    return this.adaptive.state
  }

  update(
    settings: Partial<DisplaySettings>,
    setMaxFps: (fps: number) => void,
  ): { resize: boolean; modeChanged: boolean } {
    let mode = settings.resolutionScaleMode ?? this.current.resolutionScaleMode
    if (settings.resolutionScale !== undefined && settings.resolutionScaleMode === undefined)
      mode = 'manual'
    let scale = settings.resolutionScale ?? this.current.resolutionScale
    if (mode === 'auto')
      scale = Math.min(autoResolutionScaleRange.max, Math.max(autoResolutionScaleRange.min, scale))
    const next = resolveDisplaySettings({
      maxFps: settings.maxFps ?? this.current.maxFps,
      resolutionScale: scale,
      resolutionScaleMode: mode,
    })
    const resize = next.resolutionScale !== this.current.resolutionScale
    const modeChanged = next.resolutionScaleMode !== this.current.resolutionScaleMode
    if (next.maxFps !== this.current.maxFps) {
      setMaxFps(next.maxFps)
      this.adaptive.setTargetFrameMs(next.maxFps ? 1000 / next.maxFps : null)
    }
    this.current = next
    this.adaptive.applyDisplay(next)
    return { resize, modeChanged }
  }

  applyProbe(scale: number): void {
    if (this.current.resolutionScaleMode === 'auto') {
      this.current = { ...this.current, resolutionScale: scale }
      this.adaptive.setAuto(scale)
    }
  }

  observeFrame(frameMs: number, time: number): boolean {
    const changed = this.adaptive.observeFrame(frameMs, time)
    if (changed === null) return false
    this.current = { ...this.current, resolutionScale: changed }
    return true
  }
}
