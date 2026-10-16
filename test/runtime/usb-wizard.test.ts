import { expect, it } from 'vitest'
import { UsbWizard } from '../../src/runtime/usb/wizard.js'
import {
  UsbControllers,
  defaultUsbSettings,
  normalizeUsbAxis,
  parseUsbSettings,
  type UsbPad,
} from '../../src/runtime/usb/controllers.js'
type Pad = Omit<UsbPad, 'axes' | 'buttons'> & { axes: number[]; buttons: GamepadButton[] }
const pad = (id = 'wheel', axes = [0, 1, 1]): Pad => ({
  id,
  axes,
  buttons: [],
  index: 0,
  connected: true,
  mapping: '',
})
function capture(
  w: UsbWizard,
  p: Pad,
  index: number,
  positive: number,
  negative?: number,
  all: Pad[] = [p],
) {
  const rest = p.axes[index]
  w.sample(all)
  w.next()
  p.axes[index] = positive
  for (let i = 0; i < 4; i++) w.sample(all)
  w.next()
  if (negative !== undefined) {
    p.axes[index] = negative
    w.sample(all)
    w.next()
  }
  p.axes[index] = rest
  w.sample(all)
  w.next()
}
it('calibrates a wheel and inverted independent pedals while preserving existing profiles until commit', () => {
  const h = new UsbControllers(null),
    settings = defaultUsbSettings()
  settings.profiles.flight.name = 'My HOTAS'
  h.configure(settings)
  const original = h.export()
  const p = pad(),
    w = new UsbWizard('wheel', new Set(['pedals']))
  capture(w, p, 0, 0.9, -0.8)
  capture(w, p, 1, -1)
  capture(w, p, 2, -0.7)
  expect(h.export()).toBe(original)
  expect(w.stage).toBe('review')
  expect(w.bindings).toHaveLength(3)
  const throttle = w.bindings[1]
  expect(normalizeUsbAxis(1, throttle)).toBe(0)
  expect(normalizeUsbAxis(-1, throttle)).toBe(1)
  w.commit(h)
  expect(h.snapshot.profiles.road.bindings).toHaveLength(3)
  expect(h.snapshot.profiles.flight.name).toBe('My HOTAS')
})
it('infers signed inversion from the requested direction, accepts separate pedals and refuses incomplete ranges', () => {
  const w = new UsbWizard('wheel', new Set(['pedals'])),
    p = pad(),
    pedals = pad('pedals', [1, 1])
  capture(w, p, 0, -1, 1, [p, pedals])
  expect(w.bindings[0].invert).toBe(true)
  expect(normalizeUsbAxis(-1, w.bindings[0])).toBe(1)
  capture(w, pedals, 0, -1, undefined, [p, pedals])
  expect(w.bindings[1].device).toContain('pedals')
  const bad = new UsbWizard('wheel', new Set())
  bad.sample([p])
  bad.next()
  p.axes[0] = 1
  for (let i = 0; i < 4; i++) bad.sample([p])
  bad.next()
  expect(() => bad.next()).toThrow('otro lado')
})
it('does not select drifting or ambiguous axes and cancels without altering the controller settings', () => {
  const p = pad(),
    w = new UsbWizard('wheel', new Set())
  w.sample([p])
  w.next()
  p.axes = [0.05, 1, 1]
  for (let i = 0; i < 4; i++) w.sample([p])
  expect(w.detectedDevice).toBe('')
  p.axes = [0.5, 0.5, 1]
  for (let i = 0; i < 4; i++) w.sample([p])
  expect(w.detectedDevice).toBe('')
  expect(w.message).toContain('varios')
  w.repeat()
  expect(w.stage).toBe('rest')
  expect(() => w.commit(new UsbControllers(null))).toThrow()
})
it('separates radio and HOTAS profiles and reads the selected flight profile', () => {
  const p = pad('radio', [0, 0, 0, -1]),
    h = new UsbControllers(null),
    w = new UsbWizard('radio', new Set())
  capture(w, p, 0, 1, -1)
  capture(w, p, 1, -1, 1)
  capture(w, p, 2, 1, -1)
  capture(w, p, 3, 1)
  w.commit(h)
  expect(h.snapshot.activeFlightProfile).toBe('drone')
  expect(h.snapshot.profiles.flight.bindings).toHaveLength(0)
  h.read([p], { mode: 'flight' }, true)
  p.axes[3] = 1
  expect(h.read([p], { mode: 'flight' }, true).axes.flightThrottle).toBe(1)
  h.configuring = true
  expect(h.read([p], { mode: 'flight' }, true).axes).toEqual({})
})
it('loads saved version-one profiles without erasing the working wheel configuration', () => {
  const settings = defaultUsbSettings(),
    old = {
      version: 1,
      profiles: { road: settings.profiles.road, flight: settings.profiles.flight },
    }
  const loaded = parseUsbSettings(old)
  expect(loaded.activeFlightProfile).toBe('flight')
  expect(loaded.profiles.drone.bindings).toEqual([])
})
