import { expect, it, vi } from 'vitest'
import { Matrix4 } from 'three'
import { XRScreenInput } from '../../src/runtime/xr-screen-input.js'

it('routes one screen selection through the XR pose and ignores headset controllers and gaze', () => {
  const session = new EventTarget() as XRSession
  const select = vi.fn()
  const getPose = vi.fn(() => ({
    transform: { position: { x: 1, y: 2, z: 3 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
  }))
  const input = new XRScreenInput({
    referenceSpace: () => ({}) as XRReferenceSpace,
    worldMatrix: () => new Matrix4().makeTranslation(10, 0, 0),
    enabled: () => true,
    select,
  })
  input.bind(session)
  const send = (mode: string) =>
    session.dispatchEvent(
      Object.assign(new Event('select'), {
        inputSource: { targetRayMode: mode, targetRaySpace: {} },
        frame: { session, getPose },
      }),
    )
  send('tracked-pointer')
  send('gaze')
  expect(select).not.toHaveBeenCalled()
  send('screen')
  expect(select).toHaveBeenCalledTimes(1)
  expect(select.mock.calls[0][0].toArray()).toEqual([11, 2, 3])
  expect(select.mock.calls[0][1].toArray()).toEqual([0, 0, -1])
  input.bind(session)
  send('screen')
  expect(select).toHaveBeenCalledTimes(2)
  input.dispose()
  send('screen')
  expect(select).toHaveBeenCalledTimes(2)
})
it('ignores screen touches without a tracked pose', () => {
  const session = new EventTarget() as XRSession
  const select = vi.fn()
  const input = new XRScreenInput({
    referenceSpace: () => ({}) as XRReferenceSpace,
    worldMatrix: () => new Matrix4(),
    enabled: () => true,
    select,
  })
  input.bind(session)
  session.dispatchEvent(
    Object.assign(new Event('select'), {
      inputSource: { targetRayMode: 'screen', targetRaySpace: {} },
      frame: { session, getPose: () => null },
    }),
  )
  expect(select).not.toHaveBeenCalled()
  input.dispose()
})
