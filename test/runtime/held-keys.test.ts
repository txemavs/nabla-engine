import { expect, it } from 'vitest'
import { HeldKeys } from '../../src/runtime/held-keys.js'

it('expires acceleration and steering when keyup is lost', () => {
  const keys = new HeldKeys()
  keys.press('KeyW', false, 0)
  keys.press('KeyD', false, 100)
  keys.expire(1700)
  expect([...keys.values]).toEqual([])
})
it('keeps a held control refreshed by repeats and releases immediately on keyup', () => {
  const keys = new HeldKeys()
  keys.press('KeyW', false, 0)
  keys.press('KeyW', true, 1000)
  keys.expire(1700)
  expect(keys.values.has('KeyW')).toBe(true)
  keys.release('KeyW')
  expect(keys.values.size).toBe(0)
})
it('ignores queued repeats after focus loss until a fresh press', () => {
  const keys = new HeldKeys()
  keys.press('KeyD', false, 0)
  keys.clear()
  keys.press('KeyD', true, 100)
  expect(keys.values.size).toBe(0)
  keys.press('KeyD', false, 200)
  expect(keys.values.has('KeyD')).toBe(true)
})
it('keeps W+D held when the operating system repeats only D', () => {
  const keys = new HeldKeys()
  keys.press('KeyW', false, 0)
  keys.press('KeyD', false, 100)
  keys.press('KeyD', true, 1400)
  keys.expire(2000)
  expect([...keys.values]).toEqual(['KeyW', 'KeyD'])
})
