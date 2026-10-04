import { afterEach, expect, test, vi } from 'vitest'
import { waitForGround, groundAtSeam } from '../../src/runtime/ground.js'

afterEach(() => vi.useRealTimers())

test('only a millimetre of seam tolerance is allowed; missing ground remains missing', () => {
  const near = {
    groundHeight: ([x, , z]: number[]) =>
      x !== 0 && z !== 0 && Math.abs(x) <= 0.001 && Math.abs(z) <= 0.001 ? 0 : undefined,
  }
  expect(groundAtSeam(near, [0, 2, 0])).toBe(0)
  expect(
    groundAtSeam({ groundHeight: ([x]: number[]) => (x > 1 ? 0 : undefined) }, [0, 2, 0]),
  ).toBeUndefined()
})

test('sea-level ground at zero is usable and does not require absent neighbouring tiles', async () => {
  const world = { update: vi.fn(), flushInstall: vi.fn(), groundHeight: () => 0, status: 'Ready' }
  await expect(waitForGround(world, [0, 0, 0])).resolves.toBe(0)
})

test('ground timeout reports the provider error instead of starting without terrain', async () => {
  vi.useFakeTimers()
  const world = {
    update: vi.fn(),
    flushInstall: vi.fn(),
    groundHeight: () => undefined,
    status: 'HTTP 403',
  }
  const waiting = waitForGround(world, [0, 0, 0], { timeoutMs: 200 })
  const result = expect(waiting).rejects.toThrow('Ground unavailable: HTTP 403')
  await vi.advanceTimersByTimeAsync(200)
  await result
})

test('disposing while waiting cancels polling immediately', async () => {
  vi.useFakeTimers()
  const controller = new AbortController()
  const world = {
    update: vi.fn(),
    flushInstall: vi.fn(),
    groundHeight: () => undefined,
    status: 'Loading',
  }
  const waiting = waitForGround(world, [0, 0, 0], { signal: controller.signal })
  const result = expect(waiting).rejects.toThrow()
  controller.abort()
  await result
  await vi.advanceTimersByTimeAsync(1000)
  expect(world.update).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})
