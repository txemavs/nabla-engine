import { inputBindings } from '../../config/input-bindings.js'
import {
  readUsbBinding,
  usbAxes,
  usbDeviceKey,
  type UsbControllers,
  type UsbPad,
} from './controllers.js'
import { UsbWizard, type UsbWizardKind } from './wizard.js'
import type { UsbFeedback } from './feedback.js'

export function createUsbWizardPanel(
  hub: UsbControllers,
  feedback: UsbFeedback | undefined,
  doc: Document,
  onSave: () => void,
): {
  root: HTMLElement
  refresh(pads: readonly UsbPad[]): void
  dispose(): void
} {
  const root = doc.createElement('section')
  root.setAttribute('aria-label', 'Asistentes de mandos')
  let wizard: UsbWizard | null = null,
    kind: UsbWizardKind = 'wheel',
    screen: 'home' | 'parts' | 'steps' = 'home',
    last = ''
  let parts = new Set<string>(),
    pads: readonly UsbPad[] = []
  const title = () =>
    kind === 'wheel'
      ? 'Volante y pedales'
      : kind === 'joystick'
        ? 'Joystick / HOTAS para naves'
        : 'Emisora para drones'
  const button = (label: string, run: () => void) => {
    const b = doc.createElement('button')
    b.type = 'button'
    b.textContent = label
    b.onclick = () => {
      try {
        run()
      } catch (e) {
        if (wizard) wizard.message = e instanceof Error ? e.message : String(e)
        else error.textContent = String(e)
      }
      render()
    }
    return b
  }
  const text = (value: string) => {
    const p = doc.createElement('p')
    p.textContent = value
    content.append(p)
    return p
  }
  const heading = doc.createElement('h3'),
    content = doc.createElement('div'),
    error = doc.createElement('p')
  error.setAttribute('role', 'status')
  error.setAttribute('aria-live', 'polite')
  const stop = () => {
    wizard = null
    hub.configuring = false
    hub.reset()
    feedback?.stop()
  }
  function render(): void {
    last = JSON.stringify([
      screen,
      kind,
      wizard?.stage,
      wizard?.index,
      wizard?.message,
      hub.snapshot.activeFlightProfile,
    ])
    root.replaceChildren(heading, content, error)
    content.replaceChildren()
    error.textContent = wizard?.message ?? ''
    heading.textContent = screen === 'home' ? 'Configura tu mando paso a paso' : title()
    if (screen === 'home') {
      text(
        'Elige un asistente. Detectamos los controles al moverlos; no necesitas conocer números de ejes ni botones.',
      )
      for (const [type, label] of [
        ['wheel', 'Volante y pedales'],
        ['joystick', 'Joystick / HOTAS para naves'],
        ['radio', 'Emisora para drones'],
      ] as const) {
        const card = doc.createElement('div')
        card.style.cssText =
          'padding:14px;margin:10px 0;border:1px solid #444;display:flex;gap:12px;align-items:center;flex-wrap:wrap'
        card.append(
          button('Configurar ' + label, () => {
            kind = type
            parts = new Set(
              type === 'wheel' ? ['pedals'] : type === 'joystick' ? ['throttle', 'yaw'] : [],
            )
            screen = 'parts'
          }),
        )
        const mode = type === 'wheel' ? 'road' : type === 'radio' ? 'drone' : 'flight'
        if (hub.snapshot.profiles[mode].bindings.length) {
          const saved = doc.createElement('span')
          saved.textContent = 'Perfil guardado'
          card.append(saved)
          if (mode !== 'road')
            card.append(
              button(
                hub.snapshot.activeFlightProfile === mode
                  ? 'Perfil de vuelo activo'
                  : 'Usar este perfil',
                () => {
                  const settings = hub.snapshot
                  settings.activeFlightProfile = mode
                  hub.configure(settings)
                },
              ),
            )
        }
        content.append(card)
      }
      return
    }
    if (screen === 'parts') {
      text('¿Qué piezas tienes? Pueden estar conectadas juntas o como dispositivos USB separados.')
      const options =
        kind === 'wheel'
          ? [
              ['pedals', 'Acelerador y freno'],
              ['clutch', 'Pedal de embrague'],
              ['gears', 'Levas o botones para cambiar marchas'],
              ['handbrake', 'Palanca de freno de mano analógica'],
              ['camera', 'Botón para cambiar cámara'],
            ]
          : kind === 'joystick'
            ? [
                ['throttle', 'Palanca de gases'],
                ['yaw', 'Giro del joystick o pedales de timón'],
                ['camera', 'Botón para cambiar cámara'],
              ]
            : [['camera', 'Botón para cambiar cámara']]
      for (const [id, label] of options) {
        const l = doc.createElement('label')
        l.style.cssText = 'display:block;margin:12px 0'
        const c = doc.createElement('input')
        c.type = 'checkbox'
        c.checked = parts.has(id)
        c.onchange = () => {
          if (c.checked) parts.add(id)
          else parts.delete(id)
        }
        l.append(c, ' ' + label)
        content.append(l)
      }
      if (kind === 'radio')
        text(
          'Recorreremos alabeo, cabeceo, giro y gases. Sirve con cualquier orden de canales y disposición de palancas.',
        )
      text(
        'Los ajustes actuales se conservan hasta que pulses «Guardar perfil». Los controles que no configures se mantienen.',
      )
      content.append(
        button('Empezar asistente', () => {
          wizard = new UsbWizard(kind, parts)
          wizard.sample(pads)
          screen = 'steps'
          hub.configuring = true
          hub.reset()
          if (feedback) {
            feedback.enabled = false
            feedback.stop()
          }
        }),
        button('Volver', () => {
          screen = 'home'
        }),
      )
      return
    }
    const w = wizard!
    if (w.stage === 'review') {
      text('Prueba de controles · mueve cada pieza y comprueba su respuesta.')
      for (const [i, b] of w.bindings.entries()) {
        const row = doc.createElement('div')
        row.style.cssText = 'padding:10px 0'
        const label = doc.createElement('label')
        label.textContent = Object.hasOwn(usbAxes, b.target)
          ? usbAxes[b.target as keyof typeof usbAxes]
          : inputBindings[b.target as keyof typeof inputBindings].label
        const meter = doc.createElement('progress')
        meter.max = 1
        meter.dataset.wizardPreview = String(i)
        meter.style.cssText = 'width:220px;margin:0 12px'
        const value = doc.createElement('span')
        value.dataset.wizardValue = String(i)
        row.append(label, meter, value)
        content.append(row)
      }
      content.append(
        button('Guardar perfil', () => {
          w.commit(hub)
          stop()
          screen = 'home'
          onSave()
        }),
        button('Repetir asistente', () => {
          wizard = new UsbWizard(kind, parts)
          wizard.sample(pads)
        }),
        button('Cancelar sin guardar', () => {
          stop()
          screen = 'home'
        }),
      )
    } else {
      text(`Control ${w.index + 1} de ${w.steps.length} · ${w.step.label}`)
      const instruction = text(w.instruction)
      instruction.style.cssText = 'font-size:24px;line-height:1.5;padding:12px 0'
      instruction.setAttribute('aria-live', 'polite')
      const detected = text('')
      detected.dataset.wizardDevice = ''
      content.append(
        button(
          w.stage === 'rest'
            ? 'Está en reposo'
            : w.stage === 'positive' || w.stage === 'negative'
              ? 'Está en el tope'
              : 'Está de nuevo en reposo',
          () => {
            w.next()
          },
        ),
        button('Repetir este control', () => w.repeat()),
        button('No tengo este control / omitir', () => w.skip()),
        button('Cancelar sin guardar', () => {
          stop()
          screen = 'home'
        }),
      )
    }
  }
  render()
  return {
    root,
    refresh: (current) => {
      pads = current
      wizard?.sample(pads)
      const key = JSON.stringify([
        screen,
        kind,
        wizard?.stage,
        wizard?.index,
        wizard?.message,
        hub.snapshot.activeFlightProfile,
      ])
      if (key !== last) render()
      const device = root.querySelector<HTMLElement>('[data-wizard-device]')
      if (device)
        device.textContent = wizard?.detectedDevice
          ? 'Detectado: ' + wizard.detectedDevice
          : 'Esperando el movimiento de este control…'
      if (wizard?.stage === 'review')
        for (const [i, b] of wizard.bindings.entries()) {
          const matches = pads.filter((p) => usbDeviceKey(p) === b.device),
            p = matches.length === 1 ? matches[0] : undefined
          const v = p ? readUsbBinding(p, b) : 0
          const meter = root.querySelector<HTMLProgressElement>(`[data-wizard-preview="${i}"]`),
            label = root.querySelector<HTMLElement>(`[data-wizard-value="${i}"]`)
          if (meter) meter.value = Math.abs(v)
          if (label)
            label.textContent = p
              ? `${v < 0 ? '−' : ''}${Math.round(Math.abs(v) * 100)} %`
              : 'Desconectado'
        }
    },
    dispose: () => {
      stop()
      root.remove()
    },
  }
}
