import { test, expect } from '@playwright/test'

// Regression: the `data-visibility` display rules used to override the UA `[hidden]` style,
// so with `touchControls: 'always'` (or a coarse pointer) the road and flight rigs stacked.
test('only the active control profile touch rig is displayed', async ({ page }) => {
  await page.goto('/')
  const shown = await page.evaluate(async (root) => {
    const src = '/@fs/' + root + '/src/runtime/'
    const { TouchDriving } = await import(src + 'touch-driving.ts')
    const { TouchFlight } = await import(src + 'touch-flight.ts')
    const { resolveControlProfile, touchRigState } = await import(src + 'control-profiles.ts')
    const host = document.createElement('div')
    document.body.append(host)
    const actions = { interact: () => {}, camera: () => {} }
    const driving = new TouchDriving(host, actions, 'always')
    const flight = new TouchFlight(host, actions, 'always')
    // On foot the wheel keeps its slot (`visibility: hidden`, #134) so the button row does not
    // jump; it is shown only when it is both laid out and visible.
    const visible = (el: HTMLElement) => {
      const style = getComputedStyle(el)
      return style.display !== 'none' && style.visibility !== 'hidden'
    }
    const result: Record<string, { driving: boolean; wheel: boolean; flight: boolean }> = {}
    for (const [name, vehicle] of [
      ['foot', null],
      ['road', { controls: 'road' }],
      ['flight', { controls: 'flight' }],
    ] as const) {
      const rigs = touchRigState(resolveControlProfile(vehicle).touch, true)
      driving.setActive(rigs.driving.active)
      driving.root.hidden = rigs.driving.hidden
      driving.setDriving(rigs.driving.seatedRoad)
      flight.setActive(rigs.flight.active)
      const wheel = driving.root.querySelector('.touch-driving-wheel') as HTMLElement
      result[name] = {
        driving: visible(driving.root),
        wheel: visible(driving.root) && visible(wheel),
        flight: visible(flight.root),
      }
    }
    driving.dispose()
    flight.dispose()
    host.remove()
    return result
  }, process.cwd())
  expect(shown).toEqual({
    foot: { driving: true, wheel: false, flight: false },
    road: { driving: true, wheel: true, flight: false },
    flight: { driving: false, wheel: false, flight: true },
  })
})
