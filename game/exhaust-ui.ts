import type { GameRuntime } from '@nabla/engine/runtime/browser'
import { menuSection } from './menu.js'

/**
 * Live controls for the exhaust of vehicles whose data lets the player adjust it
 * (`vehicle.exhaust.adjustable`: outlet position; `smoke.amount: "manual"`: quantity). The rows
 * are tagged `data-exhaust-group` so the settings can show only those that apply.
 */
export function bindExhaustControls(
  runtime: Pick<
    GameRuntime,
    | 'truckExhaustOffset'
    | 'setTruckExhaustOffset'
    | 'truckExhaustAmount'
    | 'setTruckExhaustAmount'
    | 'occupiedVehicle'
    | 'occupiedVehiclePreferences'
    | 'setVehiclePreferences'
  >,
): void {
  const group = menuSection('settings-truck-exhaust', 'Vehículo · escape y humo')
  // Saved per vehicle model (runtime.setVehiclePreferences), like the lights: entering another
  // model loads its own offset and quantity.
  let model: string | null | undefined
  const followModel = () => {
    const next = runtime.occupiedVehicle?.model ?? null
    if (next === model) return
    model = next
    const saved = runtime.occupiedVehiclePreferences
    runtime.setTruckExhaustOffset(saved.exhaustOffset)
    runtime.setTruckExhaustAmount(saved.exhaustAmount)
    refresh()
  }
  const amountLabel = document.createElement('label')
  const amountSlider = document.createElement('input')
  amountSlider.type = 'range'
  amountSlider.id = 'truck-exhaust-amount'
  amountSlider.min = '0'
  amountSlider.max = '200'
  amountSlider.step = '1'
  const amountOutput = document.createElement('output')
  amountOutput.htmlFor.add(amountSlider.id)
  amountSlider.addEventListener('input', () => {
    const value = runtime.setTruckExhaustAmount(Number(amountSlider.value) / 100)
    runtime.setVehiclePreferences({ exhaustAmount: value })
    refresh()
  })
  amountLabel.dataset.exhaustGroup = 'amount'
  amountLabel.append('Cantidad ', amountSlider, ' ', amountOutput)
  group.append(amountLabel)
  const rows: { slider: HTMLInputElement; output: HTMLOutputElement }[] = []
  const refresh = () => {
    amountSlider.value = String(Math.round(runtime.truckExhaustAmount * 100))
    amountOutput.textContent = `${amountSlider.value} %`
    runtime.truckExhaustOffset.forEach((value, i) => {
      rows[i].slider.value = String(Math.round(value * 1000))
      rows[i].output.textContent = `${Math.round(value * 1000)} mm`
    })
  }
  for (const [i, title] of [
    'Horizontal · derecha',
    'Altura · arriba',
    'Profundidad · atrás',
  ].entries()) {
    const label = document.createElement('label')
    const slider = document.createElement('input')
    slider.type = 'range'
    slider.id = `truck-exhaust-${i}`
    slider.min = '-500'
    slider.max = '500'
    slider.step = '1'
    const output = document.createElement('output')
    output.htmlFor.add(slider.id)
    slider.addEventListener('input', () => {
      const offset = runtime.truckExhaustOffset
      offset[i] = Number(slider.value) / 1000
      const next = runtime.setTruckExhaustOffset(offset)
      runtime.setVehiclePreferences({ exhaustOffset: next })
      refresh()
    })
    label.dataset.exhaustGroup = 'position'
    label.append(`${title} `, slider, ' ', output)
    rows.push({ slider, output })
    group.append(label)
  }
  const reset = document.createElement('button')
  reset.type = 'button'
  reset.textContent = 'Restablecer'
  reset.addEventListener('click', () => {
    runtime.setTruckExhaustOffset([0, 0, 0])
    runtime.setTruckExhaustAmount(1)
    runtime.setVehiclePreferences({ exhaustOffset: [0, 0, 0], exhaustAmount: 1 })
    refresh()
  })
  group.append(reset)
  followModel()
  setInterval(followModel, 1000)
}
