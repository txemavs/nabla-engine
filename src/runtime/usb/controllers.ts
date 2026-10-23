import { t } from '../../i18n/index.js'
import { z } from 'zod'
import {
  inputActionAvailable,
  inputBindings,
  type InputAction,
  type InputContext,
} from '../../config/input-bindings.js'

export const usbAxes = {
  steering: t('usb.axis.steering'),
  throttle: t('usb.axis.throttle'),
  reverse: t('usb.axis.reverse'),
  brake: t('usb.axis.brake'),
  clutch: t('usb.axis.clutch'),
  handbrake: t('usb.axis.handbrake'),
  pitch: t('usb.axis.pitch'),
  roll: t('usb.axis.roll'),
  yaw: t('usb.axis.yaw'),
  flightThrottle: t('usb.axis.flight-throttle'),
  lift: t('usb.axis.lift'),
  hydraulicLift: t('usb.axis.hydraulic-lift'),
  hydraulicTilt: t('usb.axis.hydraulic-tilt'),
  hydraulicSide: t('usb.axis.hydraulic-side'),
} as const
export type UsbAxis = keyof typeof usbAxes
export type UsbMode = 'road' | 'flight' | 'drone'
export type UsbPad = Pick<Gamepad, 'id' | 'index' | 'connected' | 'mapping' | 'axes' | 'buttons'>
export const usbStorageKey = 'nabla.usb.controllers.v1'
const finite = z.number().finite()
const actionNames = Object.keys(inputBindings) as [InputAction, ...InputAction[]]
const axisNames = Object.keys(usbAxes) as [UsbAxis, ...UsbAxis[]]
const bindingSchema = z
  .object({
    device: z.string().min(1).max(1024),
    kind: z.enum(['axis', 'button', 'hat']),
    index: z.number().int().min(0).max(127),
    target: z.union([z.enum(axisNames), z.enum(actionNames)]),
    min: finite.min(-1).max(1),
    center: finite.min(-1).max(1),
    max: finite.min(-1).max(1),
    mode: z.enum(['signed', 'positive', 'negative']),
    invert: z.boolean(),
    deadzone: finite.min(0).max(0.5),
    saturation: finite.min(0).max(0.4),
    exponent: finite.min(0.25).max(4),
    hatValue: finite.min(-1).max(1).optional(),
  })
  .strict()
  .refine(
    (b) =>
      b.min < b.max &&
      b.center >= b.min &&
      b.center <= b.max &&
      (b.mode !== 'signed' || (b.center > b.min && b.center < b.max)) &&
      (b.kind !== 'hat' || b.hatValue !== undefined),
    t('usb.err.range'),
  )
export type UsbBinding = z.infer<typeof bindingSchema>
const profileSchema = z
  .object({
    name: z.string().min(1).max(80),
    wheelDegrees: finite.min(90).max(2520).optional(),
    steeringDegrees: finite.min(90).max(2520).optional(),
    bindings: z.array(bindingSchema).max(128),
  })
  .strict()
const settingsSchema = z
  .object({
    version: z.literal(1),
    activeFlightProfile: z.enum(['flight', 'drone']).default('flight'),
    profiles: z
      .object({
        road: profileSchema,
        flight: profileSchema,
        drone: profileSchema.default({ name: 'Emisora', bindings: [] }),
      })
      .strict(),
  })
  .strict()
export type UsbSettings = z.infer<typeof settingsSchema>
export interface UsbStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}
export interface UsbFrame {
  axes: Partial<Record<UsbAxis, number>>
  held: ReadonlySet<InputAction>
  selectedGear?: number
  pressed: InputAction[]
}
export const idleUsbFrame = (): UsbFrame => ({ axes: {}, held: new Set(), pressed: [] })
export function usbDeviceKey(pad: UsbPad): string {
  // No transient Gamepad.index: ports can be renumbered after reconnecting.
  return JSON.stringify([pad.id, pad.axes.length, pad.buttons.length])
}
export function browserUsbStorage(): UsbStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
export function defaultUsbSettings(): UsbSettings {
  return {
    version: 1,
    activeFlightProfile: 'flight',
    profiles: {
      drone: { name: 'Emisora', bindings: [] },
      road: { name: t('usb.profile.road'), bindings: [] },
      flight: { name: 'Vuelo', bindings: [] },
    },
  }
}
export function parseUsbSettings(value: unknown): UsbSettings {
  return settingsSchema.parse(value)
}
export function normalizeUsbAxis(raw: number, binding: UsbBinding): number {
  if (!Number.isFinite(raw)) return 0
  const { min, center, max, mode, invert, deadzone, saturation, exponent } = binding
  let value =
    mode === 'positive'
      ? (raw - min) / (max - min)
      : mode === 'negative'
        ? (max - raw) / (max - min)
        : raw >= center
          ? (raw - center) / (max - center)
          : (raw - center) / (center - min)
  if (invert) value = mode === 'signed' ? -value : 1 - value
  value = mode === 'signed' ? Math.max(-1, Math.min(1, value)) : Math.max(0, Math.min(1, value))
  const share = Math.min(1, Math.max(0, (Math.abs(value) - deadzone) / (1 - deadzone - saturation)))
  return Math.sign(value) * share ** exponent
}
export function readUsbBinding(pad: UsbPad, binding: UsbBinding): number {
  const value =
    binding.kind === 'button' ? pad.buttons[binding.index]?.value : pad.axes[binding.index]
  if (value === undefined || !Number.isFinite(value)) return 0
  if (binding.kind === 'hat') return Math.abs(value - binding.hatValue!) < 0.05 ? 1 : 0
  return normalizeUsbAxis(value, binding)
}
export const signedUsbAxes = new Set<UsbAxis>([
  'steering',
  'pitch',
  'roll',
  'yaw',
  'lift',
  'hydraulicLift',
  'hydraulicTilt',
  'hydraulicSide',
])
export function newUsbBinding(
  device: string,
  kind: UsbBinding['kind'],
  index: number,
  target: UsbBinding['target'],
): UsbBinding {
  const signed = signedUsbAxes.has(target as UsbAxis) && kind === 'axis'
  return {
    device,
    kind,
    index,
    target,
    min: kind === 'button' ? 0 : -1,
    center: 0,
    max: 1,
    mode: signed ? 'signed' : 'positive',
    invert: false,
    deadzone: signed ? 0.02 : 0.01,
    saturation: 0.01,
    exponent: 1,
  }
}
/** Owns per-device mapping, edges and neutral rearming; never owns physics. */
export class UsbControllers {
  private settings = defaultUsbSettings()
  configuring = false
  private armed = new Set<number>()
  private previous = new Set<number>()
  private connection = ''
  private mode: UsbMode | null = null
  private contextMode = ''
  error = ''
  constructor(private storage: UsbStorage | null = browserUsbStorage()) {
    try {
      const raw = storage?.getItem(usbStorageKey)
      if (raw) this.settings = parseUsbSettings(JSON.parse(raw))
    } catch {
      this.error = t('usb.err.profile')
    }
  }
  get snapshot(): UsbSettings {
    return structuredClone(this.settings)
  }
  export(): string {
    return JSON.stringify(this.settings, null, 2)
  }
  configure(value: unknown): void {
    const next = parseUsbSettings(value)
    // Check serialization/storage before replacing the active configuration.
    this.storage?.setItem(usbStorageKey, JSON.stringify(next))
    this.settings = structuredClone(next)
    this.error = ''
    this.reset()
  }
  reset(): void {
    this.armed.clear()
    this.previous.clear()
    this.connection = ''
    this.mode = null
  }
  mappedDevices(mode: UsbMode): ReadonlySet<string> {
    const profile = mode === 'flight' ? this.settings.activeFlightProfile : mode
    return new Set(this.settings.profiles[profile].bindings.map((b) => b.device))
  }
  read(pads: readonly (UsbPad | null)[], context: InputContext, enabled: boolean): UsbFrame {
    const mode: UsbMode = context.mode === 'flight' ? this.settings.activeFlightProfile : 'road'
    if (this.configuring) {
      this.reset()
      return idleUsbFrame()
    }
    if (!this.settings.profiles[mode].bindings.length) {
      this.reset()
      return idleUsbFrame()
    }
    const connected = pads.filter((p): p is UsbPad => !!p?.connected)
    // Identical devices need explicit reassociation: never silently use the wrong pedals.
    const byKey = new Map<string, UsbPad[]>()
    for (const pad of connected) {
      const key = usbDeviceKey(pad)
      byKey.set(key, [...(byKey.get(key) ?? []), pad])
    }
    const connection = JSON.stringify(connected.map((p) => [p.index, usbDeviceKey(p)]))
    if (!enabled || context.menu) {
      this.reset()
      return idleUsbFrame()
    }
    if (connection !== this.connection || mode !== this.mode || context.mode !== this.contextMode)
      this.reset()
    this.connection = connection
    this.mode = mode
    this.contextMode = context.mode
    const frame = idleUsbFrame(),
      held = new Set<InputAction>()
    const allowed = new Set(actionNames.filter((action) => inputActionAvailable(action, context)))
    this.settings.profiles[mode].bindings.forEach((binding, i) => {
      const devices = byKey.get(binding.device)
      if (devices?.length !== 1) {
        this.armed.delete(i)
        this.previous.delete(i)
        return
      }
      const value = readUsbBinding(devices[0], binding)
      if (Math.abs(value) < 0.05) this.armed.add(i)
      if (!this.armed.has(i)) return
      if (Object.hasOwn(usbAxes, binding.target)) {
        if (context.mode === 'walk' || context.mode === 'viewer') return
        const target = binding.target as UsbAxis
        const clamped = signedUsbAxes.has(target) ? value : Math.max(0, value)
        // Strongest source wins; pedals on separate devices never add together.
        if (Math.abs(clamped) >= Math.abs(frame.axes[target] ?? 0)) frame.axes[target] = clamped
      } else if (allowed.has(binding.target as InputAction)) {
        const target = binding.target as InputAction
        if (value > 0.5) {
          held.add(target)
          if (!this.previous.has(i) && inputBindings[target].kind === 'press')
            frame.pressed.push(target)
          this.previous.add(i)
        } else this.previous.delete(i)
      }
    })
    const profile = this.settings.profiles[mode]
    if (frame.axes.steering !== undefined)
      frame.axes.steering = Math.max(
        -1,
        Math.min(
          1,
          (frame.axes.steering * (profile.wheelDegrees ?? 900)) / (profile.steeringDegrees ?? 900),
        ),
      )
    const hPattern = this.settings.profiles[mode].bindings.some(
      (b, i) => b.target.startsWith('gear.select') && this.armed.has(i),
    )
    if (hPattern) {
      frame.selectedGear = 0
      for (const action of held)
        if (action.startsWith('gear.select')) {
          const value = action.slice('gear.select'.length)
          frame.selectedGear = value === 'R' ? -1 : value === 'N' ? 0 : Number(value)
        }
      frame.pressed = frame.pressed.filter((action) => !action.startsWith('gear.select'))
    }
    frame.held = held
    frame.pressed = [...new Set(frame.pressed)]
    return frame
  }
}

/** Starting points only: always calibrate against the actual OS/browser device report. */
export function usbTemplate(
  name: 'wheel' | 'hotas' | 'AETR' | 'TAER',
  device: string,
): UsbBinding[] {
  if (name === 'wheel')
    return [
      newUsbBinding(device, 'axis', 0, 'steering'),
      { ...newUsbBinding(device, 'axis', 1, 'throttle'), invert: true },
      { ...newUsbBinding(device, 'axis', 2, 'brake'), invert: true },
    ]
  if (name === 'hotas')
    return [
      newUsbBinding(device, 'axis', 0, 'roll'),
      newUsbBinding(device, 'axis', 1, 'pitch'),
      newUsbBinding(device, 'axis', 2, 'yaw'),
      { ...newUsbBinding(device, 'axis', 3, 'flightThrottle'), invert: true },
    ]
  const targets: UsbAxis[] =
    name === 'AETR'
      ? ['roll', 'pitch', 'flightThrottle', 'yaw']
      : ['flightThrottle', 'roll', 'pitch', 'yaw']
  return targets.map((target, index) => newUsbBinding(device, 'axis', index, target))
}
