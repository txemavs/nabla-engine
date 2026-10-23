import { t } from '../../i18n/index.js'
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
  root.setAttribute('aria-label', t('usb.wizards'))
  let wizard: UsbWizard | null = null,
    kind: UsbWizardKind = 'wheel',
    screen: 'home' | 'parts' | 'steps' = 'home',
    last = ''
  let parts = new Set<string>(),
    pads: readonly UsbPad[] = []
  const title = () =>
    kind === 'wheel'
      ? t('usb.wizard.wheel')
      : kind === 'joystick'
        ? t('usb.wizard.joystick')
        : t('usb.wizard.radio')
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
    heading.textContent = screen === 'home' ? t('usb.wizard.heading') : title()
    if (screen === 'home') {
      text(
        t('usb.wizard.intro'),
      )
      for (const [type, label] of [
        ['wheel', t('usb.wizard.wheel')],
        ['joystick', t('usb.wizard.joystick')],
        ['radio', t('usb.wizard.radio')],
      ] as const) {
        const card = doc.createElement('div')
        card.className = 'nabla-usb-card'
        card.append(
          button(t('usb.wizard.configure', { name: label }), () => {
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
          saved.textContent = t('usb.wizard.saved')
          card.append(saved)
          if (mode !== 'road')
            card.append(
              button(
                hub.snapshot.activeFlightProfile === mode
                  ? t('usb.wizard.active-flight')
                  : t('usb.wizard.use-profile'),
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
      text(t('usb.wizard.parts'))
      const options =
        kind === 'wheel'
          ? [
              ['pedals', t('usb.part.pedals')],
              ['clutch', t('usb.part.clutch')],
              ['gears', t('usb.part.gears')],
              ['handbrake', t('usb.part.handbrake')],
              ['camera', t('usb.part.camera')],
            ]
          : kind === 'joystick'
            ? [
                ['throttle', t('usb.part.throttle')],
                ['yaw', t('usb.part.yaw')],
                ['camera', t('usb.part.camera')],
              ]
            : [['camera', t('usb.part.camera')]]
      for (const [id, label] of options) {
        const l = doc.createElement('label')
        l.className = 'nabla-usb-field'
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
          t('usb.wizard.radio-note'),
        )
      text(
        t('usb.wizard.keep-note'),
      )
      content.append(
        button(t('usb.wizard.start'), () => {
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
        button(t('usb.wizard.back'), () => {
          screen = 'home'
        }),
      )
      return
    }
    const w = wizard!
    if (w.stage === 'review') {
      text(t('usb.wizard.review'))
      for (const [i, b] of w.bindings.entries()) {
        const row = doc.createElement('div')
        row.className = 'nabla-usb-row'
        const label = doc.createElement('label')
        label.textContent = Object.hasOwn(usbAxes, b.target)
          ? usbAxes[b.target as keyof typeof usbAxes]
          : inputBindings[b.target as keyof typeof inputBindings].label
        const meter = doc.createElement('progress')
        meter.max = 1
        meter.dataset.wizardPreview = String(i)
        meter.className = 'nabla-usb-meter'
        const value = doc.createElement('span')
        value.dataset.wizardValue = String(i)
        row.append(label, meter, value)
        content.append(row)
      }
      content.append(
        button(t('usb.wizard.save'), () => {
          w.commit(hub)
          stop()
          screen = 'home'
          onSave()
        }),
        button(t('usb.wizard.repeat'), () => {
          wizard = new UsbWizard(kind, parts)
          wizard.sample(pads)
        }),
        button(t('usb.wizard.cancel'), () => {
          stop()
          screen = 'home'
        }),
      )
    } else {
      text(t('usb.wizard.step-of', { n: w.index + 1, total: w.steps.length, label: w.step.label }))
      const instruction = text(w.instruction)
      instruction.className = 'nabla-usb-instruction'
      instruction.setAttribute('aria-live', 'polite')
      const detected = text('')
      detected.dataset.wizardDevice = ''
      content.append(
        button(
          w.stage === 'rest'
            ? t('usb.wizard.at-rest')
            : w.stage === 'positive' || w.stage === 'negative'
              ? t('usb.wizard.at-limit')
              : t('usb.wizard.at-rest-again'),
          () => {
            w.next()
          },
        ),
        button(t('usb.wizard.repeat-control'), () => w.repeat()),
        button(t('usb.wizard.skip'), () => w.skip()),
        button(t('usb.wizard.cancel'), () => {
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
          ? t('usb.wizard.detected', { device: wizard.detectedDevice })
          : t('usb.wizard.waiting')
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
              : t('usb.disconnected')
        }
    },
    dispose: () => {
      stop()
      root.remove()
    },
  }
}
