/**
 * «Volante» in the Vehículos menu: live sliders that move the steering wheel of the vehicle the
 * player drives along its column («Volante: distancia») and vertically («Volante: altura»), on top
 * of the pose baked into its GLB. The engine applies, clamps and saves the choice per steering
 * model (`GameRuntime.setSteeringWheelOffset`); this file only shows it, in centimetres.
 */
import { menuSubtitle } from './menu.js'

/** Metres, as in the engine (`SteeringWheelOffset`). */
export interface WheelOffset {
  distance: number
  height: number
}

/** What the controls need from `GameRuntime`; tests and pages without a steering wheel may omit it. */
export interface SteeringWheelRuntime {
  readonly steeringWheel: {
    name: string
    model: string
    offset: WheelOffset
    defaultOffset: WheelOffset
    saved: boolean
  } | null
  setSteeringWheelOffset(offset: Partial<WheelOffset>): WheelOffset | null
  resetSteeringWheelOffset(): WheelOffset | null
}

/** Slider limits in centimetres: ±8 cm in 0.5 cm steps (the engine's `steeringWheelOffsetRange`). */
export const WHEEL_RANGE_CM = { min: -8, max: 8, step: 0.5 } as const

/** Centimetres as shown to the player: sign, one decimal and a decimal comma, e.g. "+1,5 cm". */
export function formatWheelCm(metres: number): string {
  const cm = Math.round(metres * 1000) / 10
  if (cm === 0) return '0,0 cm'
  return (cm > 0 ? '+' : '−') + Math.abs(cm).toFixed(1).replace('.', ',') + ' cm'
}

/** Spanish summary of an adjustment, e.g. "distancia +1,5 cm · altura −0,5 cm". */
export function describeWheel(offset: WheelOffset): string {
  return `distancia ${formatWheelCm(offset.distance)} · altura ${formatWheelCm(offset.height)}`
}

/** The values a host default or a GLB bake takes, in metres: `{"distance":0.015,"height":-0.005}`. */
export function wheelBakeValues(offset: WheelOffset): string {
  return JSON.stringify({ distance: offset.distance, height: offset.height })
}

function slider(id: string, text: string) {
  const input = document.createElement('input')
  input.type = 'range'
  input.id = id
  input.min = String(WHEEL_RANGE_CM.min)
  input.max = String(WHEEL_RANGE_CM.max)
  input.step = String(WHEEL_RANGE_CM.step)
  input.value = '0'
  input.setAttribute('aria-label', text)
  const value = document.createElement('output')
  value.id = `${id}-value`
  value.textContent = formatWheelCm(0)
  const row = document.createElement('label')
  row.append(text + ' ', value, input)
  return { row, input, value }
}

/**
 * Build the «Volante» group (disabled until `bind`). `bind` returns `refresh`, which follows the
 * player into and out of vehicles; call it periodically.
 */
export function steeringWheelControls(): {
  root: HTMLDivElement
  controls: HTMLElement[]
  bind: (runtime: Partial<SteeringWheelRuntime>) => () => void
} {
  const root = document.createElement('div')
  root.className = 'planet-group'
  root.id = 'scene-steering-wheel'
  const status = document.createElement('p')
  status.id = 'steering-wheel-status'
  status.setAttribute('role', 'status')
  status.textContent = 'Entra en un coche para ajustar su volante.'
  const distance = slider('steering-wheel-distance', 'Volante: distancia')
  distance.row.title = '+ lo aleja de ti, hacia el cuadro de instrumentos; − lo acerca'
  const height = slider('steering-wheel-height', 'Volante: altura')
  height.row.title = '+ lo sube; − lo baja'
  const reset = document.createElement('button')
  reset.type = 'button'
  reset.id = 'steering-wheel-reset'
  reset.textContent = 'Restablecer volante'
  const values = document.createElement('p')
  values.id = 'steering-wheel-values'
  values.className = 'planet-settings-config'
  values.hidden = true
  root.append(menuSubtitle('Volante'), status, distance.row, height.row, reset, values)
  // Arrow keys move the slider, not the car.
  for (const input of [distance.input, height.input, reset])
    input.addEventListener('keydown', (event) => event.stopPropagation())
  const controls = [distance.input, height.input, reset]
  for (const control of controls) control.disabled = true

  const bind = (runtime: Partial<SteeringWheelRuntime>) => {
    let model: string | null = null
    const show = (offset: WheelOffset, syncSliders: boolean) => {
      distance.value.textContent = formatWheelCm(offset.distance)
      height.value.textContent = formatWheelCm(offset.height)
      if (syncSliders) {
        distance.input.value = String(offset.distance * 100)
        height.input.value = String(offset.height * 100)
      }
      values.hidden = false
      values.textContent =
        `Volante: ${describeWheel(offset)}\n` + `Valores para fijarlo: ${wheelBakeValues(offset)}`
    }
    const refresh = () => {
      const wheel = runtime.steeringWheel ?? null
      const next = wheel?.model ?? null
      for (const control of controls) control.disabled = !wheel
      if (!wheel) {
        model = null
        status.textContent = 'Entra en un coche para ajustar su volante.'
        values.hidden = true
        return
      }
      status.textContent = `Volante del ${wheel.name}` + (wheel.saved ? ' (ajuste guardado)' : '')
      // Only a new vehicle model moves the sliders; never fight a drag in progress.
      if (next !== model) {
        model = next
        show(wheel.offset, true)
      }
    }
    const change = () => {
      const applied = runtime.setSteeringWheelOffset?.({
        distance: Number(distance.input.value) / 100,
        height: Number(height.input.value) / 100,
      })
      if (applied) show(applied, false)
      refresh()
    }
    distance.input.addEventListener('input', change)
    height.input.addEventListener('input', change)
    reset.addEventListener('click', () => {
      const applied = runtime.resetSteeringWheelOffset?.()
      if (applied) show(applied, true)
      refresh()
    })
    refresh()
    return refresh
  }
  return { root, controls, bind }
}
