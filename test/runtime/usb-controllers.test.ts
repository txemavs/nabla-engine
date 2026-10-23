import { describe, expect, it } from 'vitest'
import {
  UsbControllers,
  defaultUsbSettings,
  newUsbBinding,
  normalizeUsbAxis,
  usbDeviceKey,
  parseUsbSettings,
  usbTemplate,
  type UsbPad,
  type UsbBinding,
} from '../../src/runtime/usb/controllers.js'
type TestPad = Omit<UsbPad, 'axes' | 'buttons'> & { axes: number[]; buttons: GamepadButton[] }
const pad = (id = 'Logitech wheel', axes = [0, 1, 1], index = 0): TestPad => ({
  id,
  index,
  connected: true,
  mapping: '',
  axes,
  buttons: Array.from({ length: 12 }, () => ({ value: 0, pressed: false, touched: false })),
})
const input = (target: UsbBinding['target'], index = 0, device = pad()): UsbBinding =>
  newUsbBinding(usbDeviceKey(device), 'axis', index, target)
const context = { mode: 'road' as const }
function hub(...bindings: UsbBinding[]) {
  const hub = new UsbControllers(null),
    settings = defaultUsbSettings()
  settings.profiles.road.bindings = bindings
  hub.configure(settings)
  return hub
}
describe('USB calibration and validation', () => {
  it('normalizes asymmetric centres, dead bands and inverted resting pedals', () => {
    const wheel = {
      ...input('steering'),
      min: -0.8,
      center: 0.1,
      max: 0.9,
      deadzone: 0,
      saturation: 0,
    }
    expect(normalizeUsbAxis(-0.8, wheel)).toBe(-1)
    expect(normalizeUsbAxis(0.1, wheel)).toBe(0)
    expect(normalizeUsbAxis(0.5, wheel)).toBeCloseTo(0.5)
    const pedal = { ...input('throttle', 1), invert: true, deadzone: 0, saturation: 0 }
    expect(normalizeUsbAxis(1, pedal)).toBe(0)
    expect(normalizeUsbAxis(-1, pedal)).toBe(1)
    expect(normalizeUsbAxis(NaN, pedal)).toBe(0)
  })
  it('validates imported ranges and keeps active and stored profiles intact on failure', () => {
    const map = new Map<string, string>(),
      store = {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => {
          map.set(k, v)
        },
      }
    const h = new UsbControllers(store)
    h.configure(defaultUsbSettings())
    const before = h.export()
    const malformed = defaultUsbSettings()
    malformed.profiles.road.bindings = [{ ...input('steering'), min: 1, max: -1 }]
    expect(() => h.configure(malformed)).toThrow()
    expect(h.export()).toBe(before)
    expect(new UsbControllers(store).export()).toBe(before)
    expect(() => parseUsbSettings({ ...defaultUsbSettings(), version: 2 })).toThrow()
    expect(() => h.configure({ ...defaultUsbSettings(), unknown: true })).toThrow()
  })
  it('does not erase malformed stored profiles', () => {
    let writes = 0
    const h = new UsbControllers({
      getItem: () => '{bad',
      setItem: () => {
        writes++
      },
    })
    expect(h.error).toContain('Invalid')
    expect(writes).toBe(0)
  })
  it('uses raw index independently of transient connection index', () => {
    expect(usbDeviceKey(pad())).toBe(usbDeviceKey(pad('Logitech wheel', [0, 1, 1], 7)))
  })
})
describe('USB routing and lifecycle', () => {
  it('ignores unknown pads and requires resting controls after configure/focus/disconnect', () => {
    const p = pad(),
      h = hub({ ...input('throttle', 1), invert: true })
    p.axes = [0, -1, 1]
    expect(h.read([p], context, true).axes.throttle).toBeUndefined()
    p.axes = [0, 1, 1]
    h.read([p], context, true)
    p.axes = [0, -1, 1]
    expect(h.read([p], context, true).axes.throttle).toBe(1)
    h.read([p], context, false)
    expect(h.read([p], context, true).axes.throttle).toBeUndefined()
    h.read([], context, true)
    p.axes = [0, 1, 1]
    h.read([p], context, true)
    p.axes = [0, -1, 1]
    expect(h.read([p], context, true).axes.throttle).toBe(1)
    expect(new UsbControllers(null).read([p], context, true).axes).toEqual({})
  })
  it('merges steering and independent pedals without adding duplicate accelerators', () => {
    const wheel = pad(),
      pedals = pad('USB pedals', [1, 1], 1)
    const h = hub(
      input('steering'),
      { ...input('throttle', 0, pedals), invert: true },
      { ...input('brake', 1, pedals), invert: true },
    )
    h.read([wheel, pedals], context, true)
    wheel.axes = [0.5, 1, 1]
    pedals.axes = [-1, -0.5]
    const frame = h.read([wheel, pedals], context, true)
    expect(frame.axes.steering).toBeGreaterThan(0.4)
    expect(frame.axes.throttle).toBe(1)
    expect(frame.axes.brake).toBeGreaterThan(0.7)
  })
  it('stops ambiguous identical devices instead of choosing one silently', () => {
    const h = hub(input('steering')),
      a = pad(),
      b = pad('Logitech wheel', [0, 1, 1], 1)
    h.read([a, b], context, true)
    a.axes = [1, 1, 1]
    expect(h.read([a, b], context, true).axes).toEqual({})
  })
  it('emits action edges once, only in their declared context, and understands keyless H gears', () => {
    const p = pad(),
      binding = newUsbBinding(usbDeviceKey(p), 'button', 0, 'gear.select2'),
      h = hub(binding)
    expect(h.read([p], context, true).selectedGear).toBe(0)
    p.buttons[0] = { value: 1, pressed: true, touched: true }
    expect(h.read([p], context, true).selectedGear).toBe(2)
    p.buttons[0] = { value: 0, pressed: false, touched: false }
    expect(h.read([p], context, true).selectedGear).toBe(0)
    const c = hub(newUsbBinding(usbDeviceKey(p), 'button', 0, 'camera'))
    c.read([p], context, true)
    p.buttons[0] = { value: 1, pressed: true, touched: true }
    expect(c.read([p], context, true).pressed).toEqual(['camera'])
    expect(c.read([p], context, true).pressed).toEqual([])
    expect(c.read([p], { mode: 'road', menu: true }, true).pressed).toEqual([])
  })
  it('supports discrete POV axes and separate flight profiles with absolute throttle', () => {
    const p = pad('HOTAS', [0, 0, -1, 1]),
      h = new UsbControllers(null),
      settings = defaultUsbSettings()
    settings.profiles.flight.bindings = [
      newUsbBinding(usbDeviceKey(p), 'axis', 2, 'flightThrottle'),
      { ...newUsbBinding(usbDeviceKey(p), 'hat', 3, 'camera'), hatValue: -1 },
    ]
    h.configure(settings)
    h.read([p], { mode: 'flight' }, true)
    p.axes = [0, 0, 0.6, -1]
    expect(h.read([p], { mode: 'flight' }, true).axes.flightThrottle).toBeGreaterThan(0.75)
    expect(h.read([p], { mode: 'flight' }, true).axes.flightThrottle).toBeGreaterThan(0.75)
    expect(h.read([p], context, true).axes).toEqual({})
  })
  it('ships explicit templates without treating them as validated hardware mappings', () => {
    expect(usbTemplate('wheel', 'device')).toHaveLength(3)
    expect(usbTemplate('AETR', 'device')[2].target).toBe('flightThrottle')
    expect(usbTemplate('TAER', 'device')[0].target).toBe('flightThrottle')
  })
})
