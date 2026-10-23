import {
  browserPerformanceDefaults,
  normalizePerformance,
  performancePresets,
  visibilityChoices,
  tileBudget,
  type PerformanceSettings,
  type VisibilitySettings,
} from './performance.js'

type StreamingWorld = { setDistance(value: number): void; setMaxTiles(value: number): void }

/** Instance quality policy; terrain residency and simulation updates remain with their owners. */
export class RuntimePerformanceSettings {
  state: PerformanceSettings
  groundDetail = 1

  constructor(options?: Partial<PerformanceSettings>) {
    const profile = options?.preset
    const preset =
      profile && Object.hasOwn(performancePresets, profile)
        ? performancePresets[profile as keyof typeof performancePresets].settings
        : {}
    this.state = normalizePerformance({ ...browserPerformanceDefaults, ...preset, ...options })
  }

  enableXRShadows(): void {
    if (this.state.shadows === 0) this.state = { ...this.state, shadows: 512 }
  }

  setStreaming(
    options: { distance?: number; cells?: number },
    world?: StreamingWorld | null,
  ): void {
    if (options.distance !== undefined) {
      if (!Number.isFinite(options.distance) || options.distance < 250 || options.distance > 20000)
        throw new Error('Load distance must be 250–20000 m')
      this.state = { ...this.state, distance: options.distance }
      world?.setDistance(options.distance)
      if (options.cells === undefined) world?.setMaxTiles(tileBudget(options.distance))
    }
    if (options.cells !== undefined) world?.setMaxTiles(options.cells)
  }

  setVisibility(options: Partial<VisibilitySettings>): Partial<VisibilitySettings> {
    const next: Partial<VisibilitySettings> = {}
    for (const key of Object.keys(visibilityChoices) as (keyof VisibilitySettings)[]) {
      const value = options[key]
      if (value === undefined) continue
      if (!(visibilityChoices[key] as readonly number[]).includes(value))
        throw new Error(`Unsupported ${key} value: ${value}`)
      next[key] = value
    }
    this.state = { ...this.state, ...next }
    return next
  }

  setGroundDetail(cells: number): number {
    this.groundDetail = Math.min(3, Math.max(1, Math.round(cells)))
    return this.groundDetail
  }
}
