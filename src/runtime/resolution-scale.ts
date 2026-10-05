/**
 * Auto resolution-scale controller and a short boot probe for initial tier selection.
 * Manual mode never mutates scale; auto stays within autoResolutionScaleRange.
 */
import {
  autoResolutionScaleRange,
  resolveDisplaySettings,
  type DisplaySettings,
  type ResolutionScaleMode,
} from '../config/display.js'
import { performancePresets } from '../config/performance.js'

export interface ResolutionScaleState {
  mode: ResolutionScaleMode
  scale: number
}

export interface ResolutionProbeResult {
  /** Suggested starting scale for auto mode (within 0.5..1). */
  resolutionScale: number
  /** Coarse quality band inferred from probe timing (host may apply or ignore). */
  qualityTier: 'minimal' | 'mobile' | 'low' | 'balanced' | 'high'
  /** Median sampled frame interval in milliseconds. */
  medianFrameMs: number
  /** How long the probe ran, milliseconds. */
  durationMs: number
  /** Number of timing samples collected. */
  samples: number
}

export interface AdaptiveResolutionOptions {
  mode?: ResolutionScaleMode
  /** Initial scale; auto defaults to 0.5. */
  scale?: number
  /** Raise scale when EMA frame time stays below this (default ~18.2 ms ≈ 55 FPS). */
  healthyFrameMs?: number
  /** Lower scale when EMA frame time stays above this (default 25 ms = 40 FPS). */
  struggleFrameMs?: number
  /** Minimum milliseconds between scale steps (default 750). */
  cooldownMs?: number
  /** EMA smoothing factor 0..1 (default 0.2). */
  smoothing?: number
  /** Step size when adjusting (default 0.05). */
  step?: number
}

const DEFAULT_HEALTHY_MS = 1000 / 55
const DEFAULT_STRUGGLE_MS = 1000 / 40

/** Live auto/manual resolution scale. Call `observeFrame` once per submitted frame. */
export class AdaptiveResolutionScale {
  private mode: ResolutionScaleMode
  private scale: number
  private readonly healthyFrameMs: number
  private readonly struggleFrameMs: number
  private readonly cooldownMs: number
  private readonly smoothing: number
  private readonly step: number
  private emaFrameMs: number
  private cooldownUntil = 0
  private samples = 0
  private targetFrameMs: number | null = null

  constructor(options: AdaptiveResolutionOptions = {}) {
    // The controller defaults to auto even when a start scale is given.
    const resolved = resolveDisplaySettings({
      resolutionScaleMode: options.mode ?? 'auto',
      resolutionScale: options.scale,
    })
    this.mode = resolved.resolutionScaleMode
    this.scale = resolved.resolutionScale
    this.healthyFrameMs = options.healthyFrameMs ?? DEFAULT_HEALTHY_MS
    this.struggleFrameMs = options.struggleFrameMs ?? DEFAULT_STRUGGLE_MS
    this.cooldownMs = options.cooldownMs ?? 750
    this.smoothing = options.smoothing ?? 0.2
    this.step = options.step ?? 0.05
    this.emaFrameMs = this.healthyFrameMs
  }

  /**
   * Align thresholds with an FPS cap: healthy ≤ 1.1× target, struggling ≥ 1.5× target.
   * Pass null/0 to use the uncapped defaults (55 FPS healthy, 40 FPS struggle).
   */
  setTargetFrameMs(targetFrameMs: number | null): void {
    this.targetFrameMs =
      targetFrameMs && Number.isFinite(targetFrameMs) && targetFrameMs > 0 ? targetFrameMs : null
  }

  get state(): ResolutionScaleState {
    return { mode: this.mode, scale: this.scale }
  }

  /** Freeze at an explicit scale (slider / URL / host API). */
  setManual(scale: number): void {
    const next = resolveDisplaySettings({ resolutionScaleMode: 'manual', resolutionScale: scale })
    this.mode = 'manual'
    this.scale = next.resolutionScale
  }

  /** Resume adaptation from the current scale (clamped into the auto range). */
  setAuto(scale = this.scale): void {
    const clamped = Math.min(
      autoResolutionScaleRange.max,
      Math.max(autoResolutionScaleRange.min, scale),
    )
    const next = resolveDisplaySettings({
      resolutionScaleMode: 'auto',
      resolutionScale: clamped,
    })
    this.mode = 'auto'
    this.scale = next.resolutionScale
    this.cooldownUntil = 0
  }

  /** Apply a full display snapshot (e.g. after `setDisplay`). */
  applyDisplay(settings: Pick<DisplaySettings, 'resolutionScale' | 'resolutionScaleMode'>): void {
    this.mode = settings.resolutionScaleMode
    this.scale = settings.resolutionScale
    if (this.mode === 'auto') this.cooldownUntil = 0
  }

  /**
   * Observe one frame interval. Returns the new scale when auto mode changes it; otherwise null.
   * `frameMs` of 0 (first frame) is ignored. Manual mode always returns null.
   */
  observeFrame(frameMs: number, now = performance.now()): number | null {
    if (this.mode !== 'auto') return null
    // Ignore first frames and tab/stall gaps; they are not steady GPU cost.
    if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 250) return null
    this.samples += 1
    this.emaFrameMs =
      this.samples === 1 ? frameMs : this.emaFrameMs + (frameMs - this.emaFrameMs) * this.smoothing
    if (now < this.cooldownUntil) return null
    const healthy = this.targetFrameMs ? this.targetFrameMs * 1.1 : this.healthyFrameMs
    const struggle = this.targetFrameMs ? this.targetFrameMs * 1.5 : this.struggleFrameMs
    let next = this.scale
    if (this.emaFrameMs >= struggle && this.scale > autoResolutionScaleRange.min) {
      next = Math.max(autoResolutionScaleRange.min, roundScale(this.scale - this.step))
    } else if (this.emaFrameMs <= healthy && this.scale < autoResolutionScaleRange.max) {
      next = Math.min(autoResolutionScaleRange.max, roundScale(this.scale + this.step))
    }
    if (next === this.scale) return null
    this.scale = next
    this.cooldownUntil = now + this.cooldownMs
    return next
  }
}

function roundScale(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Run a short (~3 s) timing probe and map median frame cost to an initial auto scale
 * and a coarse quality-tier hint. `sample` should perform one representative unit of work
 * (e.g. render one attract frame) and return its duration in milliseconds.
 */
export async function probeResolutionTier(options: {
  sample: () => number | Promise<number>
  durationMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}): Promise<ResolutionProbeResult> {
  const durationMs = options.durationMs ?? 3000
  if (!Number.isFinite(durationMs) || durationMs < 200)
    throw new RangeError('probe durationMs must be at least 200')
  const now = options.now ?? (() => performance.now())
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const started = now()
  const samples: number[] = []
  while (now() - started < durationMs) {
    const cost = await options.sample()
    if (Number.isFinite(cost) && cost >= 0) samples.push(cost)
    await sleep(0)
  }
  if (!samples.length) {
    return {
      resolutionScale: 0.5,
      qualityTier: 'mobile',
      medianFrameMs: Number.POSITIVE_INFINITY,
      durationMs,
      samples: 0,
    }
  }
  const sorted = [...samples].sort((a, b) => a - b)
  const medianFrameMs = sorted[Math.floor(sorted.length / 2)]!
  return {
    resolutionScale: scaleForMedian(medianFrameMs),
    qualityTier: tierForMedian(medianFrameMs),
    medianFrameMs,
    durationMs,
    samples: samples.length,
  }
}

function scaleForMedian(medianFrameMs: number): number {
  if (medianFrameMs <= 1000 / 60) return 1
  if (medianFrameMs <= 1000 / 50) return 0.85
  if (medianFrameMs <= 1000 / 40) return 0.7
  if (medianFrameMs <= 1000 / 30) return 0.6
  return 0.5
}

function tierForMedian(medianFrameMs: number): ResolutionProbeResult['qualityTier'] {
  if (medianFrameMs <= 1000 / 55) return 'high'
  if (medianFrameMs <= 1000 / 45) return 'balanced'
  if (medianFrameMs <= 1000 / 35) return 'low'
  if (medianFrameMs <= 1000 / 28) return 'mobile'
  return 'minimal'
}

/** Named preset labels that hosts may surface after a probe (Spanish UI elsewhere). */
export function qualityTierLabels(): Record<ResolutionProbeResult['qualityTier'], string> {
  return {
    minimal: performancePresets.minimal.label,
    mobile: performancePresets.mobile.label,
    low: performancePresets.low.label,
    balanced: performancePresets.balanced.label,
    high: performancePresets.high.label,
  }
}
