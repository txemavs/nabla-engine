import { test, expect } from '@playwright/test'

test('input owners preserve focus, capture, release order and independent listener lifetimes', async ({
  page,
}) => {
  await page.route('**/input-events-check', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<body><div><canvas id="a" tabindex="0"></canvas></div><div><canvas id="b" tabindex="0"></canvas></div></body>',
    }),
  )
  await page.goto('/input-events-check')
  const result = await page.evaluate(
    async (root) => {
      const { RuntimeInputEvents } = await import(`/@fs/${root}/src/runtime/input-events.ts`)
      const { RuntimePointerCapture } = await import(`/@fs/${root}/src/runtime/pointer-capture.ts`)
      let locked: Element | null = null
      const log: string[] = []
      const make = (id: string) => {
        const canvas = document.getElementById(id) as HTMLCanvasElement
        const abort = new AbortController()
        const pointer = new RuntimePointerCapture(
          canvas,
          {
            get pointerLockElement() {
              return locked
            },
            exitPointerLock() {
              log.push(id + ':exit')
              locked = null
            },
          },
          () => true,
        )
        Object.defineProperty(canvas, 'requestPointerLock', {
          value: () => {
            log.push(id + ':capture')
            locked = canvas
          },
        })
        const record = (name: string) => () => {
          log.push(id + ':' + name)
        }
        const release = Object.fromEntries(
          ['beam', 'controllers', 'weapons', 'touch', 'monitors', 'game', 'gamepad'].map((name) => [
            name,
            record(name),
          ]),
        )
        const input = new RuntimeInputEvents(
          canvas,
          window,
          document,
          pointer,
          {
            playing: () => true,
            hasInput: () => true,
            activity: record('activity'),
            syncShift: (held: boolean) => log.push(id + ':shift:' + held),
            unlockAudio: record('audio'),
            monitorAtCenter: () => false,
            button: (button: number, down: boolean) => log.push(`${id}:button:${button}:${down}`),
            cancelPointer: record('cancel'),
            wheel: (e: WheelEvent) => {
              e.preventDefault()
              log.push(id + ':wheel')
            },
            keyDown: record('down'),
            keyUp: record('up'),
            move: record('move'),
            visibility: record('visibility'),
            release,
          },
          abort.signal,
        )
        input.bind()
        input.bind()
        return { canvas, abort, pointer, input }
      }
      const a = make('a'),
        b = make('b')
      log.length = 0
      a.canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          pointerType: 'mouse',
          button: 0,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      )
      const recapture = [...log]
      const focused = document.activeElement === a.canvas
      log.length = 0
      a.canvas.dispatchEvent(
        new MouseEvent('mousedown', { button: 2, shiftKey: true, bubbles: true }),
      )
      const secondButton = [...log]
      log.length = 0
      const wheel = new WheelEvent('wheel', { cancelable: true })
      a.canvas.dispatchEvent(wheel)
      const wheelPrevented = wheel.defaultPrevented
      log.length = 0
      a.input.release()
      const releaseOrder = [...log]
      log.length = 0
      window.dispatchEvent(new Event('blur'))
      const blur = [...log]
      log.length = 0
      document.dispatchEvent(new Event('visibilitychange'))
      const visibility = [...log]
      a.abort.abort()
      a.input.bind()
      log.length = 0
      a.canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }))
      b.canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }))
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))
      const surviving = [...log]
      log.length = 0
      document.dispatchEvent(new Event('pointerlockchange'))
      const pointerLoss = [...log]
      b.abort.abort()
      log.length = 0
      window.dispatchEvent(new Event('pagehide'))
      b.canvas.dispatchEvent(new PointerEvent('pointermove'))
      return {
        recapture,
        focused,
        secondButton,
        wheelPrevented,
        releaseOrder,
        blur,
        visibility,
        surviving,
        pointerLoss,
        afterDispose: [...log],
      }
    },
    process.cwd().replaceAll('\\', '/'),
  )
  expect(result.focused).toBe(true)
  expect(result.recapture.filter((s: string) => s === 'a:capture')).toHaveLength(1)
  expect(result.recapture).toContain('a:shift:true')
  expect(result.recapture.some((s: string) => s.includes(':button:'))).toBe(false)
  expect(result.secondButton).toEqual(['a:shift:true', 'a:button:2:true'])
  expect(result.wheelPrevented).toBe(true)
  const releases = ['beam', 'controllers', 'weapons', 'touch', 'monitors', 'game', 'gamepad']
  expect(result.releaseOrder).toEqual([...releases.map((s) => 'a:' + s), 'a:exit'])
  expect(result.blur).toEqual([...releases.map((s) => 'a:' + s), ...releases.map((s) => 'b:' + s)])
  expect(result.visibility).toEqual([
    ...releases.map((s) => 'a:' + s),
    'a:visibility',
    ...releases.map((s) => 'b:' + s),
    'b:visibility',
  ])
  expect(result.surviving).toEqual(['b:activity', 'b:activity', 'b:down', 'b:activity', 'b:up'])
  expect(result.pointerLoss).toEqual(releases.map((s) => 'b:' + s))
  expect(result.afterDispose).toEqual([])
})
