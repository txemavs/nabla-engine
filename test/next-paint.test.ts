import { expect, it } from 'vitest'
import { nextPaint } from '../src/runtime/next-paint.js'

it('resolves without animation frames (paused window rAF in immersive XR)', async () => {
  const raf = globalThis.requestAnimationFrame
  ;(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = () => 0
  const started = Date.now()
  await nextPaint(20)
  expect(Date.now() - started).toBeLessThan(500)
  ;(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = raf
})
