import { describe, expect, it } from 'vitest'
import { CombatHud } from '../../src/ui/combat-hud.js'

/** Just enough DOM for CombatHud (no DOM test environment in this repo). */
function fakeParent(): HTMLElement {
  const make = (): Record<string, unknown> => {
    const classes = new Set<string>()
    return {
      hidden: false,
      className: '',
      textContent: '',
      style: {},
      classList: {
        add: (c: string) => classes.add(c),
        remove: (c: string) => classes.delete(c),
        toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)),
      },
      setAttribute: () => {},
      append: () => {},
      remove: () => {},
    }
  }
  const doc = { createElement: make }
  return { ...make(), ownerDocument: doc } as unknown as HTMLElement
}

describe('CombatHud health display', () => {
  it('shows the bar by default and reports the share', () => {
    const seen: (number | null)[] = []
    const hud = new CombatHud(fakeParent(), undefined, 'bar', (p) => seen.push(p))
    hud.setHealth(80, 100)
    expect(hud.root.hidden).toBe(false)
    expect(seen).toEqual([80])
    hud.dispose()
  })

  it("keeps the bar hidden in 'readout' mode and reports 0–100 or null", () => {
    const seen: (number | null)[] = []
    const hud = new CombatHud(fakeParent(), undefined, 'readout', (p) => seen.push(p))
    hud.setHealth(100, 100)
    hud.setHealth(-5, 100)
    hud.setHealth(50, 100, false)
    expect(hud.root.hidden).toBe(true)
    expect(seen).toEqual([100, 0, null])
    hud.dispose()
  })
})
