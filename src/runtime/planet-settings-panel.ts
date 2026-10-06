/**
 * Reusable Planeta / atmosphere settings form.
 *
 * Uses the shared ship-monitor stylesheet classes (`portal-tablet-layer`,
 * `portal-console`, …) so the HUD window and a future interior monitor share
 * one look. Mount `root` under the HUD overlay now; a ship monitor can append
 * the same root later — do not mount on a monitor in this change.
 */
import { installVehicleMonitorStyles, vehicleMonitorStyleText } from './vehicle-monitor-styles.js'

/** Snapshot of visual knobs for host/demo config paste. */
export type PlanetVisualConfig = {
  cloudStyle: 'low' | 'artistic'
  cloudAmount: number
  cloudPressure: number
  lensFlareAmount: number
  sky: boolean
  sun: boolean
  clouds: boolean
  sea: boolean
}

/** Runtime surface the panel needs (GameRuntime or a test fake). */
export interface PlanetSettingsRuntime {
  readonly planetLayers: { sky: boolean; sun: boolean; clouds: boolean; sea: boolean }
  setPlanetLayers(
    layers: Partial<{ sky: boolean; sun: boolean; clouds: boolean; sea: boolean }>,
  ): void
  readonly cloudStyle: 'low' | 'artistic'
  setCloudStyle(style: 'low' | 'artistic'): void
  readonly cloudAmount: number
  readonly cloudPressure: number
  setCloudWeather(amount: number, storm?: number): void
  readonly lensFlareAmount: number
  setLensFlareAmount(amount: number): void
}

export const CLOUD_PRESSURE_PRESETS = [
  { id: 'calm', label: 'Calma', value: 0 },
  { id: 'fair', label: 'Estable', value: 0.12 },
  { id: 'stormy', label: 'Tormenta', value: 0.55 },
] as const

export function formatPlanetVisualConfig(config: PlanetVisualConfig): string {
  const lines = [
    `cloudStyle=${config.cloudStyle}`,
    `cloudAmount=${round3(config.cloudAmount)}`,
    `cloudPressure=${round3(config.cloudPressure)}`,
    `lensFlare=${round3(config.lensFlareAmount)}`,
    `sky=${config.sky ? 1 : 0}`,
    `sun=${config.sun ? 1 : 0}`,
    `clouds=${config.clouds ? 1 : 0}`,
    `sea=${config.sea ? 1 : 0}`,
  ]
  return lines.join('\n')
}

export function planetVisualConfigFromRuntime(runtime: PlanetSettingsRuntime): PlanetVisualConfig {
  return {
    cloudStyle: runtime.cloudStyle,
    cloudAmount: runtime.cloudAmount,
    cloudPressure: runtime.cloudPressure,
    lensFlareAmount: runtime.lensFlareAmount,
    sky: runtime.planetLayers.sky,
    sun: runtime.planetLayers.sun,
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
  pressureMode.add(new Option('Personalizado', 'custom'))

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
  copyBtn.textContent = 'Copiar config'

  // On/off switches share one compact block (a grid in the HUD); sliders follow, one row each.
  const toggles = doc.createElement('div')
  toggles.className = 'planet-settings-toggles'
  toggles.append(
    row('Cielo', sky),
    row('Sol y destello', sun),
    row('Mar', sea),
    row('Nubes', clouds),
    row('Nubes artísticas', artistic),
  )
  const config = doc.createElement('div')
  config.className = 'planet-settings-config-block'
  config.append(configOut, copyBtn)

  root.append(
    toggles,
    row('Cantidad de nubes', amount, amountVal),
    row('Modo de presión de nubes', pressureMode),
    row('Presión de nubes', pressure, pressureVal),
    row('Destello del sol', flare, flareVal),
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
    sky.checked = layers.sky
    sun.checked = layers.sun
    sea.checked = layers.sea
    clouds.checked = layers.clouds
    artistic.checked = runtime.cloudStyle === 'artistic'
    artistic.disabled = !layers.clouds
    amount.disabled = !layers.clouds
    pressure.disabled = !layers.clouds
    pressureMode.disabled = !layers.clouds
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
  amount.addEventListener('input', applyWeather)
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
      copyBtn.textContent = 'Copiado'
      setTimeout(() => {
        copyBtn.textContent = 'Copiar config'
      }, 1200)
    } catch {
      copyBtn.textContent = 'Error al copiar'
    }
  })

  return {
    root,
    config,
    bind,
    refresh,
    snapshot: () => (runtime ? planetVisualConfigFromRuntime(runtime) : null),
    destroy: () => {
      runtime = null
      root.remove()
      config.remove()
    },
  }
}

/** Re-export so hosts that only import the panel still share one stylesheet source. */
export { installVehicleMonitorStyles, vehicleMonitorStyleText }
