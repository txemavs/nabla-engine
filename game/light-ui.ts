/**
 * Ajustes → Opciones → Luz: live lighting sliders (exposure, sun, ambient, reflections, paint,
 * shadows) with their values, saved by the runtime (`nabla.lightTuning`). «Copiar valores» copies
 * the current values as JSON so they can be frozen as the new defaults; «Restablecer» goes back to
 * the shipped look.
 */
import {
  lightTuningBase,
  lightTuningDefaults,
  lightTuningRanges,
  type GameRuntime,
  type LightTuning,
} from '@nabla/engine/runtime/browser'
import { menuSection } from './menu.js'

type SliderKey = keyof typeof lightTuningRanges

const SLIDERS: ReadonlyArray<readonly [key: SliderKey, label: string]> = [
  ['exposure', 'Exposición'],
  ['sun', 'Sol'],
  ['ambient', 'Ambiente'],
  ['reflections', 'Reflejos'],
  ['paint', 'Pintura'],
  ['shadowIntensity', 'Sombras · intensidad'],
]

/** Value text: the number, plus the absolute full-day intensity for sun and ambient. */
export function lightValueText(key: SliderKey, value: number): string {
  const text = value.toFixed(2)
  if (key === 'sun') return `×${text} (${(value * lightTuningBase.sun).toFixed(2)})`
  if (key === 'ambient') return `×${text} (${(value * lightTuningBase.ambient).toFixed(3)})`
  if (key === 'reflections' || key === 'paint') return `×${text}`
  return text
}

export function bindLightControls(
  runtime: Pick<GameRuntime, 'lightTuning' | 'setLightTuning'>,
): HTMLFieldSetElement {
  const group = menuSection('settings-light', 'Luz')
  const rows = new Map<SliderKey, [HTMLInputElement, HTMLOutputElement]>()
  for (const [key, text] of SLIDERS) {
    const [min, max, step] = lightTuningRanges[key]
    const label = document.createElement('label')
    const slider = document.createElement('input')
    slider.type = 'range'
    slider.id = `light-${key}`
    slider.min = String(min)
    slider.max = String(max)
    slider.step = String(step)
    const output = document.createElement('output')
    output.htmlFor.add(slider.id)
    slider.addEventListener('input', () => {
      const next = runtime.setLightTuning({ [key]: Number(slider.value) } as Partial<LightTuning>)
      output.textContent = lightValueText(key, next[key])
    })
    label.append(`${text} `, slider, ' ', output)
    group.append(label)
    rows.set(key, [slider, output])
  }
  const shadowLabel = document.createElement('label')
  const shadows = document.createElement('input')
  shadows.type = 'checkbox'
  shadows.id = 'light-shadows'
  shadows.addEventListener('change', () => runtime.setLightTuning({ shadows: shadows.checked }))
  shadowLabel.append(shadows, ' Sombras')
  group.append(shadowLabel)
  const status = document.createElement('output')
  const copy = document.createElement('button')
  copy.type = 'button'
  copy.id = 'light-copy'
  copy.textContent = 'Copiar valores'
  copy.addEventListener('click', () => {
    const json = JSON.stringify(runtime.lightTuning)
    const done = () => (status.textContent = 'Copiado')
    const fallback = () => {
      window.prompt('Valores de luz (copiar):', json)
      status.textContent = ''
    }
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(json).then(done, fallback)
    else fallback()
  })
  const reset = document.createElement('button')
  reset.type = 'button'
  reset.id = 'light-reset'
  reset.textContent = 'Restablecer'
  reset.addEventListener('click', () => {
    runtime.setLightTuning({ ...lightTuningDefaults })
    show()
  })
  const buttons = document.createElement('div')
  buttons.append(copy, ' ', reset, ' ', status)
  group.append(buttons)
  const show = () => {
    const t = runtime.lightTuning
    for (const [key, [slider, output]] of rows) {
      slider.value = String(t[key])
      output.textContent = lightValueText(key, t[key])
    }
    shadows.checked = t.shadows
  }
  show()
  return group
}
