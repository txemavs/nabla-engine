import { test, expect } from '@playwright/test'

test('AR reuses road and flight touch rigs only for screen sessions with overlay', async ({
  page,
}) => {
  await page.route('**/ar-touch-check', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<body></body>' }),
  )
  await page.goto('/ar-touch-check')
  const result = await page.evaluate(async (root) => {
    const { ARTouchControls } = await import(`/@fs/${root}/src/runtime/ar/touch-controls.ts`)
    const controls = new ARTouchControls({ menu() {}, arm() {}, engage() {} })
    const headset = {
      interactionMode: 'world-space',
      visibilityState: 'visible',
      inputSources: [{ targetRayMode: 'tracked-pointer' }],
      domOverlayState: { type: 'screen' },
    }
    controls.update(headset as any, 'road', false)
    const headsetHidden = controls.root.hidden
    const phone = { ...headset, interactionMode: 'screen-space', inputSources: [] }
    controls.update(phone as any, 'road', false)
    const road =
      !controls.root.hidden && !controls.driving.root.hidden && controls.flight.root.hidden
    controls.update(phone as any, 'flight', false)
    const flight = controls.driving.root.hidden && !controls.flight.root.hidden
    controls.update(phone as any, 'flight', true)
    const blocked = controls.driving.root.hidden && controls.flight.root.hidden
    const event = new Event('beforexrselect', { bubbles: true, cancelable: true })
    controls.root.querySelector('button')!.dispatchEvent(event)
    controls.update({ ...phone, domOverlayState: undefined } as any, 'road', false)
    const unsupported = controls.root.hidden && !controls.available
    controls.dispose()
    return { headsetHidden, road, flight, blocked, suppressed: event.defaultPrevented, unsupported }
  }, process.cwd())
  expect(result).toEqual({
    headsetHidden: true,
    road: true,
    flight: true,
    blocked: true,
    suppressed: true,
    unsupported: true,
  })
})

test('landscape controls stay on their sides and object actions run below the wheel', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.route('**/ar-layout', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<body></body>' }),
  )
  await page.goto('/ar-layout')
  const result = await page.evaluate(async (root) => {
    const { ARTouchControls } = await import(`/@fs/${root}/src/runtime/ar/touch-controls.ts`)
    const c = new ARTouchControls({ menu() {}, arm() {}, engage() {} })
    let calls = 0
    c.setActions('car', [{ id: 'horn', label: 'Claxon', icon: '<svg/>', run: () => calls++ }])
    c.update(
      {
        interactionMode: 'screen-space',
        visibilityState: 'visible',
        inputSources: [],
        domOverlayState: {},
      } as any,
      'road',
      false,
    )
    const rect = (selector: string) => {
      const r = c.root.querySelector(selector)!.getBoundingClientRect()
      return { x: r.x, right: r.right, top: r.top, bottom: r.bottom, width: r.width }
    }
    const left = rect('.touch-driving-stack'),
      right = rect('.touch-driving-wheel'),
      actions = rect('.ar-object-actions')
    ;(c.root.querySelector('[data-action="horn"]') as HTMLButtonElement).click()
    c.dispose()
    return { left, right, actions, calls }
  }, process.cwd())
  expect(result.left.x).toBeLessThan(25)
  expect(result.right.right).toBeGreaterThan(819)
  expect(result.right.width).toBeGreaterThan(250)
  expect(result.right.top).toBeGreaterThanOrEqual(0)
  expect(result.actions.top).toBeGreaterThanOrEqual(result.right.bottom)
  expect(result.calls).toBe(1)
})

test('rotated mobile controls map screen motion back to local steering and gas axes', async ({
  page,
}) => {
  await page.route('**/touch-axis', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<body></body>' }),
  )
  await page.goto('/touch-axis')
  const result = await page.evaluate(async (root) => {
    const { touchCoordinates } = await import(`/@fs/${root}/src/runtime/touch-coordinates.ts`)
    const parent = document.createElement('div')
    parent.dataset.touchRotation = '90'
    const child = document.createElement('div')
    parent.append(child)
    child.getBoundingClientRect = () => ({ left: 10, top: 20, width: 100, height: 200 }) as DOMRect
    return touchCoordinates({ clientX: 110, clientY: 220 }, child)
  }, process.cwd())
  expect(result).toEqual({ x: 100, y: -50, width: 200, height: 100 })
})
