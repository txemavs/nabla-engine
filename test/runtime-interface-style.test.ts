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
  expect(defaultInterfaceStyles.match(/:var\(--nabla-ui-margin\)/g)?.length).toBe(8)
})

it('keeps one clean button section: variables only, no zoom, no !important', () => {
  const section = defaultInterfaceStyles.slice(
    defaultInterfaceStyles.indexOf('/* ===== Buttons'),
    defaultInterfaceStyles.indexOf('/* ===== End of buttons'),
  )
  expect(section.length).toBeGreaterThan(500)
  expect(section).not.toContain('!important')
  expect(section).not.toMatch(/zoom/)
  expect(section).not.toMatch(/(^|[\s,>])#[a-z][\w-]*[\s.:[{,]/m)
  expect(section).not.toContain('.game-toolbar button')
  for (const rule of [
    '.nabla-btn--icon',
    '.nabla-btn--wide',
    '.nabla-btn--active',
    '.nabla-btn--disabled',
  ])
    expect(section).toContain(rule)
})
