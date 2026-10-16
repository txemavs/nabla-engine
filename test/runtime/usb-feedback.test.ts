import { expect, it, vi } from 'vitest'
import {
  UsbFeedback,
  UsbForceBridge,
  type ForceFeedbackTransport,
} from '../../src/runtime/usb/feedback.js'
it('limits, smooths, rate-limits and immediately stops physics-derived force', () => {
  const feedback = new UsbFeedback(null),
    send = vi.fn(),
    stop = vi.fn(),
    dispose = vi.fn()
  feedback.transport = { ready: true, send, stop, dispose } satisfies ForceFeedbackTransport
  feedback.enabled = true
  feedback.update(
    { steeringTorqueNm: 100, suspensionLoad: 1, tireSlip: 0, grounded: true },
    [],
    true,
    0,
  )
  expect(send).toHaveBeenCalledTimes(1)
  expect(send.mock.calls[0][0]).toBeCloseTo(0.07)
  feedback.update(
    { steeringTorqueNm: 100, suspensionLoad: 1, tireSlip: 0, grounded: true },
    [],
    true,
    5,
  )
  expect(send).toHaveBeenCalledTimes(1)
  feedback.update(null, [], false, 10)
  expect(stop).toHaveBeenCalledTimes(1)
  feedback.update(
    { steeringTorqueNm: NaN, suspensionLoad: Infinity, tireSlip: NaN, grounded: false },
    [],
    true,
    50,
  )
  expect(send.mock.calls.at(-1)![0]).toBe(0)
  feedback.dispose()
  expect(dispose).toHaveBeenCalledTimes(1)
})
it('does not connect a force bridge to a remote host or accept missing credentials', () => {
  expect(() => new UsbForceBridge('ws://example.org:9876', 'token')).toThrow('local')
  expect(() => new UsbForceBridge('ws://127.0.0.1:9876', '')).toThrow('Token')
})
