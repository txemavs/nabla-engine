import { expect, it } from 'vitest'
import { defaultInterfaceStyles } from '../src/runtime/interface-style.js'

it('the default chrome uses the monochrome theme, not the old blue buttons', () => {
  expect(defaultInterfaceStyles).toContain('.nabla-btn {')
  expect(defaultInterfaceStyles).toContain('.touch-driving-knob')
  expect(defaultInterfaceStyles).not.toMatch(/#395e79|#142735|#c6e6ff/)
})

it('anchors every corner with the one shared margin variable', () => {
  for (const corner of ['tl', 'tr', 'bl', 'br'])
    expect(defaultInterfaceStyles).toContain(`.nabla-corner--${corner} {`)
  expect(
    defaultInterfaceStyles.match(/var\(--nabla-ui-margin\) \/ var\(--nabla-ui-scale\)/g)?.length,
  ).toBe(8)
})
