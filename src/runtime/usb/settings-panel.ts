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
  legend.textContent = 'Dispositivos USB'
  root.append(legend)
  const note = doc.createElement('p')
  note.textContent =
    'Conecta el volante o joystick y mueve un eje o pulsa un botón. Calibra antes de conducir. Al volver al juego, deja los controles en reposo para activarlos.'
  root.append(note)
  const status = doc.createElement('p')
  status.setAttribute('role', 'status')
  const devices = doc.createElement('select')
  devices.setAttribute('aria-label', 'Dispositivo USB')
  const mode = doc.createElement('select')
  mode.setAttribute('aria-label', 'Perfil USB')
  for (const [value, label] of [
    ['road', 'Conducción'],
    ['flight', 'Joystick / HOTAS'],
    ['drone', 'Emisora para drones'],
  ]) {
    const o = doc.createElement('option')
    o.value = value
    o.textContent = label
    mode.append(o)
  }
  const live = doc.createElement('pre')
  live.style.cssText = 'font:14px monospace;white-space:pre-wrap;max-height:180px;overflow:auto'
  const bindings = doc.createElement('div')
  const target = doc.createElement('select')
  target.setAttribute('aria-label', 'Control a asignar')
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
    div.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0'
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
  const bind = button('Mover / pulsar para asignar', () => {
    const pad = selected()
    if (!pad) throw new Error('Selecciona un dispositivo conectado')
    capture = {
      device: devices.value,
      axes: [...pad.axes],
      buttons: pad.buttons.map((b) => b.value),
      until: performance.now() + 10000,
    }
    status.textContent = 'Mueve solo el control que quieres asignar (10 segundos).'
  })
  row(mode, devices)
  row(target, bind)
  const manualKind = doc.createElement('select')
  manualKind.setAttribute('aria-label', 'Tipo de entrada')
  for (const kind of ['axis', 'button', 'hat']) {
    const o = doc.createElement('option')
    o.value = kind
    o.textContent = kind === 'axis' ? 'Eje' : kind === 'button' ? 'Botón' : 'Hat / POV'
    manualKind.append(o)
  }
  const manualIndex = doc.createElement('input')
  manualIndex.type = 'number'
  manualIndex.min = '0'
  manualIndex.max = '127'
  manualIndex.value = '0'
  manualIndex.setAttribute('aria-label', 'Índice del eje o botón')
  const hatValue = doc.createElement('input')
  hatValue.type = 'number'
  hatValue.min = '-1'
  hatValue.max = '1'
  hatValue.step = '0.01'
  hatValue.value = '-1'
  hatValue.setAttribute('aria-label', 'Valor del hat')
  const install = (binding: UsbBinding) => {
    const list = hub.snapshot.profiles[selectedMode()].bindings.filter(
      (b) => !(b.device === binding.device && b.target === binding.target),
    )
    save([...list, binding])
    status.textContent = 'Asignado. Comprueba inversión y calibra el recorrido.'
  }
  row(
    manualKind,
    manualIndex,
    hatValue,
    button('Asignar por índice', () => {
      if (!selected()) throw new Error('Selecciona un dispositivo conectado')
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
    if (c.max - c.min < 0.1) throw new Error('No se ha recorrido el eje. Repite la calibración.')
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
    status.textContent = 'Recorrido calibrado y guardado.'
  }
  row(
    button('Terminar calibración', finishCalibration),
    button('Cancelar captura', () => {
      capture = null
      calibration = null
      status.textContent = 'Captura cancelada'
    }),
  )
  const templates = doc.createElement('select')
  templates.setAttribute('aria-label', 'Plantilla USB')
  for (const [value, text] of [
    ['wheel', 'Volante genérico'],
    ['hotas', 'Joystick / HOTAS'],
    ['AETR', 'Emisora AETR'],
    ['TAER', 'Emisora TAER'],
  ]) {
    const o = doc.createElement('option')
    o.value = value
    o.textContent = text
    templates.append(o)
  }
  row(
    templates,
    button('Cargar plantilla (requiere calibración)', () => {
      if (!selected()) throw new Error('Selecciona un dispositivo conectado')
      const kind = templates.value as 'wheel' | 'hotas' | 'AETR' | 'TAER'
      mode.value = kind === 'wheel' ? 'road' : 'flight'
      const list = hub.snapshot.profiles[selectedMode()].bindings.filter(
        (b) => b.device !== devices.value,
      )
      save([...list, ...usbTemplate(kind, devices.value)])
      status.textContent =
        'Plantilla cargada. Los índices son orientativos: comprueba y calibra cada eje.'
    }),
  )
  for (const [key, text] of [
    ['wheelDegrees', 'Recorrido físico del volante (°)'],
    ['steeringDegrees', 'Recorrido para giro completo (°)'],
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
        deviceLabel.textContent = 'Dispositivo: ' + JSON.parse(binding.device)[0]
      } catch {
        deviceLabel.textContent = 'Dispositivo: ' + binding.device
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
      label.append('Invertir ', invert)
      group.append(label)
      const range = doc.createElement('select')
      range.setAttribute('aria-label', 'Tipo de recorrido')
      for (const [value, text] of [
        ['signed', 'Centrado −1…1'],
        ['positive', 'Pedal −1→+1'],
        ['negative', 'Pedal +1→−1'],
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
        ['deadzone', 'Zona muerta', 0.01],
        ['saturation', 'Saturación', 0.01],
        ['exponent', 'Curva', 0.05],
        ['min', 'Mínimo', 0.01],
        ['center', 'Centro/reposo', 0.01],
        ['max', 'Máximo', 0.01],
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
        button('Calibrar', () => {
          const p = pads().find((p) => usbDeviceKey(p) === binding.device)
          const value = p?.axes[binding.index]
          if (binding.kind !== 'axis' || value === undefined)
            throw new Error('Calibración disponible para ejes conectados')
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
            'Reposo capturado. Recorre todo el eje y pulsa «Terminar calibración».'
        }),
        button('Eliminar', () =>
          save(hub.snapshot.profiles[selectedMode()].bindings.filter((_, i) => i !== index)),
        ),
      )
      bindings.append(group)
    })
  }
  const json = doc.createElement('textarea')
  json.rows = 5
  json.style.cssText = 'width:100%;font:14px monospace'
  json.setAttribute('aria-label', 'Perfiles USB JSON')
  row(
    button('Exportar perfiles', () => {
      json.value = hub.export()
    }),
    button('Importar perfiles', () => {
      hub.configure(JSON.parse(json.value))
      renderBindings()
      status.textContent = 'Perfiles importados'
    }),
    button('Restaurar este perfil', () => save([])),
    button('Informe de dispositivos', () => {
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
    fl.textContent = 'Vibración y force feedback'
    f.append(fl)
    const enabled = doc.createElement('input')
    enabled.type = 'checkbox'
    feedbackEnabled = enabled
    enabled.onchange = () => {
      feedback.enabled = enabled.checked
      if (!enabled.checked) feedback.stop()
    }
    const label = doc.createElement('label')
    label.append('Activar feedback (se desactiva al perder foco) ', enabled)
    const gain = doc.createElement('input')
    gain.type = 'range'
    gain.min = '0'
    gain.max = '1'
    gain.step = '0.01'
    gain.value = String(feedback.gain)
    gain.setAttribute('aria-label', 'Intensidad de feedback')
    gain.oninput = () => {
      feedback.gain = Number(gain.value)
    }
    const inverse = doc.createElement('input')
    inverse.type = 'checkbox'
    inverse.onchange = () => {
      feedback.invert = inverse.checked
    }
    const invLabel = doc.createElement('label')
    invLabel.append('Invertir fuerza ', inverse)
    const url = doc.createElement('input')
    url.value = 'ws://127.0.0.1:9876'
    url.setAttribute('aria-label', 'URL del puente FFB')
    const token = doc.createElement('input')
    token.type = 'password'
    token.autocomplete = 'off'
    token.placeholder = 'Token del puente local'
    token.setAttribute('aria-label', 'Token del puente FFB')
    const description = doc.createElement('p')
    description.textContent =
      'Vibración: usa el dispositivo seleccionado. Fuerza real experimental: requiere el puente SDL local y validación con tu volante. La fuerza inicial está limitada al 20 %. Se usa el par de los contactos de las ruedas de Engine.'
    f.append(
      description,
      label,
      gain,
      invLabel,
      url,
      token,
      button('Conectar puente FFB', () => {
        feedback.connect(url.value, token.value)
        token.value = ''
        status.textContent = 'Conectando al puente local…'
      }),
      button('Detener y desconectar FFB', () => {
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
        o.textContent = `${p.id} · ${p.axes.length} ejes / ${p.buttons.length} botones`
        devices.append(o)
      }
      if ([...devices.options].some((o) => o.value === old)) devices.value = old
      status.textContent = list.length
        ? 'Dispositivos detectados'
        : globalThis.isSecureContext === false
          ? 'Usa HTTPS o localhost para acceder a los mandos'
          : 'Pulsa un botón del dispositivo para detectarlo.'
    }
    const p = selected()
    if (feedback) feedback.device = devices.value
    live.textContent = p
      ? `Ejes: ${p.axes.map((v, i) => `${i}: ${v.toFixed(3)}`).join(' · ')}\nBotones: ${
          p.buttons
            .map((b, i) => (b.value > 0.05 ? `${i}: ${b.value.toFixed(2)}` : ''))
            .filter(Boolean)
            .join(' · ') || 'ninguno'
        }`
      : 'Sin dispositivo seleccionado'
    if (capture) {
      const c = capture,
        p = list.find((p) => usbDeviceKey(p) === c.device)
      if (!p || performance.now() > c.until) {
        capture = null
        status.textContent = 'Captura cancelada o agotada'
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
          ? ` Valor: ${b.kind === 'axis' ? normalizeUsbAxis(p.axes[b.index] ?? NaN, b).toFixed(3) : (p.buttons[b.index]?.value ?? 0)}`
          : ' Desconectado'
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
  summary.textContent = 'Ajustes avanzados y diagnóstico'
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
