import { expect, it, vi } from 'vitest'
import { ReverseAlarm } from '../../src/audio/reverse-alarm.js'
import { reverseAlarmDefaults } from '../../src/config/audio.js'

it('beeps on activation, reuses nodes, repeats and cancels on deactivation', () => {
  const gain = {
    value: 0,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
  }
  const context = {
    destination: {},
    createGain: vi.fn(() => ({ gain, connect: vi.fn() })),
    createOscillator: vi.fn(() => ({
      type: '',
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
    })),
  }
  const alarm = new ReverseAlarm(context as unknown as AudioContext)
  alarm.update(0, false)
  expect(gain.linearRampToValueAtTime).not.toHaveBeenCalled()
  alarm.update(1, true)
  expect(gain.linearRampToValueAtTime).toHaveBeenCalledWith(reverseAlarmDefaults.gain, 1.015)
  const count = gain.linearRampToValueAtTime.mock.calls.length
  alarm.update(1.1, true)
  expect(gain.linearRampToValueAtTime).toHaveBeenCalledTimes(count)
  alarm.update(2, true)
  expect(gain.linearRampToValueAtTime).toHaveBeenCalledTimes(count + 2)
  alarm.silence(2.1)
  expect(gain.cancelScheduledValues).toHaveBeenLastCalledWith(2.1)
  expect(gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 2.1, reverseAlarmDefaults.rampSeconds)
  alarm.update(2.2, true)
  expect(gain.linearRampToValueAtTime).toHaveBeenCalledTimes(count + 4)
  expect(context.createOscillator).toHaveBeenCalledTimes(1)
})
