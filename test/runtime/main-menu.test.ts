import { expect, it } from 'vitest'
import { MAIN_MENU_CSS, mountStartScreen } from '../../src/runtime/main-menu.js'

it('mountStartScreen survives being inlined from its source (no module references)', () => {
  const source = mountStartScreen.toString()
  // Only browser globals and its own parameters may appear free: rebuilding it in an empty scope
  // and running it against a stub document must not throw a ReferenceError.
  const rebuilt = new Function(`return (${source})`)() as typeof mountStartScreen
  const element = () => ({
    append() {},
    addEventListener() {},
    classList: { add() {}, remove() {} },
    setAttribute() {},
    contains: () => false,
    childElementCount: 0,
  })
  const doc = {
    createElement: element,
    body: element(),
    defaultView: { addEventListener() {}, removeEventListener() {} },
  }
  const screen = rebuilt(doc as unknown as Document, {
    t: (key) => key,
    enterKey: 'menu.enter',
    onEnter() {},
  })
  expect(screen.panel).toBeTruthy()
})

it('styles the start screen with classes only', () => {
  expect(MAIN_MENU_CSS).toContain('.nabla-start-enter')
  expect(MAIN_MENU_CSS).not.toMatch(/#(nabla|euskadi)/)
})
