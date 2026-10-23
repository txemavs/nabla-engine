import {
  normalizeLightTuning,
  readLightTuning,
  writeLightTuning,
  type LightTuning,
} from './light-tuning.js'

type StoragePort = Pick<Storage, 'getItem' | 'setItem'> | null | undefined
type IntensityLight = { intensity: number }
type ShadowLight = { shadow: { intensity: number } }
type LightingView = { reflectionScale: number; applyPaintBrightness(value: number): void }

/** Per-runtime lighting preferences; callers retain ownership of GPU resources and frame timing. */
export class RuntimeLightingPreferences {
  private current: LightTuning

  constructor(private readonly storage: StoragePort) {
    this.current = readLightTuning(storage)
  }

  get tuning(): LightTuning {
    return { ...this.current }
  }

  get shadows(): boolean {
    return this.current.shadows
  }

  update(patch: Partial<LightTuning>): LightTuning {
    this.current = normalizeLightTuning(patch, this.current)
    writeLightTuning(this.storage, this.current)
    return this.tuning
  }

  /** Apply once, immediately after the environment refreshes the base intensities. */
  applyEnvironment(sun: IntensityLight, ambient: IntensityLight): void {
    sun.intensity *= this.current.sun
    ambient.intensity *= this.current.ambient
  }

  applyPresentation(
    renderer: { toneMappingExposure: number },
    lights: Iterable<ShadowLight>,
    view: LightingView,
  ): void {
    renderer.toneMappingExposure = this.current.exposure
    const shadow = this.current.shadows ? this.current.shadowIntensity : 0
    for (const light of lights) light.shadow.intensity = shadow
    view.reflectionScale = this.current.reflections
    view.applyPaintBrightness(this.current.paint)
  }
}
