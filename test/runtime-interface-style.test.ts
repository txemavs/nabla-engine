import { expect, it } from 'vitest'
import { defaultInterfaceStyles } from '../src/runtime/interface-style.js'

it('the default chrome uses the monochrome theme, not the old blue buttons', () => {
  expect(defaultInterfaceStyles).toContain('.game-toolbar button')
  expect(defaultInterfaceStyles).toContain('.touch-driving-knob')
  expect(defaultInterfaceStyles).not.toMatch(/#395e79|#142735|#c6e6ff/)
})
