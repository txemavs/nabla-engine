import { expect, it } from 'vitest'
import { arMode } from '../../game/ar-mode.js'

it('recognizes Quest before Android and keeps unknown devices selectable', () => {
  expect(arMode('', 'Android OculusBrowser Quest')).toBe('headset')
  expect(arMode('', 'Android Chrome Mobile')).toBe('mobile')
  expect(arMode('', 'Windows Chrome')).toBe('headset')
})
it('honors either explicit choice independently of browser hints', () => {
  expect(arMode('?arMode=headset', 'Android Mobile')).toBe('headset')
  expect(arMode('?arMode=mobile', 'Quest')).toBe('mobile')
})
