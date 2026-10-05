/**
 * Menu sections "Planeta" (Hora, Cielo, Sol, Mar, Nubes) and "Vehículos". They only call the engine
 * runtime: the sky clock (sun, sky and lighting), planetary layer flags, the sea level (ocean sheet
 * and physics) and `spawnVehicle` (a catalog vehicle on the ground ahead of the player). The URL
 * follows the choices (`&time=`, `&timeSpeed=`, `&sea=`) so a link repeats them.
 */
import {
  formatClockTime,
  liveSkyClock,
  localMinutes,
  parseClockTime,
  skyClockAtMinutes,
  skyClockAtRate,
  skyRate,
  skyTime,
  SKY_RATE,
  type SkyClock,
} from '@nabla/engine/planet/sky'
import { presetVehicle, vehiclePresets } from '@nabla/engine/vehicles'
import type { Entity } from '@nabla/engine/scene'
import { menuSection, menuSubtitle } from './menu.js'

/** Sea level limits in metres, as in Studio's sea-surface controls. */
export const SEA_RANGE = { min: -5, max: 50, step: 0.1 } as const

/** What the controls need from the engine's `GameRuntime`; tests pass a fake. */
export interface SceneRuntime {
  readonly skyClock: SkyClock
  setSkyClock(clock: SkyClock): void
  readonly waterSettings: { mode: 'manual' | 'tide'; level: number; amplitude: number } | undefined
  readonly sea: { level: number; state: string }
  setWater(water: { mode: 'manual' | 'tide'; level: number; amplitude: number } | undefined): void
  readonly planetLayers: { sky: boolean; sun: boolean; clouds: boolean; sea: boolean }
  setPlanetLayers(
    layers: Partial<{ sky: boolean; sun: boolean; clouds: boolean; sea: boolean }>,
  ): void
  readonly cloudStyle: 'low' | 'artistic'
  setCloudStyle(style: 'low' | 'artistic'): void
  readonly cloudAmount: number
  readonly cloudPressure: number
  /** Amount 0–1; omit pressure to leave storm/deck pressure unchanged. */
  setCloudWeather(amount: number, pressure?: number): void
  readonly spawnedVehicles: { id: string; name: string }[]
  spawnVehicle(template: Entity): Promise<string>
  removeSpawnedVehicle(id: string): void
}

/** A vehicle that can be added: the catalog presets a player can drive (trailers are passive). */
export interface VehicleChoice {
  id: string
  label: string
}

/** The vehicles the menu offers, in catalog order. The catalog has no planes or helicopters. */
export function vehicleChoices(): VehicleChoice[] {
  return vehiclePresets()
    .filter((preset) => !preset.vehicle.passive)
    .map((preset) => ({ id: preset.id, label: preset.label }))
}

/** Metres as shown to the player: one decimal and a decimal comma. */
export function formatMetres(metres: number): string {
  return metres.toFixed(1).replace('.', ',').replace(/^-/, '−') + ' m'
}

/** Spanish text for the sea status line. */
export function seaStatus(sea: { level: number; state: string }, manual: boolean): string {
  return manual
    ? `Nivel fijo: ${formatMetres(sea.level)}`
    : `Marea automática: ${formatMetres(sea.level)} (${sea.state})`
}

/** The URL with `time`, `timeSpeed` and `sea` set to the current choice (or removed), other parameters kept. */
export function withSceneParams(
  search: string,
  state: { time?: string | null; timeSpeed?: number | null; sea?: number | null },
): string {
  const params = new URLSearchParams(search)
  if (state.time !== undefined) {
    if (state.time === null) params.delete('time')
    else params.set('time', state.time)
  }
  if (state.timeSpeed !== undefined) {
    if (state.timeSpeed == null || state.timeSpeed === 1) params.delete('timeSpeed')
    else params.set('timeSpeed', String(state.timeSpeed))
  }
  if (state.sea !== undefined) {
    if (state.sea === null) params.delete('sea')
    else params.set('sea', String(Number(state.sea.toFixed(1))))
  }
  // A colon is legal in a query and reads better in a shared link: time=21:30.
  const text = params.toString().replace(/%3A/g, ':')
  return text ? '?' + text : ''
}

function rememberInUrl(state: {
  time?: string | null
  timeSpeed?: number | null
  sea?: number | null
}): void {
  const url = new URL(location.href)
  url.search = withSceneParams(url.search, state)
  history.replaceState(null, '', url)
}

function button(id: string, text: string): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.id = id
  el.textContent = text
  return el
}

/** Keys typed in menu fields must not drive the car. */
function isolateKeys(...inputs: HTMLElement[]): void {
  for (const input of inputs) input.addEventListener('keydown', (event) => event.stopPropagation())
}

function field(
  id: string,
  type: string,
  attrs: Record<string, string> = {},
  label?: string,
): HTMLInputElement {
  const input = document.createElement('input')
  input.type = type
  input.id = id
  for (const [key, value] of Object.entries(attrs)) input.setAttribute(key, value)
  if (label) input.setAttribute('aria-label', label)
  return input
}

function check(
  id: string,
  text: string,
  checked = true,
): {
  label: HTMLLabelElement
  box: HTMLInputElement
} {
  const label = document.createElement('label')
  const box = document.createElement('input')
  box.type = 'checkbox'
  box.id = id
  box.checked = checked
  label.append(box, ' ' + text)
  return { label, box }
}

function group(title: string, id: string, ...children: HTMLElement[]): HTMLDivElement {
  const wrap = document.createElement('div')
  wrap.className = 'planet-group'
  wrap.id = id
  wrap.append(menuSubtitle(title), ...children)
  return wrap
}

/**
 * Create Planeta and Vehículos now (so they sit under Posición / Capas) and return a function that
 * connects them to the runtime once it exists. Until then the controls are disabled.
 * `rememberInUrl: false` leaves the URL alone, for pages that do not read `&time=` and `&sea=`.
 */
export function bindSceneControls(
  options: { rememberInUrl?: boolean } = {},
): (runtime: SceneRuntime) => void {
  const remember = (state: {
    time?: string | null
    timeSpeed?: number | null
    sea?: number | null
  }) => {
    if (options.rememberInUrl !== false) rememberInUrl(state)
  }
  const planet = menuSection('scene-planet', 'Planeta')

  const timeNow = document.createElement('p')
  timeNow.id = 'time-now'
  timeNow.setAttribute('role', 'status')
  const timeRange = field(
    'time-range',
    'range',
    { min: '0', max: '1439', step: '1', value: '720' },
    'Hora del día',
  )
  const timeInput = field(
    'time-input',
    'text',
    {
      value: '12:00',
      placeholder: 'HH:MM',
      maxlength: '5',
      size: '5',
      inputmode: 'numeric',
      autocomplete: 'off',
    },
    'Hora (HH:MM)',
  )
  const timeRow = document.createElement('label')
  timeRow.append('Hora del día', timeRange, timeInput)
  const timeSpeed = field(
    'time-speed',
    'range',
    {
      min: String(SKY_RATE.min),
      max: String(SKY_RATE.max),
      step: '1',
      value: '1',
    },
    'Velocidad del tiempo',
  )
  const timeSpeedLabel = document.createElement('span')
  timeSpeedLabel.id = 'time-speed-label'
  timeSpeedLabel.textContent = '×1'
  const timeSpeedRow = document.createElement('label')
  timeSpeedRow.append('Velocidad del tiempo ', timeSpeedLabel, timeSpeed)
  const timeLive = button('time-live', 'Ahora')
  timeLive.title = 'Usar la hora real: el sol sigue al reloj'

  const sky = check('planet-sky', 'Cielo')
  const sun = check('planet-sun', 'Sol y destello')
  sun.label.title = 'Disco solar, destello y luz direccional'

  const seaNow = document.createElement('p')
  seaNow.id = 'sea-now'
  seaNow.setAttribute('role', 'status')
  const seaEnabled = check('planet-sea', 'Mostrar el mar')
  const seaAttrs = {
    min: String(SEA_RANGE.min),
    max: String(SEA_RANGE.max),
    step: String(SEA_RANGE.step),
  }
  const seaRange = field('sea-range', 'range', { ...seaAttrs, value: '0' }, 'Nivel del mar (m)')
  const seaInput = field('sea-input', 'number', { ...seaAttrs, value: '0' }, 'Nivel del mar (m)')
  const seaRow = document.createElement('label')
  seaRow.append('Nivel (m)', seaRange, seaInput)
  const seaTide = button('sea-tide', 'Marea automática')
  seaTide.title = 'Volver a la marea simplificada (±1 m)'

  const clouds = check('planet-clouds', 'Nubes')
  const artistic = check('planet-clouds-artistic', 'Nubes artísticas')
  const cloudAmount = field(
    'planet-cloud-amount',
    'range',
    { min: '0', max: '100', step: '1', value: '35' },
    'Cantidad de nubes',
  )
  const cloudAmountLabel = document.createElement('span')
  cloudAmountLabel.id = 'planet-cloud-amount-label'
  cloudAmountLabel.textContent = '35%'
  const cloudAmountRow = document.createElement('label')
  cloudAmountRow.append('Cantidad de nubes ', cloudAmountLabel, cloudAmount)

  planet.append(
    group('Hora', 'scene-time', timeNow, timeRow, timeSpeedRow, timeLive),
    group('Cielo', 'scene-sky', sky.label),
    group('Sol', 'scene-sun', sun.label),
    group('Mar', 'scene-sea', seaNow, seaEnabled.label, seaRow, seaTide),
    group('Nubes', 'scene-clouds', clouds.label, artistic.label, cloudAmountRow),
  )

  const vehicles = menuSection('scene-vehicles', 'Vehículos')
  const choice = document.createElement('select')
  choice.id = 'vehicle-choice'
  choice.setAttribute('aria-label', 'Vehículo para añadir')
  for (const item of vehicleChoices()) choice.add(new Option(item.label, item.id))
  const choiceRow = document.createElement('label')
  choiceRow.append('Qué añadir', choice)
  const add = button('vehicle-add', 'Añadir vehículo')
  const vehicleMessage = document.createElement('p')
  vehicleMessage.id = 'vehicle-message'
  vehicleMessage.setAttribute('role', 'status')
  const vehicleList = document.createElement('ul')
  vehicleList.id = 'vehicle-list'
  vehicles.append(choiceRow, add, vehicleMessage, vehicleList)

  isolateKeys(timeRange, timeInput, timeSpeed, seaRange, seaInput, cloudAmount, choice)
  const controls = [
    timeRange,
    timeInput,
    timeSpeed,
    timeLive,
    sky.box,
    sun.box,
    seaEnabled.box,
    seaRange,
    seaInput,
    seaTide,
    clouds.box,
    artistic.box,
    cloudAmount,
    choice,
    add,
  ]
  for (const control of controls) (control as HTMLInputElement).disabled = true

  return (runtime) => {
    for (const control of controls) (control as HTMLInputElement).disabled = false

    const showSpeed = () => {
      const rate = skyRate(runtime.skyClock)
      timeSpeed.value = String(rate)
      timeSpeedLabel.textContent = `×${rate}`
    }
    const showTime = () => {
      const clock = runtime.skyClock
      const minutes = localMinutes(skyTime(clock))
      const rate = skyRate(clock)
      timeRange.value = String(minutes)
      timeInput.value = formatClockTime(minutes)
      timeNow.textContent =
        clock.mode === 'live' && rate === 1
          ? `Hora real: ${formatClockTime(minutes)} (sigue al reloj)`
          : clock.mode === 'live'
            ? `Hora en marcha ×${rate}: ${formatClockTime(minutes)}`
            : `Hora fija: ${formatClockTime(minutes)}`
      showSpeed()
    }
    const setMinutes = (minutes: number) => {
      const next = skyClockAtMinutes(runtime.skyClock, minutes)
      const rate = skyRate(runtime.skyClock)
      runtime.setSkyClock(rate === 1 ? next : skyClockAtRate(next, rate))
      remember({ time: formatClockTime(minutes) })
      showTime()
    }
    timeRange.addEventListener('input', () => setMinutes(Number(timeRange.value)))
    timeInput.addEventListener('change', () => {
      const minutes = parseClockTime(timeInput.value)
      if (minutes === undefined) showTime()
      else setMinutes(minutes)
    })
    timeSpeed.addEventListener('input', () => {
      const rate = Number(timeSpeed.value)
      runtime.setSkyClock(skyClockAtRate(runtime.skyClock, rate))
      remember({ timeSpeed: rate })
      showTime()
    })
    timeLive.addEventListener('click', () => {
      runtime.setSkyClock(liveSkyClock(skyRate(runtime.skyClock)))
      remember({ time: 'ahora' })
      showTime()
    })
    showTime()

    sky.box.checked = runtime.planetLayers.sky
    sun.box.checked = runtime.planetLayers.sun
    sky.box.addEventListener('change', () => runtime.setPlanetLayers({ sky: sky.box.checked }))
    sun.box.addEventListener('change', () => runtime.setPlanetLayers({ sun: sun.box.checked }))

    const showSea = (syncFields: boolean) => {
      const manual = runtime.waterSettings?.mode === 'manual'
      const current = runtime.sea
      seaNow.textContent = seaStatus(current, manual)
      seaEnabled.box.checked = runtime.planetLayers.sea
      seaRange.disabled = !runtime.planetLayers.sea
      seaInput.disabled = !runtime.planetLayers.sea
      seaTide.disabled = !runtime.planetLayers.sea
      if (syncFields) {
        seaRange.value = String(current.level)
        seaInput.value = String(Number(current.level.toFixed(1)))
      }
    }
    const setLevel = (level: number) => {
      if (!Number.isFinite(level)) return
      const clamped = Math.min(SEA_RANGE.max, Math.max(SEA_RANGE.min, level))
      runtime.setWater({ mode: 'manual', level: clamped, amplitude: 0 })
      remember({ sea: clamped })
      showSea(true)
    }
    seaEnabled.box.addEventListener('change', () => {
      runtime.setPlanetLayers({ sea: seaEnabled.box.checked })
      showSea(false)
    })
    seaRange.addEventListener('input', () => setLevel(Number(seaRange.value)))
    seaInput.addEventListener('change', () =>
      seaInput.value.trim() === '' ? showSea(true) : setLevel(Number(seaInput.value)),
    )
    seaTide.addEventListener('click', () => {
      runtime.setWater(undefined)
      remember({ sea: null })
      showSea(true)
    })
    showSea(true)

    const showClouds = () => {
      clouds.box.checked = runtime.planetLayers.clouds
      artistic.box.checked = runtime.cloudStyle === 'artistic'
      cloudAmount.value = String(Math.round(runtime.cloudAmount * 100))
      cloudAmountLabel.textContent = `${cloudAmount.value}%`
      artistic.box.disabled = !runtime.planetLayers.clouds
      cloudAmount.disabled = !runtime.planetLayers.clouds
    }
    clouds.box.addEventListener('change', () => {
      runtime.setPlanetLayers({ clouds: clouds.box.checked })
      showClouds()
    })
    artistic.box.addEventListener('change', () => {
      runtime.setCloudStyle(artistic.box.checked ? 'artistic' : 'low')
      showClouds()
    })
    cloudAmount.addEventListener('input', () => {
      runtime.setCloudWeather(Number(cloudAmount.value) / 100)
      showClouds()
    })
    showClouds()

    const timer = setInterval(() => {
      showSea(false)
      if (runtime.skyClock.mode === 'live') showTime()
    }, 1000)
    window.addEventListener('pagehide', () => clearInterval(timer), { once: true })

    const renderList = () => {
      vehicleList.replaceChildren()
      for (const spawned of runtime.spawnedVehicles) {
        const item = document.createElement('li')
        item.dataset.vehicleId = spawned.id
        const name = document.createElement('span')
        name.textContent = spawned.name
        const remove = button(`vehicle-remove-${spawned.id}`, 'Quitar vehículo')
        remove.addEventListener('click', () => {
          try {
            runtime.removeSpawnedVehicle(spawned.id)
            vehicleMessage.textContent = `${spawned.name} quitado.`
          } catch {
            vehicleMessage.textContent = 'Sal del vehículo (E) antes de quitarlo.'
          }
          renderList()
        })
        item.append(name, remove)
        vehicleList.append(item)
      }
    }
    add.addEventListener('click', async () => {
      const entry = vehicleChoices().find((item) => item.id === choice.value)
      if (!entry) return
      add.disabled = true
      vehicleMessage.textContent = 'Añadiendo…'
      try {
        await runtime.spawnVehicle(presetVehicle(entry.id, 'spawn-template'))
        vehicleMessage.textContent = `${entry.label} añadido delante de ti. Acércate y pulsa E para entrar.`
      } catch (error) {
        vehicleMessage.textContent = /ground/i.test(
          String(error instanceof Error ? error.message : error),
        )
          ? 'No hay terreno cargado delante de ti. Espera a que cargue o muévete e inténtalo de nuevo.'
          : 'No se pudo añadir el vehículo: ' +
            (error instanceof Error ? error.message : String(error))
      } finally {
        add.disabled = false
        renderList()
      }
    })
    renderList()
  }
}
