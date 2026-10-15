import { afterEach, expect, test, vi } from 'vitest'
import { Euler, Quaternion } from 'three'
import { QuestSession } from '../../game/xr-session.js'

afterEach(() => vi.unstubAllGlobals())

function setup() {
  const floor = Object.assign(new EventTarget(), {
    getOffsetReferenceSpace: vi.fn(() => ({ centered: true })),
  })
  const native = Object.assign(new EventTarget(), {
    requestReferenceSpace: vi.fn(async () => floor),
    end: vi.fn(async () => {
      native.dispatchEvent(new Event('end'))
    }),
  })
  const system = { requestSession: vi.fn(async () => native) }
  const xr = { setSession: vi.fn(async () => {}), setReferenceSpace: vi.fn() }
  const changed = vi.fn()
  const report = vi.fn()
  const session = new QuestSession(xr, changed, report)
  const enter = () => session.enter(system as unknown as XRSystem)
  return { floor, native, system, xr, changed, report, session, enter }
}

test('one request owns the session, exit restores desktop and permits reentry', async () => {
  const t = setup()
  await Promise.all([t.enter(), t.enter()])
  expect(t.system.requestSession).toHaveBeenCalledTimes(1)
  expect(t.system.requestSession).toHaveBeenCalledWith('immersive-vr', {
    requiredFeatures: ['local-floor'],
  })
  expect(t.xr.setSession).toHaveBeenCalledWith(t.native)
  expect(t.changed).toHaveBeenLastCalledWith(true)
  await t.session.exit()
  expect(t.session.active).toBe(false)
  expect(t.changed).toHaveBeenLastCalledWith(false)
  await t.enter()
  expect(t.system.requestSession).toHaveBeenCalledTimes(2)
})

test('permission rejection leaves entry retryable', async () => {
  const t = setup()
  t.system.requestSession.mockRejectedValueOnce(new Error('denied'))
  await expect(t.enter()).rejects.toThrow('denied')
  expect(t.session.active).toBe(false)
  await t.enter()
  expect(t.changed).toHaveBeenCalledWith(true)
})

test('renderer setup failure ends the acquired session and restores desktop', async () => {
  const t = setup()
  t.xr.setSession.mockRejectedValueOnce(new Error('layer failed'))
  await expect(t.enter()).rejects.toThrow('layer failed')
  expect(t.native.end).toHaveBeenCalledOnce()
  expect(t.session.active).toBe(false)
  expect(t.changed).toHaveBeenLastCalledWith(false)
})

test('permission granted after disposal is ended without attaching the renderer', async () => {
  const t = setup()
  let resolve!: (session: typeof t.native) => void
  t.system.requestSession.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const entering = t.enter()
  await t.session.dispose()
  resolve(t.native)
  await entering
  expect(t.native.end).toHaveBeenCalledOnce()
  expect(t.xr.setSession).not.toHaveBeenCalled()
  expect(t.session.active).toBe(false)
})

test('recentering preserves floor height, removes only yaw, and waits for a tracked pose', async () => {
  const t = setup()
  const transforms: { position: unknown; orientation: unknown }[] = []
  vi.stubGlobal(
    'XRRigidTransform',
    class {
      constructor(position: unknown, orientation: unknown) {
        transforms.push({ position, orientation })
      }
    },
  )
  await t.enter()
  const orientation = new Quaternion().setFromEuler(new Euler(0.2, 0.7, 0.1, 'YXZ'))
  const frame = {
    getViewerPose: vi
      .fn()
      .mockReturnValueOnce(null)
      .mockReturnValue({
        transform: { position: { x: 2, y: 1.65, z: -3 }, orientation },
      }),
  }
  t.session.update(frame as unknown as XRFrame)
  expect(t.xr.setReferenceSpace).not.toHaveBeenCalled()
  t.session.update(frame as unknown as XRFrame)
  expect(transforms[0].position).toEqual({ x: 2, y: 0, z: -3 })
  const rotation = transforms[0].orientation as Quaternion
  expect(new Euler().setFromQuaternion(rotation, 'YXZ').y).toBeCloseTo(0.7)
  expect(rotation.x).toBeCloseTo(0)
  expect(rotation.z).toBeCloseTo(0)
  t.session.update(frame as unknown as XRFrame)
  expect(t.xr.setReferenceSpace).toHaveBeenCalledTimes(1)
  t.floor.dispatchEvent(new Event('reset'))
  t.session.update(frame as unknown as XRFrame)
  expect(t.xr.setReferenceSpace).toHaveBeenCalledTimes(2)
})
