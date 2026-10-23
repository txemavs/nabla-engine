import { t } from '../../i18n/index.js'
import {
  newUsbBinding,
  normalizeUsbAxis,
  usbDeviceKey,
  type UsbBinding,
  type UsbControllers,
  type UsbMode,
  type UsbPad,
} from './controllers.js'
export type UsbWizardKind = 'wheel' | 'joystick' | 'radio'
export interface UsbWizardStep {
  target: UsbBinding['target']
  label: string
  positive: string
  negative?: string
  button?: boolean
}
export function usbWizardSteps(kind: UsbWizardKind, parts: ReadonlySet<string>): UsbWizardStep[] {
  const camera: UsbWizardStep = {
    target: 'camera',
    label: t('usb.step.camera'),
    positive: t('usb.step.camera.press'),
    button: true,
  }
  if (kind === 'wheel')
    return [
      {
        target: 'steering',
        label: t('usb.step.wheel'),
        positive: t('usb.step.wheel.pos'),
        negative: t('usb.step.wheel.neg'),
      },
      ...(parts.has('pedals')
        ? [
            {
              target: 'throttle' as const,
              label: t('usb.axis.throttle'),
              positive: t('usb.step.throttle.pos'),
            },
            {
              target: 'brake' as const,
              label: t('usb.axis.brake'),
              positive: t('usb.step.brake.pos'),
            },
          ]
        : []),
      ...(parts.has('clutch')
        ? [
            {
              target: 'clutch' as const,
              label: t('usb.axis.clutch'),
              positive: t('usb.step.clutch.pos'),
            },
          ]
        : []),
      ...(parts.has('gears')
        ? [
            {
              target: 'gear.up' as const,
              label: t('usb.step.gear-up'),
              positive: t('usb.step.gear-up.pos'),
              button: true,
            },
            {
              target: 'gear.down' as const,
              label: t('usb.step.gear-down'),
              positive: t('usb.step.gear-down.pos'),
              button: true,
            },
          ]
        : []),
      ...(parts.has('handbrake')
        ? [
            {
              target: 'handbrake' as const,
              label: t('usb.axis.handbrake'),
              positive: t('usb.step.handbrake.pos'),
            },
          ]
        : []),
      ...(parts.has('camera') ? [camera] : []),
    ]
  return [
    {
      target: 'roll',
      label: t('usb.axis.roll'),
      positive: t('usb.step.roll.pos'),
      negative: t('usb.step.roll.neg'),
    },
    {
      target: 'pitch',
      label: t('usb.axis.pitch'),
      positive: t('usb.step.pitch.pos'),
      negative: t('usb.step.pitch.neg'),
    },
    ...(kind === 'radio' || parts.has('yaw')
      ? [
          {
            target: 'yaw' as const,
            label: t('usb.step.yaw'),
            positive: t('usb.step.yaw.pos'),
            negative: t('usb.step.yaw.neg'),
          },
        ]
      : []),
    ...(kind === 'radio' || parts.has('throttle')
      ? [
          {
            target: 'flightThrottle' as const,
            label: t('usb.step.throttle-lever'),
            positive: t('usb.step.throttle-lever.pos'),
          },
        ]
      : []),
    ...(parts.has('camera') ? [camera] : []),
  ]
}
type Snapshot = { key: string; index: number; axes: number[]; buttons: number[] }
type Detected = {
  device: string
  index: number
  kind: 'axis' | 'button'
  rest: number
  positive: number
  min: number
  max: number
}
/** Staged calibration. Nothing touches saved bindings until the final explicit commit. */
export class UsbWizard {
  readonly mode: UsbMode
  readonly steps: UsbWizardStep[]
  readonly bindings: UsbBinding[] = []
  index = 0
  stage: 'rest' | 'positive' | 'negative' | 'return' | 'review' = 'rest'
  message = ''
  private baseline: Snapshot[] = []
  private detected: Detected | null = null
  private candidate = ''
  private stable = 0
  private pads: readonly UsbPad[] = []
  constructor(
    readonly kind: UsbWizardKind,
    parts: ReadonlySet<string>,
  ) {
    this.mode = kind === 'wheel' ? 'road' : kind === 'radio' ? 'drone' : 'flight'
    this.steps = usbWizardSteps(kind, parts)
  }
  get step(): UsbWizardStep {
    return this.steps[this.index]
  }
  get detectedDevice(): string {
    if (!this.detected) return ''
    try {
      return JSON.parse(this.detected.device)[0]
    } catch {
      return this.detected.device
    }
  }
  get value(): number {
    const d = this.detected,
      p = this.device()
    if (!d || !p) return 0
    const raw = d.kind === 'axis' ? p.axes[d.index] : p.buttons[d.index]?.value
    return Number.isFinite(raw) ? raw! : 0
  }
  get preview(): number {
    const b = this.build()
    return b ? normalizeUsbAxis(this.value, b) : 0
  }
  get instruction(): string {
    if (this.stage === 'review') return t('usb.step.review')
    if (this.stage === 'rest')
      return this.step.negative ? t('usb.step.rest-centred') : t('usb.step.rest-released')
    if (this.stage === 'positive') return this.step.positive
    if (this.stage === 'negative') return this.step.negative!
    return this.step.negative ? t('usb.step.return-centre') : t('usb.step.return-release')
  }
  sample(pads: readonly UsbPad[]): void {
    this.pads = pads.filter((p) => p.connected)
    if (this.stage === 'rest' || this.stage === 'review') return
    if (this.detected) {
      const p = this.device()
      if (!p) {
        this.message = t('usb.err.lost')
        return
      }
      const v = this.value
      this.detected.min = Math.min(this.detected.min, v)
      this.detected.max = Math.max(this.detected.max, v)
      if (
        this.stage === 'positive' &&
        Math.abs(v - this.detected.rest) > Math.abs(this.detected.positive - this.detected.rest)
      )
        this.detected.positive = v
      return
    }
    const candidates: { score: number; detected: Detected; key: string }[] = []
    for (const p of this.pads) {
      const key = usbDeviceKey(p),
        base = this.baseline.find((b) => b.key === key)
      if (!base || this.pads.filter((q) => usbDeviceKey(q) === key).length !== 1) continue
      const entries = this.step.button ? p.buttons.map((b) => b.value) : p.axes
      entries.forEach((v, i) => {
        const rest = this.step.button ? base.buttons[i] : base.axes[i]
        if (!Number.isFinite(v) || !Number.isFinite(rest) || v < -1 || v > 1) return
        const score = Math.abs(v - rest)
        if (score < 0.25) return
        candidates.push({
          score,
          key: `${key}/${i}`,
          detected: {
            device: key,
            index: i,
            kind: this.step.button ? 'button' : 'axis',
            rest,
            positive: v,
            min: Math.min(rest, v),
            max: Math.max(rest, v),
          },
        })
      })
    }
    candidates.sort((a, b) => b.score - a.score)
    const first = candidates[0]
    if (!first) return
    if (candidates[1] && candidates[1].score > first.score * 0.85) {
      this.message =
        'Se mueven varios ejes a la vez. Mueve solo este control; si es un pedal combinado, haz un pedal cada vez.'
      this.stable = 0
      return
    }
    this.message = ''
    this.stable = first.key === this.candidate ? this.stable + 1 : 1
    this.candidate = first.key
    if (this.stable >= 3) this.detected = first.detected
  }
  next(): void {
    this.message = ''
    if (this.stage === 'review') return
    if (this.stage === 'rest') {
      if (!this.pads.length) throw new Error(t('usb.err.no-devices'))
      this.baseline = this.pads.map((p) => ({
        key: usbDeviceKey(p),
        index: p.index,
        axes: [...p.axes],
        buttons: p.buttons.map((b) => b.value),
      }))
      this.stage = 'positive'
      return
    }
    if (!this.detected || !this.device()) throw new Error(t('usb.err.hold'))
    const d = this.detected
    if (this.stage === 'positive') {
      if (Math.abs(d.positive - d.rest) < 0.2)
        throw new Error('No se ha detectado recorrido suficiente. Repite este paso.')
      this.stage = this.step.negative ? 'negative' : 'return'
      return
    }
    if (this.stage === 'negative') {
      if (d.rest - d.min < 0.1 || d.max - d.rest < 0.1)
        throw new Error('Falta recorrer el otro lado del control.')
      this.stage = 'return'
      return
    }
    if (Math.abs(this.value - d.rest) > Math.max(0.05, (d.max - d.min) * 0.12))
      throw new Error('Devuelve el control al reposo antes de continuar.')
    const binding = this.build()
    if (!binding) throw new Error(t('usb.err.incomplete'))
    if (
      this.bindings.some(
        (b) =>
          b.device === binding.device &&
          b.kind === binding.kind &&
          b.index === binding.index &&
          b.mode === 'signed' &&
          binding.mode === 'signed',
      )
    )
      throw new Error(t('usb.err.taken'))
    this.bindings.push(binding)
    this.advance()
  }
  repeat(): void {
    this.detected = null
    this.stable = 0
    this.candidate = ''
    this.stage = 'rest'
    this.message = ''
  }
  skip(): void {
    if (this.stage !== 'review') this.advance()
  }
  private advance(): void {
    this.index++
    this.repeat()
    if (this.index === this.steps.length) this.stage = 'review'
  }
  private device(): UsbPad | undefined {
    const list = this.pads.filter((p) => usbDeviceKey(p) === this.detected?.device)
    return list.length === 1 ? list[0] : undefined
  }
  private build(): UsbBinding | null {
    const d = this.detected
    if (!d) return null
    const b = newUsbBinding(d.device, d.kind, d.index, this.step.target)
    b.min = d.min
    b.max = d.max
    b.center = this.step.negative ? d.rest : (d.min + d.max) / 2
    b.invert = this.step.negative ? d.positive < d.rest : d.rest > d.positive
    return b
  }
  commit(hub: UsbControllers): void {
    if (this.stage !== 'review' || !this.bindings.length)
      throw new Error('Completa al menos un control antes de guardar.')
    const settings = hub.snapshot,
      targets = new Set(this.bindings.map((b) => b.target))
    settings.profiles[this.mode].bindings = [
      ...settings.profiles[this.mode].bindings.filter((b) => !targets.has(b.target)),
      ...this.bindings,
    ]
    if (this.mode !== 'road') settings.activeFlightProfile = this.mode
    hub.configure(settings)
  }
}
