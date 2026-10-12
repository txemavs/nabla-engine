import type { GameRuntime } from '@nabla/engine/runtime/browser'
import { menuSection } from './menu.js'
import { browserStorage } from './entry.js'

/** Temporary live controls for truck exhaust position and quantity. */
export function bindExhaustControls(
  runtime: Pick<
    GameRuntime,
    'truckExhaustOffset' | 'setTruckExhaustOffset' | 'truckExhaustAmount' | 'setTruckExhaustAmount'
  >,
): void {
  const group = menuSection('settings-truck-exhaust', 'Camión · posición del humo (provisional)')
  const storage = browserStorage()
  const key = 'nabla.truckExhaustOffset'
  const amountKey = 'nabla.truckExhaustAmount'
  try {
    const saved = storage?.getItem(amountKey)
    if (saved !== null && saved !== undefined && Number.isFinite(Number(saved)))
      runtime.setTruckExhaustAmount(Number(saved))
  } catch {
    /* Optional storage. */
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
    try {
      storage?.setItem(amountKey, String(value))
    } catch {
      /* Optional storage. */
    }
    refresh()
  })
  amountLabel.append('Cantidad ', amountSlider, ' ', amountOutput)
  group.append(amountLabel)
  try {
    const saved = JSON.parse(storage?.getItem(key) ?? 'null')
    if (Array.isArray(saved) && saved.length === 3 && saved.every(Number.isFinite))
      runtime.setTruckExhaustOffset(saved as [number, number, number])
  } catch {
    /* Optional local preference. */
  }
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
      try {
        storage?.setItem(key, JSON.stringify(next))
      } catch {
        /* Optional storage. */
      }
      refresh()
    })
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
    try {
      storage?.setItem(key, '[0,0,0]')
      storage?.setItem(amountKey, '1')
    } catch {
      /* Optional storage. */
    }
    refresh()
  })
  group.append(reset)
  refresh()
}
