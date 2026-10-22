import { expect, it } from 'vitest'
import { mountStartScreen } from '../../src/runtime/main-menu.js'
import { engineStyleSheets } from '../../src/ui/styles.js'

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
  const start = engineStyleSheets.menu.slice(engineStyleSheets.menu.indexOf('/* Start screen'))
  expect(start).toContain('.nabla-start-enter')
  expect(start.slice(0, start.indexOf('/* Mobile quality'))).not.toMatch(/#(nabla|euskadi)/)
})
