/**
 * Reusable Planeta / atmosphere settings form.
 *
 * Uses the shared ship-monitor stylesheet classes (`portal-tablet-layer`,
 * `portal-console`, …) so the HUD window and a future interior monitor share
 * one look. Mount `root` under the HUD overlay now; a ship monitor can append
 * the same root later — do not mount on a monitor in this change.
 */
import { t } from '../i18n/index.js'
import { installVehicleMonitorStyles, vehicleMonitorStyleText } from './vehicle-monitor-styles.js'

/** Snapshot of visual knobs for host/demo config paste. */
export type PlanetVisualConfig = {
  rainLinked?: boolean
  rainAmount?: number
  cloudStyle: 'low' | 'artistic'
  cloudAmount: number
  cloudPressure: number
  lensFlareAmount: number
  moon?: boolean
  stars?: boolean
  moonHorizonScale?: number
  sky: boolean
  sun: boolean
  clouds: boolean
  sea: boolean
}

/** Runtime surface the panel needs (GameRuntime or a test fake). */
export interface PlanetSettingsRuntime {
  readonly realWeather?: boolean
  readonly realWeatherStatus?: string
  setRealWeather?(enabled: boolean): void
  readonly rainLinked?: boolean
  setRainLinked?(linked: boolean): void
  readonly rainSupported?: boolean
  readonly rainAmount?: number
  setRainAmount?(amount: number): void
  readonly planetLayers: {
    sky: boolean
    sun: boolean
    moon?: boolean
    stars?: boolean
    clouds: boolean
    sea: boolean
  }
  setPlanetLayers(
    layers: Partial<{
      sky: boolean
      sun: boolean
      moon: boolean
      stars: boolean
      clouds: boolean
      sea: boolean
    }>,
  ): void
  readonly moonHorizonScale?: number
  setMoonHorizonScale?(scale: number): void
  readonly cloudStyle: 'low' | 'artistic'
  setCloudStyle(style: 'low' | 'artistic'): void
  readonly cloudAmount: number
  readonly cloudPressure: number
  setCloudWeather(amount: number, storm?: number): void
  readonly lensFlareAmount: number
  setLensFlareAmount(amount: number): void
}

export const CLOUD_PRESSURE_PRESETS = [
  { id: 'calm', label: t('settings.cloud-pressure.calm'), value: 0 },
  { id: 'fair', label: t('settings.cloud-pressure.fair'), value: 0.12 },
  { id: 'stormy', label: t('settings.cloud-pressure.stormy'), value: 0.55 },
] as const

export function formatPlanetVisualConfig(config: PlanetVisualConfig): string {
  const lines = [
    `rain=${round3(config.rainAmount ?? 0)}`,
    `rainLinked=${config.rainLinked ? 1 : 0}`,
    `cloudStyle=${config.cloudStyle}`,
    `cloudAmount=${round3(config.cloudAmount)}`,
    `cloudPressure=${round3(config.cloudPressure)}`,
    `lensFlare=${round3(config.lensFlareAmount)}`,
    `sky=${config.sky ? 1 : 0}`,
    `sun=${config.sun ? 1 : 0}`,
    `moon=${(config.moon ?? config.sky) ? 1 : 0}`,
    `stars=${(config.stars ?? config.sky) ? 1 : 0}`,
    `moonHorizonScale=${config.moonHorizonScale ?? 5}`,
    `clouds=${config.clouds ? 1 : 0}`,
    `sea=${config.sea ? 1 : 0}`,
  ]
  return lines.join('\n')
}

export function planetVisualConfigFromRuntime(runtime: PlanetSettingsRuntime): PlanetVisualConfig {
  return {
    rainAmount: runtime.rainAmount ?? 0,
    rainLinked: runtime.rainLinked ?? false,
    cloudStyle: runtime.cloudStyle,
    cloudAmount: runtime.cloudAmount,
    cloudPressure: runtime.cloudPressure,
    lensFlareAmount: runtime.lensFlareAmount,
    sky: runtime.planetLayers.sky,
    sun: runtime.planetLayers.sun,
    moon: runtime.planetLayers.moon ?? runtime.planetLayers.sky,
    stars: runtime.planetLayers.stars ?? runtime.planetLayers.sky,
    moonHorizonScale: runtime.moonHorizonScale ?? 5,
    clouds: runtime.planetLayers.clouds,
    sea: runtime.planetLayers.sea,
  }
}

function round3(n: number): string {
  return (Math.round(n * 1000) / 1000).toString()
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

export type PlanetSettingsPanel = {
  /** Form root — HUD hosts it today; a monitor may append it later. */
  root: HTMLElement
  /**
   * The config text (`#ps-config-out`) and «Copiar config» button. Starts at the end of `root`;
   * a host may move it elsewhere (the game HUD shows it under «Configuración»). `refresh()` keeps
   * it current wherever it is mounted.
   */
  config: HTMLElement
  bind(runtime: PlanetSettingsRuntime): void
  refresh(): void
  snapshot(): PlanetVisualConfig | null
  destroy(): void
}

/**
 * Build the compact Planeta form. Call `installVehicleMonitorStyles` on the
 * document (or CSS3D layer) before showing so classes resolve.
 */
export function createPlanetSettingsPanel(doc: Document = document): PlanetSettingsPanel {
  installVehicleMonitorStyles(doc.head)

  const root = doc.createElement('div')
  root.className = 'planet-settings-form'
  root.dataset.nablaSettings = 'planet'

  const row = (
    labelText: string,
    control: HTMLElement,
    valueEl?: HTMLElement,
  ): HTMLLabelElement => {
    const label = doc.createElement('label')
    label.append(labelText + ' ')
    if (valueEl) label.append(valueEl, ' ')
    label.append(control)
    return label
  }

  const sky = doc.createElement('input')
  sky.type = 'checkbox'
  sky.id = 'ps-sky'
  const sun = doc.createElement('input')
  sun.type = 'checkbox'
  sun.id = 'ps-sun'
  const moon = doc.createElement('input')
  moon.type = 'checkbox'
  moon.id = 'ps-moon'
  const stars = doc.createElement('input')
  stars.type = 'checkbox'
  stars.id = 'ps-stars'
  const moonScale = doc.createElement('input')
  moonScale.type = 'range'
  moonScale.id = 'ps-moon-horizon-scale'
  moonScale.min = '1'
  moonScale.max = '16'
  moonScale.step = '0.5'
  moonScale.title = t('settings.moon-horizon-help')
  const moonScaleVal = doc.createElement('output')
  moonScaleVal.id = 'ps-moon-horizon-scale-val'
  moonScaleVal.htmlFor = moonScale.id
  const clouds = doc.createElement('input')
  clouds.type = 'checkbox'
  clouds.id = 'ps-clouds'
  const sea = doc.createElement('input')
  sea.type = 'checkbox'
  sea.id = 'ps-sea'

  const artistic = doc.createElement('input')
  artistic.type = 'checkbox'
  artistic.id = 'ps-artistic'

  const amount = doc.createElement('input')
  const realWeather = doc.createElement('input')
  realWeather.type = 'checkbox'
  realWeather.id = 'ps-real-weather'
  const weatherStatus = doc.createElement('small')
  weatherStatus.id = 'ps-real-weather-status'
  weatherStatus.setAttribute('role', 'status')
  weatherStatus.style.cssText = 'display:block;max-width:340px;white-space:normal;line-height:1.5'
  const weatherCredit = doc.createElement('a')
  weatherCredit.href = 'https://www.weatherapi.com/'
  weatherCredit.target = '_blank'
  weatherCredit.rel = 'noopener noreferrer'
  weatherCredit.textContent = 'WeatherAPI.com'
  const weatherInfo = doc.createElement('div')
  weatherInfo.id = 'ps-weather-info'
  weatherInfo.append(weatherStatus, weatherCredit)
  const rainLinked = doc.createElement('input')
  rainLinked.type = 'checkbox'
  rainLinked.id = 'ps-rain-linked'
  rainLinked.title = t('settings.rain-linked-help')
  const rain = doc.createElement('input')
  rain.type = 'range'
  rain.id = 'ps-rain'
  rain.setAttribute('aria-label', t('settings.rain'))
  rain.min = '0'
  rain.max = '100'
  rain.step = '1'
  const rainVal = doc.createElement('output')
  rainVal.id = 'ps-rain-val'
  rainVal.htmlFor = rain.id
  amount.type = 'range'
  amount.id = 'ps-cloud-amount'
  amount.min = '0'
  amount.max = '100'
  amount.step = '1'
  const amountVal = doc.createElement('output')
  amountVal.id = 'ps-cloud-amount-val'
  amountVal.htmlFor = amount.id

  const pressureMode = doc.createElement('select')
  pressureMode.id = 'ps-cloud-pressure-mode'
  for (const preset of CLOUD_PRESSURE_PRESETS) {
    pressureMode.add(new Option(preset.label, preset.id))
  }
  pressureMode.add(new Option(t('settings.cloud-pressure.custom'), 'custom'))

  const pressure = doc.createElement('input')
  pressure.type = 'range'
  pressure.id = 'ps-cloud-pressure'
  pressure.min = '0'
  pressure.max = '100'
  pressure.step = '1'
  const pressureVal = doc.createElement('output')
  pressureVal.id = 'ps-cloud-pressure-val'
  pressureVal.htmlFor = pressure.id

  const flare = doc.createElement('input')
  flare.type = 'range'
  flare.id = 'ps-lens-flare'
  flare.min = '0'
  flare.max = '100'
  flare.step = '1'
  const flareVal = doc.createElement('output')
  flareVal.id = 'ps-lens-flare-val'
  flareVal.htmlFor = flare.id

  const configOut = doc.createElement('pre')
  configOut.id = 'ps-config-out'
  configOut.className = 'planet-settings-config'
  configOut.setAttribute('aria-live', 'polite')

  const copyBtn = doc.createElement('button')
  copyBtn.type = 'button'
  copyBtn.id = 'ps-copy-config'
  copyBtn.textContent = t('settings.copy-config')

  // On/off switches share one compact block (a grid in the HUD); sliders follow, one row each.
  const toggles = doc.createElement('div')
  toggles.className = 'planet-settings-toggles'
  toggles.append(
    row(t('settings.sky'), sky),
    row(t('settings.sun-and-flare'), sun),
    row(t('settings.moon'), moon),
    row(t('settings.stars-and-planets'), stars),
    row(t('settings.sea'), sea),
    row(t('settings.clouds'), clouds),
    row(t('settings.artistic-clouds'), artistic),
  )
  const config = doc.createElement('div')
  config.className = 'planet-settings-config-block'
  config.append(configOut, copyBtn)

  root.append(
    toggles,
    row(t('settings.real-weather'), realWeather),
    weatherInfo,
    row(t('settings.rain'), rain, rainVal),
    row(t('settings.rain-linked'), rainLinked),
    row(t('settings.cloud-amount'), amount, amountVal),
    row(t('settings.cloud-pressure-mode'), pressureMode),
    row(t('settings.cloud-pressure'), pressure, pressureVal),
    row(t('settings.sun-flare'), flare, flareVal),
    row(t('settings.moon-horizon-scale'), moonScale, moonScaleVal),
    config,
  )

  let runtime: PlanetSettingsRuntime | null = null

  const pressureModeFor = (value: number): string => {
    const hit = CLOUD_PRESSURE_PRESETS.find((p) => Math.abs(p.value - value) < 0.005)
    return hit ? hit.id : 'custom'
  }

  const refresh = () => {
    if (!runtime) return
    const layers = runtime.planetLayers
    const live = runtime.realWeather ?? false
    realWeather.checked = live
    realWeather.disabled = !runtime.setRealWeather || runtime.rainSupported === false
    weatherStatus.textContent = runtime.realWeatherStatus ?? t('settings.real-weather-help')
    rainLinked.checked = runtime.rainLinked ?? false
    rainLinked.disabled = live || !runtime.setRainLinked || runtime.rainSupported === false
    rain.value = String(Math.round((runtime.rainAmount ?? 0) * 100))
    rainVal.textContent = Number(rain.value) === 0 ? 'Off' : `${rain.value}%`
    rain.setAttribute('aria-valuetext', rainVal.textContent)
    rain.disabled = live || !runtime.setRainAmount || runtime.rainSupported === false
    sky.checked = layers.sky
    sun.checked = layers.sun
    moon.checked = layers.moon ?? layers.sky
    stars.checked = layers.stars ?? layers.sky
    moon.disabled = layers.moon === undefined
    stars.disabled = layers.stars === undefined
    moonScale.value = String(runtime.moonHorizonScale ?? 5)
    moonScaleVal.textContent = `${runtime.moonHorizonScale ?? 5}×`
    moonScale.disabled = !moon.checked || !runtime.setMoonHorizonScale
    sea.checked = layers.sea
    clouds.disabled = live
    clouds.checked = live || layers.clouds
    artistic.checked = runtime.cloudStyle === 'artistic'
    artistic.disabled = live || !layers.clouds || !!runtime.rainLinked
    amount.disabled = live || !layers.clouds
    pressure.disabled = live || !layers.clouds
    pressureMode.disabled = live || !layers.clouds
    amount.value = String(Math.round(runtime.cloudAmount * 100))
    amountVal.textContent = pct(runtime.cloudAmount)
    pressure.value = String(Math.round(runtime.cloudPressure * 100))
    pressureVal.textContent = pct(runtime.cloudPressure)
    pressureMode.value = pressureModeFor(runtime.cloudPressure)
    flare.value = String(Math.round(runtime.lensFlareAmount * 100))
    flareVal.textContent = pct(runtime.lensFlareAmount)
    flare.disabled = !layers.sun
    configOut.textContent = formatPlanetVisualConfig(planetVisualConfigFromRuntime(runtime))
  }

  const applyWeather = () => {
    if (!runtime) return
    runtime.setCloudWeather(Number(amount.value) / 100, Number(pressure.value) / 100)
    refresh()
  }

  const bind = (next: PlanetSettingsRuntime) => {
    runtime = next
    refresh()
  }

  sky.addEventListener('change', () => {
    runtime?.setPlanetLayers({ sky: sky.checked })
    refresh()
  })
  sun.addEventListener('change', () => {
    runtime?.setPlanetLayers({ sun: sun.checked })
    refresh()
  })
  moon.addEventListener('change', () => {
    runtime?.setPlanetLayers({ moon: moon.checked })
    refresh()
  })
  stars.addEventListener('change', () => {
    runtime?.setPlanetLayers({ stars: stars.checked })
    refresh()
  })
  moonScale.addEventListener('input', () => {
    runtime?.setMoonHorizonScale?.(Number(moonScale.value))
    refresh()
  })
  sea.addEventListener('change', () => {
    runtime?.setPlanetLayers({ sea: sea.checked })
    refresh()
  })
  clouds.addEventListener('change', () => {
    runtime?.setPlanetLayers({ clouds: clouds.checked })
    refresh()
  })
  artistic.addEventListener('change', () => {
    runtime?.setCloudStyle(artistic.checked ? 'artistic' : 'low')
    refresh()
  })
  realWeather.addEventListener('change', () => {
    runtime?.setRealWeather?.(realWeather.checked)
    refresh()
  })
  amount.addEventListener('input', applyWeather)
  rainLinked.addEventListener('change', () => {
    runtime?.setRainLinked?.(rainLinked.checked)
    refresh()
  })
  rain.addEventListener('input', () => {
    runtime?.setRainAmount?.(Number(rain.value) / 100)
    refresh()
  })
  pressure.addEventListener('input', applyWeather)
  pressureMode.addEventListener('change', () => {
    const preset = CLOUD_PRESSURE_PRESETS.find((p) => p.id === pressureMode.value)
    if (!preset || !runtime) return
    pressure.value = String(Math.round(preset.value * 100))
    applyWeather()
  })
  flare.addEventListener('input', () => {
    runtime?.setLensFlareAmount(Number(flare.value) / 100)
    refresh()
  })
  copyBtn.addEventListener('click', async () => {
    const text = configOut.textContent ?? ''
    try {
      await navigator.clipboard.writeText(text)
      copyBtn.textContent = t('settings.copied')
      setTimeout(() => {
        copyBtn.textContent = t('settings.copy-config')
      }, 1200)
    } catch {
      copyBtn.textContent = t('settings.copy-error')
    }
  })

  const weatherRefresh = setInterval(() => {
    if (runtime?.realWeather) refresh()
  }, 1000)
  return {
    root,
    config,
    bind,
    refresh,
    snapshot: () => (runtime ? planetVisualConfigFromRuntime(runtime) : null),
    destroy: () => {
      clearInterval(weatherRefresh)
      runtime = null
      root.remove()
      config.remove()
    },
  }
}

/** Re-export so hosts that only import the panel still share one stylesheet source. */
export { installVehicleMonitorStyles, vehicleMonitorStyleText }
