import { expect, test } from 'vitest'
import { FrameLoop } from './frame-loop.js'
import { StudioInputOwner } from './input-owner.js'

test('nested desktop interactions release gameplay and cannot re-enable an inactive view', () => {
  let released = 0
  const input = new StudioInputOwner(() => released++)
  input.beginInteraction()
  input.beginInteraction()
  input.endInteraction()
  expect(input.acceptsInput).toBe(false)
  input.setActive(false)
  input.endInteraction()
  expect(input.acceptsInput).toBe(false)
  input.setActive(true)
  expect(input.acceptsInput).toBe(true)
  input.setVisible(false)
  expect(input.acceptsInput).toBe(false)
  expect(released).toBeGreaterThan(0)
})

test('starting twice schedules one frame, stopping during a frame does not restart it', () => {
  const queue = new Map<number, FrameRequestCallback>()
  let serial = 0
  const loop = new FrameLoop(
    () => loop.stop(),
    (fn) => {
      queue.set(++serial, fn)
      return serial
    },
    (id) => {
      queue.delete(id)
    },
  )
  loop.start()
  loop.start()
  expect(queue.size).toBe(1)
  const callback = queue.get(serial)!
  queue.delete(serial)
  callback(16)
  expect(queue.size).toBe(0)
  loop.start()
  expect(queue.size).toBe(1)
  loop.stop()
  expect(queue.size).toBe(0)
})
