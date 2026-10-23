/**
 * Menu sections "Planeta" (Hora, Cielo, Sol, Mar, Nubes) and "Vehículos". They only call the engine
 * runtime: the sky clock (sun, sky and lighting), planetary layer flags, the sea level (ocean sheet
 * and physics), `spawnVehicle` (a catalog vehicle on the ground ahead of the player) and the
 * steering-wheel adjustment («Volante», see `steering-wheel-controls.ts`). The URL follows the
 * choices (`&time=`, `&timeSpeed=`, `&sea=`) so a link repeats them.
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
import { presetEntities, vehiclePresets } from '@nabla/engine/vehicles'
import { createPlaceable, placeables, type PlaceableId } from '@nabla/engine/runtime/core'
import type { Entity } from '@nabla/engine/scene'
import { menuSection, menuSubtitle } from './menu.js'
import { steeringWheelControls, type SteeringWheelRuntime } from './steering-wheel-controls.js'
import { mirrorControls, type MirrorRuntime } from './mirror-controls.js'
import { driverPoseControls, type DriverPoseRuntime } from './driver-pose-controls.js'
import { assignVehicleColor } from './vehicle-colors.js'
import { t } from '@nabla/engine/i18n'

/** Sea level limits in metres, as in Studio's sea-surface controls. */
export const SEA_RANGE = { min: -5, max: 50, step: 0.1 } as const

/**
 * What the controls need from the engine's `GameRuntime`; tests pass a fake. The steering-wheel
 * members are optional: without them «Volante» stays disabled.
 */
export interface SceneRuntime
  extends Partial<SteeringWheelRuntime>, Partial<MirrorRuntime>, Partial<DriverPoseRuntime> {
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
  spawnVehicle(template: Entity | Entity[]): Promise<string>
  /** Load a vehicle's models ahead of `spawnVehicle` so adding it does not freeze a frame. */
  prewarmVehicle?(template: Entity | Entity[]): Promise<void>
  removeSpawnedVehicle(id: string): void
  setTrailerPlatform?(id: string, flat: boolean): string
  readonly placedObjects: { id: string; name: string }[]
  spawnEntities(entities: Entity[], distance?: number, name?: string): Promise<string>
  removePlaced(id: string): void
  /** Every vehicle in the scene in WGS84 (`GameRuntime.vehiclePlacements`); enables «Exportar». */
  vehiclePlacements?(): VehiclePlacementLike[]
}

/** What «Exportar posición de vehículos» reads per vehicle (engine `VehiclePlacement`). */
export interface VehiclePlacementLike {
  id: string
  name: string
  visual: string | null
  color: string | null
  lat: number
  lon: number
  heading: number
  towedBy: string | null
  player: boolean
}

/** One exported vehicle: the host-vehicles / START entry shape, plus its scene id. */
export interface ExportedVehicle {
  id: string
  vehicle: string
  lat: number
  lon: number
  heading: number
  color?: string
  tow?: true
}

/** Catalog preset of a live vehicle: same body model and name, else same model, else same name. */
export function vehiclePresetId(placement: Pick<VehiclePlacementLike, 'name' | 'visual'>): string {
  const presets = vehiclePresets()
  const match =
    presets.find((p) => p.visual.body.url === placement.visual && p.name === placement.name) ??
    presets.find((p) => p.visual.body.url === placement.visual) ??
    presets.find((p) => p.name === placement.name)
  return match?.id ?? placement.name
}

/**
 * The scene's vehicles as a config to paste into the host start / host-vehicles list:
 * `start` is the occupied vehicle (null on foot), `vehicles` the others with every hitched
 * trailer right after its tractor (`tow: true`). lat/lon 6 decimals, heading 1 decimal.
 */
export function exportVehiclePlacements(placements: readonly VehiclePlacementLike[]): {
  start: ExportedVehicle | null
  vehicles: ExportedVehicle[]
} {
  const entry = (p: VehiclePlacementLike, tow: boolean): ExportedVehicle => ({
    id: p.id,
    vehicle: vehiclePresetId(p),
    lat: Number(p.lat.toFixed(6)),
    lon: Number(p.lon.toFixed(6)),
    heading: Number(p.heading.toFixed(1)) % 360,
    ...(p.color ? { color: p.color } : {}),
    ...(tow ? { tow: true as const } : {}),
  })
  const ids = new Set(placements.map((p) => p.id))
  const trailers = (tractor: string) => placements.filter((p) => p.towedBy === tractor)
  const player = placements.find((p) => p.player) ?? null
  const vehicles: ExportedVehicle[] = []
  for (const p of placements) {
    // A hitched trailer follows its tractor; one whose tractor is gone is listed free.
    if (p.towedBy && ids.has(p.towedBy)) continue
    if (p !== player) vehicles.push(entry(p, false))
    for (const trailer of trailers(p.id)) vehicles.push(entry(trailer, true))
  }
  return { start: player ? entry(player, false) : null, vehicles }
}

/** Scenery the same menu can add: Portal, Galería 2.5D, Sprite and the two street lamps. */
export interface ObjectChoice {
  id: PlaceableId
  label: string
  ahead: number
}

/** The scenery the menu offers after the vehicles (engine `placeables`). */
export function objectChoices(): ObjectChoice[] {
  return placeables.map((entry) => ({ id: entry.id, label: entry.label, ahead: entry.ahead }))
}

/** Button text for the selected entry: "Añadir vehículo", "Añadir portal", … */
export function addLabel(choiceId: string): string {
  const object = objectChoices().find((item) => item.id === choiceId)
  if (!object) return t('scene.add-vehicle')
  return `Añadir ${object.label.charAt(0).toLowerCase()}${object.label.slice(1)}`
}

/** A vehicle that can be added, including passive trailers. */
export interface VehicleChoice {
  id: string
  label: string
}

/** The vehicles the menu offers, in catalog order. The catalog has no planes or helicopters. */
export function vehicleChoices(): VehicleChoice[] {
  return vehiclePresets()
    .filter((preset) => !preset.hidden)
    .map((preset) => ({ id: preset.id, label: preset.label }))
}

/** Optional explicit preloads; other menu vehicles prepare on first use. */
export function menuPreloadVehicles(ids: readonly string[] = []): Entity[][] {
  return [...new Set(ids)]
    .filter((id) => vehicleChoices().some((choice) => choice.id === id))
    .map((id) => presetEntities(id, `preload-${id}`))
}

/** Metres as shown to the player: one decimal and a decimal comma. */
export function formatMetres(metres: number): string {
  return metres.toFixed(1).replace('.', ',').replace(/^-/, '−') + ' m'
}

/** Spanish text for the sea status line. */
export function seaStatus(sea: { level: number; state: string }, manual: boolean): string {
  return manual
    ? t('settings.sea-fixed-level', { level: formatMetres(sea.level) })
    : t('settings.sea-auto-tide', { level: formatMetres(sea.level), state: String(sea.state) })
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
  // Staging holder: the settings HUD moves these rows into Mundo; leftovers stay hidden.
  const planet = document.createElement('div')
  planet.id = 'scene-controls-staging'
  planet.hidden = true
  document.body.append(planet)

  const timeNow = document.createElement('p')
  timeNow.id = 'time-now'
  timeNow.setAttribute('role', 'status')
  const timeRange = field(
    'time-range',
    'range',
    { min: '0', max: '1439', step: '1', value: '720' },
    t('scene.time-of-day'),
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
    t('scene.time-hh-mm'),
  )
  const timeRow = document.createElement('label')
  timeRow.append(t('scene.time-of-day'), timeRange, timeInput)
  const timeSpeed = field(
    'time-speed',
    'range',
    {
      min: String(SKY_RATE.min),
      max: String(SKY_RATE.max),
      step: '1',
      value: '1',
    },
    t('scene.time-speed'),
  )
  const timeSpeedLabel = document.createElement('span')
  timeSpeedLabel.id = 'time-speed-label'
  timeSpeedLabel.textContent = '×1'
  const timeSpeedRow = document.createElement('label')
  timeSpeedRow.append(t('scene.time-speed') + ' ', timeSpeedLabel, timeSpeed)
  const timeLive = button('time-live', t('scene.now'))
  timeLive.title = t('scene.use-the-real-time-the-sun-follows-the-clock')

  const sky = check('planet-sky', t('scene.sky'))
  const sun = check('planet-sun', t('scene.sun-and-flare'))
  sun.label.title = t('scene.sun-disc-flare-and-directional-light')

  const seaNow = document.createElement('p')
  seaNow.id = 'sea-now'
  seaNow.setAttribute('role', 'status')
  const seaEnabled = check('planet-sea', t('scene.show-the-sea'))
  const seaAttrs = {
    min: String(SEA_RANGE.min),
    max: String(SEA_RANGE.max),
    step: String(SEA_RANGE.step),
  }
  const seaRange = field('sea-range', 'range', { ...seaAttrs, value: '0' }, t('scene.sea-level-m'))
  const seaInput = field('sea-input', 'number', { ...seaAttrs, value: '0' }, t('scene.sea-level-m'))
  const seaRow = document.createElement('label')
  seaRow.append(t('scene.level-m'), seaRange, seaInput)
  const seaTide = button('sea-tide', t('scene.automatic-tide'))
  seaTide.title = t('scene.back-to-the-simplified-tide-1-m')

  const clouds = check('planet-clouds', t('settings.clouds'))
  const artistic = check('planet-clouds-artistic', t('scene.artistic-clouds'))
  const cloudAmount = field(
    'planet-cloud-amount',
    'range',
    { min: '0', max: '100', step: '1', value: '35' },
    t('scene.cloud-amount'),
  )
  const cloudAmountLabel = document.createElement('span')
  cloudAmountLabel.id = 'planet-cloud-amount-label'
  cloudAmountLabel.textContent = '35%'
  const cloudAmountRow = document.createElement('label')
  cloudAmountRow.append(t('scene.cloud-amount') + ' ', cloudAmountLabel, cloudAmount)

  planet.append(
    group(t('settings.time-of-day'), 'scene-time', timeNow, timeRow, timeSpeedRow, timeLive),
    group(t('settings.sky'), 'scene-sky', sky.label),
    group(t('settings.sun'), 'scene-sun', sun.label),
    group(t('settings.sea'), 'scene-sea', seaNow, seaEnabled.label, seaRow, seaTide),
    group(t('settings.clouds'), 'scene-clouds', clouds.label, artistic.label, cloudAmountRow),
  )

  const vehicles = menuSection('scene-vehicles', t('settings.vehicles'))
  const choice = document.createElement('select')
  choice.id = 'vehicle-choice'
  choice.setAttribute('aria-label', t('scene.vehicle-to-add'))
  const vehicleGroup = document.createElement('optgroup')
  vehicleGroup.label = t('settings.vehicles')
  for (const item of vehicleChoices()) vehicleGroup.append(new Option(item.label, item.id))
  const objectGroup = document.createElement('optgroup')
  objectGroup.label = t('settings.objects')
  for (const item of objectChoices()) objectGroup.append(new Option(item.label, item.id))
  choice.append(vehicleGroup, objectGroup)
  const choiceRow = document.createElement('label')
  choiceRow.append(t('scene.what-to-add'), choice)
  const add = button('vehicle-add', t('scene.add-vehicle'))
  choice.addEventListener('change', () => (add.textContent = addLabel(choice.value)))
  const vehicleMessage = document.createElement('p')
  vehicleMessage.id = 'vehicle-message'
  vehicleMessage.setAttribute('role', 'status')
  const vehicleList = document.createElement('ul')
  vehicleList.id = 'vehicle-list'
  // «Volante»: per-model steering-wheel position of the vehicle the player drives.
  const wheel = steeringWheelControls()
  // «Espejos»: per-model glass angle of each mirror of the vehicle the player drives.
  const mirrors = mirrorControls()
  const driverPose = driverPoseControls()
  // «Exportar posición de vehículos»: JSON for the start / host-vehicles config.
  const exportButton = button('vehicle-export', t('scene.export-vehicle-positions'))
  exportButton.title = t('scene.copy-every-vehicle-s-position-to-the-clipboard-j')
  const exportText = document.createElement('textarea')
  exportText.id = 'vehicle-export-text'
  exportText.readOnly = true
  exportText.rows = 6
  exportText.hidden = true
  exportText.setAttribute('aria-label', t('scene.vehicle-positions-json'))
  vehicles.append(
    choiceRow,
    add,
    vehicleMessage,
    vehicleList,
    exportButton,
    exportText,
    wheel.root,
    mirrors.root,
    driverPose.root,
  )

  isolateKeys(timeRange, timeInput, timeSpeed, seaRange, seaInput, cloudAmount, choice, exportText)
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
    exportButton,
  ]
  for (const control of controls) (control as HTMLInputElement).disabled = true

  return (runtime) => {
    // Start loading the picked model as soon as it is chosen; «Añadir» then only places it.
    choice.addEventListener('change', () => {
      if (vehicleChoices().some((item) => item.id === choice.value))
        void runtime
          .prewarmVehicle?.(presetEntities(choice.value, 'spawn-template'))
          ?.catch(() => {})
    })
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
          ? t('scene.clock-live', { time: formatClockTime(minutes) })
          : clock.mode === 'live'
            ? t('scene.clock-running', { rate, time: formatClockTime(minutes) })
            : t('scene.clock-fixed', { time: formatClockTime(minutes) })
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
    // The menu clock button changes the time with the mouse wheel; follow it here and in the address.
    window.addEventListener('nabla-sky-clock', () => {
      remember({ time: formatClockTime(localMinutes(skyTime(runtime.skyClock))) })
      showTime()
    })

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

    const refreshWheel = wheel.bind(runtime)
    const refreshMirrors = mirrors.bind(runtime)
    const refreshDriverPose = driverPose.bind(runtime)
    const timer = setInterval(() => {
      refreshWheel()
      refreshMirrors()
      refreshDriverPose()
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
        const remove = button(`vehicle-remove-${spawned.id}`, t('scene.remove-vehicle'))
        remove.addEventListener('click', () => {
          try {
            runtime.removeSpawnedVehicle(spawned.id)
            vehicleMessage.textContent = `${spawned.name} quitado.`
          } catch {
            vehicleMessage.textContent = t('scene.get-out-of-the-vehicle-e-before-removing-it')
          }
          renderList()
        })
        item.append(name, remove)
        if (runtime.setTrailerPlatform && /Portacoches|plataforma negra/.test(spawned.name)) {
          for (const [flat, label] of [
            [false, t('scene.lower-ramp')],
            [true, t('scene.level-pin-cars')],
          ] as const) {
            const control = button(`platform-${spawned.id}-${flat}`, label)
            control.addEventListener('click', () => {
              vehicleMessage.textContent = runtime.setTrailerPlatform!(spawned.id, flat)
            })
            item.append(control)
          }
        }
        vehicleList.append(item)
      }
      for (const placed of runtime.placedObjects) {
        const item = document.createElement('li')
        item.dataset.placedId = placed.id
        const name = document.createElement('span')
        name.textContent = placed.name
        const remove = button(`placed-remove-${placed.id}`, t('settings.remove'))
        remove.addEventListener('click', () => {
          try {
            runtime.removePlaced(placed.id)
            vehicleMessage.textContent = `${placed.name} quitado.`
          } catch (error) {
            vehicleMessage.textContent =
              t('scene.could-not-remove') + (error instanceof Error ? error.message : String(error))
          }
          renderList()
        })
        item.append(name, remove)
        vehicleList.append(item)
      }
    }
    const groundError = (error: unknown, what: string) =>
      /ground/i.test(String(error instanceof Error ? error.message : error))
        ? t('scene.no-terrain-loaded-in-front-of-you-wait-for-it-to')
        : `No se pudo añadir ${what}: ` + (error instanceof Error ? error.message : String(error))
    add.addEventListener('click', async () => {
      const object = objectChoices().find((item) => item.id === choice.value)
      if (object) {
        add.disabled = true
        vehicleMessage.textContent = t('boot.loading-vehicle')
        try {
          await runtime.spawnEntities(
            createPlaceable(object.id, `place-${object.id}`),
            object.ahead,
            object.label,
          )
          vehicleMessage.textContent =
            object.id === 'portal'
              ? t('scene.portal-added-in-front-of-you-its-panel-is-behind')
              : `${object.label} añadido delante de ti.`
        } catch (error) {
          vehicleMessage.textContent = groundError(error, object.label.toLowerCase())
        } finally {
          add.disabled = false
          renderList()
        }
        return
      }
      const entry = vehicleChoices().find((item) => item.id === choice.value)
      if (!entry) return
      add.disabled = true
      vehicleMessage.textContent = t('scene.adding')
      try {
        // `presetEntities` keeps hosted parts such as the carrier stern portal.
        const entities = presetEntities(entry.id, 'spawn-template')
        assignVehicleColor(entities[0])
        await runtime.spawnVehicle(entities)
        vehicleMessage.textContent = `${entry.label} añadido delante de ti. Acércate y pulsa E para entrar.`
      } catch (error) {
        vehicleMessage.textContent = groundError(error, t('scene.the-vehicle'))
      } finally {
        add.disabled = false
        renderList()
      }
    })
    renderList()

    exportButton.disabled = !runtime.vehiclePlacements
    exportButton.addEventListener('click', () => {
      const json = JSON.stringify(
        exportVehiclePlacements(runtime.vehiclePlacements?.() ?? []),
        null,
        2,
      )
      // Always visible as the fallback; the clipboard is best effort (needs a secure context).
      exportText.value = json
      exportText.hidden = false
      exportText.select()
      const done = () => (vehicleMessage.textContent = t('scene.vehicle-positions-copied-json'))
      const fallback = () =>
        (vehicleMessage.textContent = t('scene.could-not-copy-select-the-text-and-copy-it'))
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(json).then(done, fallback)
      else fallback()
    })
  }
}
