import { expect, test, vi } from 'vitest'
import { Matrix4, Object3D, Quaternion, Vector3 } from 'three'
import { XRHitTest } from '../../src/runtime/xr-hit-test.js'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function session(withHitTest = true) {
  const source = { cancel: vi.fn() }
  const viewer = { viewer: true }
  const native = Object.assign(new EventTarget(), {
    requestReferenceSpace: vi.fn(async () => viewer),
    ...(withHitTest ? { requestHitTestSource: vi.fn(async () => source) } : {}),
  })
  return { native, source, viewer }
}

test('requests a viewer hit-test source once and positions the reticle on hits', async () => {
  const s = session()
  const hit = new XRHitTest()
  const reticle = new Object3D()
  hit.reticle = reticle
  hit.start(s.native as unknown as XRSession)
  hit.start(s.native as unknown as XRSession)
  await flush()
  expect(s.native.requestReferenceSpace).toHaveBeenCalledOnce()
  expect(s.native.requestReferenceSpace).toHaveBeenCalledWith('viewer')
  expect(s.native.requestHitTestSource).toHaveBeenCalledWith({ space: s.viewer })
  expect(hit.supported).toBe(true)
  const matrix = new Matrix4()
    .compose(new Vector3(1, 0, -2), new Quaternion(), new Vector3(1, 1, 1))
    .toArray()
  const space = {} as XRReferenceSpace
  const getPose = vi.fn(() => ({ transform: { matrix } }))
  const frame = { getHitTestResults: vi.fn(() => [{ getPose }]) }
  const pose = hit.update(frame as unknown as XRFrame, space)
  expect(getPose).toHaveBeenCalledWith(space)
  expect(pose?.position.toArray()).toEqual([1, 0, -2])
  expect(reticle.visible).toBe(true)
  expect(reticle.position.toArray()).toEqual([1, 0, -2])
  const target = new Object3D()
  expect(hit.place(target)).toBe(true)
  expect(target.position.z).toBe(-2)
  frame.getHitTestResults.mockReturnValue([])
  expect(hit.update(frame as unknown as XRFrame, space)).toBeNull()
  expect(reticle.visible).toBe(false)
  expect(hit.place(target)).toBe(false)
  s.native.dispatchEvent(new Event('end'))
  expect(s.source.cancel).toHaveBeenCalledOnce()
  expect(hit.supported).toBe(false)
})

test('sessions without hit-test report unavailable and never hit', () => {
  const s = session(false)
  const hit = new XRHitTest()
  hit.start(s.native as unknown as XRSession)
  expect(hit.unavailable).toBe(true)
  const frame = { getHitTestResults: vi.fn(() => []) }
  expect(hit.update(frame as unknown as XRFrame, {} as XRReferenceSpace)).toBeNull()
  expect(frame.getHitTestResults).not.toHaveBeenCalled()
})
