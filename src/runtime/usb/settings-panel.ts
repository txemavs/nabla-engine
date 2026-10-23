import { createUsbWizardPanel } from './wizard-panel.js'
import { availableGamepads } from '../input.js'
import { inputBindings } from '../../config/input-bindings.js'
import {
  UsbControllers,
  usbAxes,
  usbDeviceKey,
  newUsbBinding,
  normalizeUsbAxis,
  usbTemplate,
  type UsbBinding,
  type UsbMode,
} from './controllers.js'
import type { UsbFeedback } from './feedback.js'
import { t } from '../../i18n/index.js'

/** Host supplies controllers/feedback; the panel never accesses a simulation or synthesizes keys. */
export function createUsbSettingsPanel(
  hub: UsbControllers,
  feedback?: UsbFeedback,
  doc: Document = document,
): {
  root: HTMLFieldSetElement
  refresh(): void
  dispose(): void
} {
  const root = doc.createElement('fieldset')
  root.id = 'settings-usb'
  root.className = 'menu-section usb-settings'
  const legend = doc.createElement('legend')
  legend.textContent = t('usb.title')
  root.append(legend)
  const note = doc.createElement('p')
  note.textContent = t('usb.note')
  root.append(note)
  const status = doc.createElement('p')
  status.setAttribute('role', 'status')
  const devices = doc.createElement('select')
  devices.setAttribute('aria-label', t('usb.device'))
  const mode = doc.createElement('select')
  mode.setAttribute('aria-label', t('usb.profile'))
  for (const [value, label] of [
    ['road', t('usb.mode.road')],
    ['flight', t('usb.mode.flight')],
    ['drone', t('usb.mode.drone')],
  ]) {
    const o = doc.createElement('option')
    o.value = value
    o.textContent = label
    mode.append(o)
  }
  const live = doc.createElement('pre')
  live.className = 'nabla-usb-live'
  const bindings = doc.createElement('div')
  const target = doc.createElement('select')
  target.setAttribute('aria-label', t('usb.target'))
  for (const [id, label] of Object.entries(usbAxes)) {
    const o = doc.createElement('option')
    o.value = id
    o.textContent = label
    target.append(o)
  }
  for (const [id, binding] of Object.entries(inputBindings)) {
    const o = doc.createElement('option')
    o.value = id
    o.textContent = binding.label
    target.append(o)
  }
  const row = (...children: Node[]) => {
    const div = doc.createElement('div')
    div.className = 'nabla-usb-actions'
    div.append(...children)
    root.append(div)
    return div
  }
  const button = (label: string, run: () => void) => {
    const b = doc.createElement('button')
    b.type = 'button'
    b.textContent = label
    b.onclick = () => {
      try {
        run()
      } catch (e) {
        status.textContent = e instanceof Error ? e.message : String(e)
      }
    }
    return b
  }
  const selectedMode = () => mode.value as UsbMode
  const pads = () => availableGamepads().filter((p): p is Gamepad => !!p?.connected)
  const selected = () => pads().find((p) => usbDeviceKey(p) === devices.value)
  const save = (list: UsbBinding[]) => {
    const settings = hub.snapshot
    settings.profiles[selectedMode()].bindings = list
    hub.configure(settings)
    renderBindings()
  }
  let capture: { device: string; axes: number[]; buttons: number[]; until: number } | null = null
  let calibration: {
    binding: UsbBinding
    index: number
    min: number
    max: number
    rest: number
    mode: UsbMode
  } | null = null
  const bind = button(t('usb.bind'), () => {
    const pad = selected()
    if (!pad) throw new Error(t('usb.select-device'))
    capture = {
      device: devices.value,
      axes: [...pad.axes],
      buttons: pad.buttons.map((b) => b.value),
      until: performance.now() + 10000,
    }
    status.textContent = t('usb.bind-hint')
  })
  row(mode, devices)
  row(target, bind)
  const manualKind = doc.createElement('select')
  manualKind.setAttribute('aria-label', t('usb.input-kind'))
  for (const kind of ['axis', 'button', 'hat']) {
    const o = doc.createElement('option')
    o.value = kind
    o.textContent = kind === 'axis' ? t('usb.kind.axis') : kind === 'button' ? t('usb.kind.button') : t('usb.kind.hat')
    manualKind.append(o)
  }
  const manualIndex = doc.createElement('input')
  manualIndex.type = 'number'
  manualIndex.min = '0'
  manualIndex.max = '127'
  manualIndex.value = '0'
  manualIndex.setAttribute('aria-label', t('usb.index'))
  const hatValue = doc.createElement('input')
  hatValue.type = 'number'
  hatValue.min = '-1'
  hatValue.max = '1'
  hatValue.step = '0.01'
  hatValue.value = '-1'
  hatValue.setAttribute('aria-label', t('usb.hat-value'))
  const install = (binding: UsbBinding) => {
    const list = hub.snapshot.profiles[selectedMode()].bindings.filter(
      (b) => !(b.device === binding.device && b.target === binding.target),
    )
    save([...list, binding])
    status.textContent = t('usb.assigned')
  }
  row(
    manualKind,
    manualIndex,
    hatValue,
    button(t('usb.assign-index'), () => {
      if (!selected()) throw new Error(t('usb.select-device'))
      const binding = newUsbBinding(
        devices.value,
        manualKind.value as UsbBinding['kind'],
        Number(manualIndex.value),
        target.value as UsbBinding['target'],
      )
      if (binding.kind === 'hat') binding.hatValue = Number(hatValue.value)
      install(binding)
    }),
  )
  const finishCalibration = () => {
    if (!calibration) return
    const c = calibration
    calibration = null
    if (c.max - c.min < 0.1) throw new Error(t('usb.axis-not-moved'))
    const settings = hub.snapshot,
      b = c.binding
    b.min = c.min
    b.max = c.max
    if (b.mode === 'signed') b.center = Math.max(c.min + 0.001, Math.min(c.max - 0.001, c.rest))
    else {
      b.center = (c.min + c.max) / 2
      b.mode = 'positive'
      b.invert = Math.abs(c.rest - c.max) < Math.abs(c.rest - c.min)
    }
    settings.profiles[c.mode].bindings[c.index] = b
    hub.configure(settings)
    renderBindings()
    status.textContent = t('usb.calibrated')
  }
  row(
    button(t('usb.finish-calibration'), finishCalibration),
    button(t('usb.cancel-capture'), () => {
      capture = null
      calibration = null
      status.textContent = t('usb.capture-cancelled')
    }),
  )
  const templates = doc.createElement('select')
  templates.setAttribute('aria-label', t('usb.template'))
  for (const [value, text] of [
    ['wheel', t('usb.template.wheel')],
    ['hotas', t('usb.mode.flight')],
    ['AETR', t('usb.template.aetr')],
    ['TAER', t('usb.template.taer')],
  ]) {
    const o = doc.createElement('option')
    o.value = value
    o.textContent = text
    templates.append(o)
  }
  row(
    templates,
    button(t('usb.load-template'), () => {
      if (!selected()) throw new Error(t('usb.select-device'))
      const kind = templates.value as 'wheel' | 'hotas' | 'AETR' | 'TAER'
      mode.value = kind === 'wheel' ? 'road' : 'flight'
      const list = hub.snapshot.profiles[selectedMode()].bindings.filter(
        (b) => b.device !== devices.value,
      )
      save([...list, ...usbTemplate(kind, devices.value)])
      status.textContent =
        t('usb.template-loaded')
    }),
  )
  for (const [key, text] of [
    ['wheelDegrees', t('usb.wheel-degrees')],
    ['steeringDegrees', t('usb.steering-degrees')],
  ] as const) {
    const label = doc.createElement('label')
    label.textContent = text + ' '
    const input = doc.createElement('input')
    input.type = 'number'
    input.min = '90'
    input.max = '2520'
    input.value = '900'
    input.setAttribute('aria-label', text)
    input.onchange = () => {
      try {
        const settings = hub.snapshot
        settings.profiles[selectedMode()][key] = Number(input.value)
        hub.configure(settings)
      } catch (e) {
        status.textContent = String(e)
      }
    }
    label.append(input)
    root.append(label)
  }
  root.append(live, bindings)
  function renderBindings(): void {
    bindings.replaceChildren()
    hub.snapshot.profiles[selectedMode()].bindings.forEach((binding, index) => {
      const group = doc.createElement('fieldset'),
        title = doc.createElement('legend')
      title.textContent = `${Object.hasOwn(usbAxes, binding.target) ? usbAxes[binding.target as keyof typeof usbAxes] : inputBindings[binding.target as keyof typeof inputBindings]?.label} · ${binding.kind} ${binding.index}`
      group.append(title)
      const deviceLabel = doc.createElement('small')
      try {
        deviceLabel.textContent = t('usb.device-label', { device: JSON.parse(binding.device)[0] })
      } catch {
        deviceLabel.textContent = t('usb.device-label', { device: binding.device })
      }
      deviceLabel.style.display = 'block'
      group.append(deviceLabel)
      const update = (change: Partial<UsbBinding>) => {
        const list = hub.snapshot.profiles[selectedMode()].bindings
        list[index] = { ...list[index], ...change }
        save(list)
      }
      const invert = doc.createElement('input')
      invert.type = 'checkbox'
      invert.checked = binding.invert
      invert.onchange = () => update({ invert: invert.checked })
      const label = doc.createElement('label')
      label.append(t('usb.invert') + ' ', invert)
      group.append(label)
      const range = doc.createElement('select')
      range.setAttribute('aria-label', t('usb.range-kind'))
      for (const [value, text] of [
        ['signed', t('usb.range.signed')],
        ['positive', t('usb.range.positive')],
        ['negative', t('usb.range.negative')],
      ]) {
        const o = doc.createElement('option')
        o.value = value
        o.textContent = text
        range.append(o)
      }
      range.value = binding.mode
      range.onchange = () =>
        update({ mode: range.value as UsbBinding['mode'], center: (binding.min + binding.max) / 2 })
      group.append(range)
      for (const [key, text, step] of [
        ['deadzone', t('usb.deadzone'), 0.01],
        ['saturation', t('usb.saturation'), 0.01],
        ['exponent', t('usb.curve'), 0.05],
        ['min', t('usb.min'), 0.01],
        ['center', t('usb.center'), 0.01],
        ['max', t('usb.max'), 0.01],
      ] as const) {
        const l = doc.createElement('label')
        l.textContent = text + ' '
        const input = doc.createElement('input')
        input.type = 'number'
        input.step = String(step)
        input.value = String(binding[key])
        input.style.width = '85px'
        input.setAttribute('aria-label', text)
        input.onchange = () => {
          try {
            update({ [key]: Number(input.value) })
          } catch (e) {
            status.textContent = String(e)
          }
        }
        l.append(input)
        group.append(l)
      }
      const output = doc.createElement('output')
      output.dataset.usbBinding = String(index)
      group.append(output)
      group.append(
        button(t('usb.calibrate'), () => {
          const p = pads().find((p) => usbDeviceKey(p) === binding.device)
          const value = p?.axes[binding.index]
          if (binding.kind !== 'axis' || value === undefined)
            throw new Error(t('usb.calibrate-axes-only'))
          capture = null
          calibration = {
            binding: { ...binding },
            index,
            min: value,
            max: value,
            rest: value,
            mode: selectedMode(),
          }
          status.textContent =
            t('usb.rest-captured')
        }),
        button(t('usb.remove'), () =>
          save(hub.snapshot.profiles[selectedMode()].bindings.filter((_, i) => i !== index)),
        ),
      )
      bindings.append(group)
    })
  }
  const json = doc.createElement('textarea')
  json.rows = 5
  json.className = 'nabla-usb-json'
  json.setAttribute('aria-label', t('usb.json'))
  row(
    button(t('usb.export'), () => {
      json.value = hub.export()
    }),
    button(t('usb.import'), () => {
      hub.configure(JSON.parse(json.value))
      renderBindings()
      status.textContent = t('usb.imported')
    }),
    button(t('usb.restore'), () => save([])),
    button(t('usb.report'), () => {
      json.value = JSON.stringify(
        {
          version: 1,
          userAgent: doc.defaultView?.navigator.userAgent,
          devices: pads().map((p) => ({
            id: p.id,
            key: usbDeviceKey(p),
            mapping: p.mapping,
            axes: [...p.axes],
            buttons: p.buttons.map((b) => b.value),
          })),
          settings: hub.snapshot,
        },
        null,
        2,
      )
    }),
  )
  root.append(json)
  let feedbackEnabled: HTMLInputElement | undefined
  const feedbackStatus = doc.createElement('p')
  if (feedback) {
    const f = doc.createElement('fieldset'),
      fl = doc.createElement('legend')
    fl.textContent = t('usb.ffb')
    f.append(fl)
    const enabled = doc.createElement('input')
    enabled.type = 'checkbox'
    feedbackEnabled = enabled
    enabled.onchange = () => {
      feedback.enabled = enabled.checked
      if (!enabled.checked) feedback.stop()
    }
    const label = doc.createElement('label')
    label.append(t('usb.ffb-enable') + ' ', enabled)
    const gain = doc.createElement('input')
    gain.type = 'range'
    gain.min = '0'
    gain.max = '1'
    gain.step = '0.01'
    gain.value = String(feedback.gain)
    gain.setAttribute('aria-label', t('usb.ffb-gain'))
    gain.oninput = () => {
      feedback.gain = Number(gain.value)
    }
    const inverse = doc.createElement('input')
    inverse.type = 'checkbox'
    inverse.onchange = () => {
      feedback.invert = inverse.checked
    }
    const invLabel = doc.createElement('label')
    invLabel.append(t('usb.ffb-invert') + ' ', inverse)
    const url = doc.createElement('input')
    url.value = 'ws://127.0.0.1:9876'
    url.setAttribute('aria-label', t('usb.ffb-url'))
    const token = doc.createElement('input')
    token.type = 'password'
    token.autocomplete = 'off'
    token.placeholder = t('usb.ffb-token-placeholder')
    token.setAttribute('aria-label', t('usb.ffb-token'))
    const description = doc.createElement('p')
    description.textContent =
      t('usb.ffb-note')
    f.append(
      description,
      label,
      gain,
      invLabel,
      url,
      token,
      button(t('usb.ffb-connect'), () => {
        feedback.connect(url.value, token.value)
        token.value = ''
        status.textContent = t('usb.ffb-connecting')
      }),
      button(t('usb.ffb-stop'), () => {
        feedback.enabled = false
        enabled.checked = false
        feedback.stop()
        feedback.transport?.dispose()
        feedback.transport = null
      }),
    )
    f.append(feedbackStatus)
    root.append(f)
  }
  root.append(status)
  let signature = ''
  const refresh = () => {
    if (!root.isConnected || root.hidden || root.closest('[hidden]')) return
    const list = pads()
    assistant.refresh(list)
    if (!advanced.open) return
    const sig = JSON.stringify(list.map((p) => [p.index, usbDeviceKey(p)]))
    if (sig !== signature) {
      signature = sig
      const old = devices.value
      devices.replaceChildren()
      for (const p of list) {
        const o = doc.createElement('option')
        o.value = usbDeviceKey(p)
        o.textContent = t('usb.pad-summary', { id: p.id, axes: p.axes.length, buttons: p.buttons.length })
        devices.append(o)
      }
      if ([...devices.options].some((o) => o.value === old)) devices.value = old
      status.textContent = list.length
        ? t('usb.devices-found')
        : globalThis.isSecureContext === false
          ? t('usb.need-https')
          : t('usb.press-to-detect')
    }
    const p = selected()
    if (feedback) feedback.device = devices.value
    live.textContent = p
      ? t('usb.live', {
          axes: p.axes.map((v, i) => `${i}: ${v.toFixed(3)}`).join(' · '),
          buttons:
            p.buttons
              .map((b, i) => (b.value > 0.05 ? `${i}: ${b.value.toFixed(2)}` : ''))
              .filter(Boolean)
              .join(' · ') || t('usb.none'),
        })
      : t('usb.no-device')
    if (capture) {
      const c = capture,
        p = list.find((p) => usbDeviceKey(p) === c.device)
      if (!p || performance.now() > c.until) {
        capture = null
        status.textContent = t('usb.capture-timeout')
      } else {
        const axis = p.axes.findIndex((v, i) => Math.abs(v - (c.axes[i] ?? v)) > 0.3),
          button = p.buttons.findIndex((v, i) => v.value > 0.65 && (c.buttons[i] ?? 0) < 0.2)
        if (axis >= 0 || button >= 0) {
          const b = newUsbBinding(
            c.device,
            axis >= 0 ? 'axis' : 'button',
            axis >= 0 ? axis : button,
            target.value as UsbBinding['target'],
          )
          if (axis >= 0 && b.mode === 'positive') {
            b.invert = (c.axes[axis] ?? 0) > 0.5
            if (Math.abs(c.axes[axis] ?? 0) < 0.1) b.min = 0
          }
          capture = null
          try {
            install(b)
          } catch (e) {
            status.textContent = String(e)
          }
        }
      }
    }
    if (calibration) {
      const c = calibration,
        p = list.find((p) => usbDeviceKey(p) === c.binding.device),
        v = p?.axes[c.binding.index]
      if (v !== undefined && Number.isFinite(v)) {
        c.min = Math.min(c.min, v)
        c.max = Math.max(c.max, v)
      }
    }
    const snapshot = hub.snapshot
    root.querySelectorAll<HTMLOutputElement>('[data-usb-binding]').forEach((o) => {
      const b = snapshot.profiles[selectedMode()].bindings[Number(o.dataset.usbBinding)],
        p = list.find((p) => usbDeviceKey(p) === b?.device)
      o.value =
        p && b
          ? t('usb.value', { value: b.kind === 'axis' ? normalizeUsbAxis(p.axes[b.index] ?? NaN, b).toFixed(3) : (p.buttons[b.index]?.value ?? 0) })
          : t('usb.disconnected-sp')
    })
    if (hub.error) status.textContent = hub.error
    if (feedback) {
      feedbackStatus.textContent = feedback.status
      if (feedbackEnabled) feedbackEnabled.checked = feedback.enabled
    }
  }
  mode.onchange = () => {
    capture = null
    calibration = null
    renderBindings()
  }
  devices.onchange = () => {
    capture = null
    calibration = null
  }
  renderBindings()
  const advanced = doc.createElement('details')
  const summary = doc.createElement('summary')
  summary.textContent = t('usb.advanced')
  advanced.append(summary, ...[...root.childNodes].filter((node) => node !== legend))
  const assistant = createUsbWizardPanel(hub, feedback, doc, renderBindings)
  root.append(assistant.root, advanced)
  const timer = doc.defaultView?.setInterval(refresh, 100)
  return {
    root,
    refresh,
    dispose: () => {
      if (timer !== undefined) doc.defaultView?.clearInterval(timer)
      capture = null
      calibration = null
      assistant.dispose()
      feedback?.stop()
      root.remove()
    },
  }
}
