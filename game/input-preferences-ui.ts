import type { GameRuntime } from '@nabla/engine/runtime/browser'
import { t } from '@nabla/engine/i18n'

export function createInputPreferencesSection(
  doc: Document,
  runtime: Pick<GameRuntime, 'inputPreferences' | 'setInputPreferences'>,
): HTMLElement {
  const root = doc.createElement('fieldset')
  root.id = 'settings-input'
  root.className = 'menu-section'
  const legend = doc.createElement('legend')
  legend.textContent = t('input.mouse-gamepad')
  root.append(legend)
  const settings = runtime.inputPreferences
  for (const [key, labelKey, min, max, step] of [
    ['mouseSensitivity', 'input.sensitivity', 0.1, 4, 0.05],
    ['gamepadDeadzone', 'input.deadzone', 0, 0.5, 0.01],
  ] as const) {
    const label = doc.createElement('label'),
      input = doc.createElement('input'),
      output = doc.createElement('output')
    label.textContent = t(labelKey)
    input.id = 'input-' + key
    input.type = 'range'
    input.min = String(min)
    input.max = String(max)
    input.step = String(step)
    input.value = String(settings[key])
    input.setAttribute('aria-label', t(labelKey))
    output.htmlFor = input.id
    const refresh = () => {
      output.value =
        key === 'mouseSensitivity'
          ? Number(input.value).toFixed(2) + '×'
          : Math.round(Number(input.value) * 100) + '%'
    }
    input.addEventListener('input', () => {
      input.value = String(runtime.setInputPreferences({ [key]: Number(input.value) })[key])
      refresh()
    })
    refresh()
    label.append(input, output)
    root.append(label)
  }
  const label = doc.createElement('label'),
    invert = doc.createElement('input')
  invert.type = 'checkbox'
  invert.id = 'input-invertMouseY'
  invert.checked = settings.invertMouseY
  invert.addEventListener('change', () =>
    runtime.setInputPreferences({ invertMouseY: invert.checked }),
  )
  label.append(invert, doc.createTextNode(t('input.invert-y')))
  root.append(label)
  return root
}
