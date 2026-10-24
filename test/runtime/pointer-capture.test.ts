import { expect, it, vi } from 'vitest'
import { RuntimePointerCapture } from '../../src/runtime/pointer-capture.js'

it('only captures from an eligible playing runtime and preserves the target receiver', () => {
  let playing = false
  const target = {
    requestPointerLock: vi.fn(function (this: unknown) {
      expect(this).toBe(target)
    }),
  }
  const document = { pointerLockElement: null as unknown, exitPointerLock: vi.fn() }
  const pointer = new RuntimePointerCapture(target, document, () => playing)
  pointer.free = true
  pointer.capture()
  expect(pointer.free).toBe(true)
  expect(target.requestPointerLock).not.toHaveBeenCalled()
  playing = true
  pointer.capture()
  expect(pointer.free).toBe(false)
  expect(target.requestPointerLock).toHaveBeenCalledOnce()
  document.pointerLockElement = target
  pointer.capture()
  expect(target.requestPointerLock).toHaveBeenCalledOnce()
  pointer.release()
  expect(document.exitPointerLock).toHaveBeenCalledOnce()
})

it('keeps two runtime policies independent and never releases another canvas lock', () => {
  const left = { requestPointerLock: vi.fn() },
    right = { requestPointerLock: vi.fn() }
  const document = { pointerLockElement: left as unknown, exitPointerLock: vi.fn() }
  const a = new RuntimePointerCapture(left, document, () => true)
  const b = new RuntimePointerCapture(right, document, () => true)
  const releaseA = vi.fn(),
    releaseB = vi.fn()
  a.changed(releaseA)
  b.changed(releaseB)
  expect(a.free).toBe(false)
  expect(b.free).toBe(true)
  expect(releaseA).not.toHaveBeenCalled()
  expect(releaseB).toHaveBeenCalledOnce()
  b.release()
  expect(document.exitPointerLock).not.toHaveBeenCalled()
  document.pointerLockElement = null
  a.changed(releaseA)
  expect(a.free).toBe(true)
  expect(releaseA).toHaveBeenCalledOnce()
})

it('supports absent APIs, legacy void returns and refused requests without preventing retries', async () => {
  const document = { pointerLockElement: null, exitPointerLock: vi.fn() }
  const unsupported = new RuntimePointerCapture({}, document, () => true)
  expect(unsupported.unsupported).toBe(true)
  expect(() => unsupported.capture()).not.toThrow()
  const request = vi
    .fn<() => void | Promise<void>>()
    .mockImplementationOnce(() => {
      throw Error('denied')
    })
    .mockImplementationOnce(() => Promise.reject(Error('denied')))
    .mockImplementationOnce(() => undefined)
  const pointer = new RuntimePointerCapture({ requestPointerLock: request }, document, () => true)
  expect(() => pointer.capture()).not.toThrow()
  pointer.capture()
  await Promise.resolve()
  pointer.capture()
  expect(request).toHaveBeenCalledTimes(3)
})

it('releases held input outside play without changing free-mouse preference', () => {
  const pointer = new RuntimePointerCapture(
    {},
    { pointerLockElement: null, exitPointerLock: vi.fn() },
    () => false,
  )
  const release = vi.fn()
  pointer.changed(release)
  expect(pointer.free).toBe(false)
  expect(release).toHaveBeenCalledOnce()
})
