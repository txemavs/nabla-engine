import type { GameRuntime } from '@nabla/engine/runtime/browser'
import { menuSection } from './menu.js'
import { browserStorage } from './entry.js'

/** Temporary live alignment controls; offsets move both alternating S3 jets together. */
export function bindExhaustControls(
  runtime: Pick<
    GameRuntime,
    's3ExhaustOffset' | 'setS3ExhaustOffset' | 's3ExhaustAmount' | 'setS3ExhaustAmount'
  >,
): void {
  const group = menuSection('settings-s3-exhaust', 'S3 · posición del humo (provisional)')
  const storage = browserStorage()
  const key = 'nabla.s3ExhaustOffset'
  const amountKey = 'nabla.s3ExhaustAmount'
  try {
    const saved = storage?.getItem(amountKey)
    if (saved !== null && saved !== undefined && Number.isFinite(Number(saved)))
      runtime.setS3ExhaustAmount(Number(saved))
  } catch {
    /* Optional storage. */
  }
  const amountLabel = document.createElement('label')
  const amountSlider = document.createElement('input')
  amountSlider.type = 'range'
  amountSlider.id = 's3-exhaust-amount'
  amountSlider.min = '0'
  amountSlider.max = '200'
  amountSlider.step = '1'
  const amountOutput = document.createElement('output')
  amountOutput.htmlFor.add(amountSlider.id)
  amountSlider.addEventListener('input', () => {
    const value = runtime.setS3ExhaustAmount(Number(amountSlider.value) / 100)
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
      runtime.setS3ExhaustOffset(saved as [number, number, number])
  } catch {
    /* Optional local preference. */
  }
  const rows: { slider: HTMLInputElement; output: HTMLOutputElement }[] = []
  const refresh = () => {
    amountSlider.value = String(Math.round(runtime.s3ExhaustAmount * 100))
    amountOutput.textContent = `${amountSlider.value} %`
    runtime.s3ExhaustOffset.forEach((value, i) => {
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
    slider.id = `s3-exhaust-${i}`
    slider.min = '-500'
    slider.max = '500'
    slider.step = '1'
    const output = document.createElement('output')
    output.htmlFor.add(slider.id)
    slider.addEventListener('input', () => {
      const offset = runtime.s3ExhaustOffset
      offset[i] = Number(slider.value) / 1000
      const next = runtime.setS3ExhaustOffset(offset)
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
    runtime.setS3ExhaustOffset([0, 0, 0])
    runtime.setS3ExhaustAmount(0.5)
    try {
      storage?.setItem(key, '[0,0,0]')
      storage?.setItem(amountKey, '0.5')
    } catch {
      /* Optional storage. */
    }
    refresh()
  })
  group.append(reset)
  refresh()
}
