import { PLANET_DEFAULTS } from '../render/planet/world-environment.js'
import type { GeographicView } from '../render/planet/sky.js'
import { cloudStyleForPerformancePreset } from './performance.js'
import {
  readSavedPlanetVisual,
  writeSavedPlanetVisual,
  type PlanetVisualSettings,
} from './planet-visual.js'

type StoragePort = Pick<Storage, 'getItem' | 'setItem'> | null | undefined
type SkyPort = Pick<
  GeographicView,
  'setLayers' | 'setCloudStyle' | 'setCloudWeather' | 'setLensFlareAmount'
>

/** Instance-owned visual preferences; the sky renderer and physical world keep their own lifecycles. */
export class RuntimePlanetPreferences {
  readonly state: PlanetVisualSettings = {
    sky: PLANET_DEFAULTS.sky,
    sun: PLANET_DEFAULTS.sun,
    clouds: PLANET_DEFAULTS.clouds,
    sea: PLANET_DEFAULTS.sea,
    cloudStyle: 'low',
    cloudAmount: PLANET_DEFAULTS.cloudAmount,
    cloudPressure: 0.12,
    lensFlareAmount: 1,
  }

  restore(storage: StoragePort, preset: string): void {
    const saved = readSavedPlanetVisual(storage)
    if (saved) Object.assign(this.state, saved)
    else this.state.cloudStyle = cloudStyleForPerformancePreset(preset)
  }

  /** Preserve the host sea option's final startup precedence, without saving it. */
  initializeView(sky: SkyPort, sea: boolean): void {
    this.state.sea = sea
    this.sync(sky)
  }

  get layers(): Pick<PlanetVisualSettings, 'sky' | 'sun' | 'clouds' | 'sea'> {
    const { sky, sun, clouds, sea } = this.state
    return { sky, sun, clouds, sea }
  }

  setLayers(
    layers: Partial<Pick<PlanetVisualSettings, 'sky' | 'sun' | 'clouds' | 'sea'>>,
    sky: SkyPort,
    storage: StoragePort,
  ): void {
    if (layers.sky !== undefined) this.state.sky = layers.sky
    if (layers.sun !== undefined) this.state.sun = layers.sun
    if (layers.clouds !== undefined) this.state.clouds = layers.clouds
    if (layers.sea !== undefined) this.state.sea = layers.sea
    this.sync(sky)
    this.remember(storage)
  }

  setCloudStyle(style: 'low' | 'artistic', sky: SkyPort, storage: StoragePort): void {
    this.state.cloudStyle = style
    sky.setCloudStyle(style)
    this.remember(storage)
  }

  setCloudWeather(
    amount: number,
    storm: number | undefined,
    sky: SkyPort,
    storage: StoragePort,
  ): void {
    if (!Number.isFinite(amount) || amount < 0 || amount > 1)
      throw new Error('Cloud amount must be between 0 and 1')
    const pressure = storm === undefined ? this.state.cloudPressure : storm
    if (!Number.isFinite(pressure) || pressure < 0 || pressure > 1)
      throw new Error('Cloud pressure must be between 0 and 1')
    this.state.cloudAmount = amount
    this.state.cloudPressure = pressure
    sky.setCloudWeather(amount, pressure)
    this.remember(storage)
  }

  setLensFlareAmount(amount: number, sky: SkyPort, storage: StoragePort): void {
    if (!Number.isFinite(amount) || amount < 0 || amount > 1)
      throw new Error('Lens flare amount must be between 0 and 1')
    this.state.lensFlareAmount = amount
    sky.setLensFlareAmount(amount)
    this.remember(storage)
  }

  config() {
    const { cloudStyle, cloudAmount, cloudPressure, lensFlareAmount, sky, sun, clouds, sea } =
      this.state
    return {
      cloudStyle,
      cloudAmount,
      cloudPressure,
      lensFlare: lensFlareAmount,
      sky,
      sun,
      clouds,
      sea,
    }
  }

  private remember(storage: StoragePort): void {
    writeSavedPlanetVisual(storage, { ...this.state })
  }

  private sync(sky: SkyPort): void {
    sky.setLayers({
      sky: this.state.sky,
      planets: this.state.sky,
      sun: this.state.sun,
      moon: this.state.sky,
      clouds: this.state.clouds,
    })
    sky.setCloudStyle(this.state.cloudStyle)
    sky.setCloudWeather(this.state.cloudAmount, this.state.cloudPressure)
    sky.setLensFlareAmount(this.state.lensFlareAmount)
  }
}
