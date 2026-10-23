import { t } from '@nabla/engine/i18n'
import { menuSubtitle } from './menu.js'
import { driverPoseRange, type DriverPoseAdjustment } from '@nabla/engine/config/driver-pose'

export interface DriverPoseRuntime {
  readonly driverPose: { name: string; model: string; offset: DriverPoseAdjustment } | null
  setDriverPoseOffset(offset: DriverPoseAdjustment): DriverPoseAdjustment | null
  resetDriverPoseOffset(): DriverPoseAdjustment | null
}
export function driverPoseControls() {
  const root = document.createElement('div')
  root.id = 'scene-driver-pose'
  root.className = 'planet-group'
  const status = document.createElement('p')
  status.textContent = t('settings.driver.enter-ferrari')
  const inputs: {
    group: 'head' | 'view'
    axis: number
    sign: number
    input: HTMLInputElement
    output: HTMLOutputElement
  }[] = []
  root.append(menuSubtitle(t('settings.driver.head-and-view')), status)
  for (const [group, title] of [
    ['head', t('settings.driver.head')],
    ['view', t('settings.driver.view')],
  ] as const) {
    const details = document.createElement('details')
    details.open = group === 'head'
    const summary = document.createElement('summary')
    summary.textContent = title
    details.append(summary)
    for (const [axis, label, sign] of [
      [0, t('settings.driver.lateral'), 1],
      [1, t('settings.driver.height'), 1],
      [2, t('settings.driver.forward'), -1],
    ] as const) {
      const row = document.createElement('label')
      const output = document.createElement('output')
      const input = document.createElement('input')
      input.type = 'range'
      input.id = `driver-pose-${group}-${axis}`
      input.min = String(driverPoseRange.min * 100)
      input.max = String(driverPoseRange.max * 100)
      input.step = String(driverPoseRange.step * 100)
      input.value = '0'
      input.disabled = true
      input.setAttribute('aria-label', `${title}: ${label}`)
      output.textContent = '0 cm'
      row.append(label + ' ', output, input)
      details.append(row)
      inputs.push({ group, axis, sign, input, output })
    }
    root.append(details)
  }
  const values = document.createElement('textarea')
  values.readOnly = true
  values.rows = 4
  values.hidden = true
  values.setAttribute('aria-label', t('settings.driver.values-label'))
  const reset = document.createElement('button')
  reset.type = 'button'
  reset.textContent = t('settings.driver.reset')
  reset.disabled = true
  const copy = document.createElement('button')
  copy.type = 'button'
  copy.textContent = t('settings.copy-values')
  copy.disabled = true
  root.append(reset, copy, values)
  for (const control of [...inputs.map((i) => i.input), reset, copy, values])
    control.addEventListener('keydown', (e) => e.stopPropagation())
  const bind = (runtime: Partial<DriverPoseRuntime>) => {
    let model: string | undefined
    const show = (offset: DriverPoseAdjustment) => {
      for (const { group, axis, sign, input, output } of inputs) {
        const cm = Math.round(offset[group][axis] * sign * 100)
        input.value = String(cm)
        output.textContent = `${cm} cm`
      }
      values.value = JSON.stringify({ model, units: 'meters', offsets: offset }, null, 2)
      values.hidden = false
    }
    const refresh = () => {
      const pose = runtime.driverPose
      for (const input of inputs) input.input.disabled = !pose
      reset.disabled = copy.disabled = !pose
      status.textContent = pose ? `Ajustando ${pose.name}` : t('settings.driver.enter-ferrari')
      if (!pose) {
        model = undefined
        values.hidden = true
        return
      }
      if (pose.model !== model) {
        model = pose.model
        show(pose.offset)
      }
    }
    for (const row of inputs)
      row.input.addEventListener('input', () => {
        const pose = runtime.driverPose
        if (!pose) return
        pose.offset[row.group][row.axis] = (Number(row.input.value) * row.sign) / 100
        const applied = runtime.setDriverPoseOffset?.(pose.offset)
        if (applied) show(applied)
      })
    reset.addEventListener('click', () => {
      const applied = runtime.resetDriverPoseOffset?.()
      if (applied) show(applied)
    })
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(values.value)
        status.textContent = t('settings.values-copied')
      } catch {
        values.hidden = false
        values.focus()
        values.select()
        status.textContent = t('settings.selected-press-ctrl-c')
      }
    })
    refresh()
    return refresh
  }
  return { root, bind }
}
