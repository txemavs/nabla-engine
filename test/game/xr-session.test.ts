import { afterEach, expect, test, vi } from 'vitest'
import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { XRSessionController as QuestSession } from '../../src/runtime/xr-session.js'

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
  const xr = {
    setSession: vi.fn(async () => {}),
    setReferenceSpace: vi.fn(),
    setReferenceSpaceType: vi.fn(),
  }
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
  t.session.recenter()
  t.session.update(frame as unknown as XRFrame)
  expect(t.xr.setReferenceSpace).toHaveBeenCalledTimes(2)
})

test('requests an explicit AR session while retaining normal teardown', async () => {
  const t = setup()
  await t.session.enter(t.system as unknown as XRSystem, 'immersive-ar')
  expect(t.system.requestSession).toHaveBeenCalledWith('immersive-ar', {
    requiredFeatures: ['unbounded', 'local-floor'],
    optionalFeatures: ['plane-detection', 'mesh-detection', 'anchors'],
  })
  expect(t.session.active).toBe(true)
  await t.session.exit()
  expect(t.session.active).toBe(false)
})

test('AR uses an unbounded render space calibrated from the real floor and waits for both poses', async () => {
  const t = setup()
  const unbounded = Object.assign(new EventTarget(), {
    getOffsetReferenceSpace: vi.fn(() => ({ unbounded: true })),
  })
  t.native.requestReferenceSpace.mockImplementation(async (...args: unknown[]) =>
    args[0] === 'unbounded' ? (unbounded as unknown as typeof t.floor) : t.floor,
  )
  const transforms: { position: unknown }[] = []
  vi.stubGlobal(
    'XRRigidTransform',
    class {
      constructor(position: unknown) {
        transforms.push({ position })
      }
    },
  )
  await t.session.enter(t.system as unknown as XRSystem, 'immersive-ar')
  expect(t.xr.setReferenceSpaceType).toHaveBeenCalledWith('unbounded')
  expect(t.session.referenceReady).toBe(false)
  const frame = {
    getViewerPose: vi.fn(() => ({
      transform: { position: { x: 2, y: 0, z: 3 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
    })),
    getPose: vi
      .fn()
      .mockReturnValueOnce(null)
      .mockReturnValue({ transform: { position: { x: 0, y: -1.72, z: 0 } } }),
  }
  t.session.update(frame as unknown as XRFrame)
  expect(t.xr.setReferenceSpace).not.toHaveBeenCalled()
  t.session.update(frame as unknown as XRFrame)
  expect(frame.getViewerPose).toHaveBeenCalledWith(unbounded)
  expect(frame.getPose).toHaveBeenCalledWith(t.floor, unbounded)
  expect(transforms[0].position).toEqual({ x: 2, y: -1.72, z: 3 })
  expect(t.xr.setReferenceSpace).toHaveBeenCalledWith({ unbounded: true })
  expect(t.session.referenceReady).toBe(true)
  await t.session.exit()
  unbounded.dispatchEvent(new Event('reset'))
  await t.enter()
  expect(t.xr.setReferenceSpaceType).toHaveBeenLastCalledWith('local-floor')
})

test('AR does not silently fall back to a limited session when unbounded is unsupported', async () => {
  const t = setup()
  t.system.requestSession.mockRejectedValueOnce(
    new DOMException('unbounded unavailable', 'NotSupportedError'),
  )
  await expect(t.session.enter(t.system as unknown as XRSystem, 'immersive-ar')).rejects.toThrow(
    'unbounded unavailable',
  )
  expect(t.system.requestSession).toHaveBeenCalledTimes(1)
  expect(t.session.active).toBe(false)
})

test('recording interruptions preserve the AR world across translated and rotated origin resets', async () => {
  const t = setup()
  let offset = new Matrix4()
  const unbounded = Object.assign(new EventTarget(), {
    getOffsetReferenceSpace: vi.fn((transform: { matrix: number[] }) => {
      offset.fromArray(transform.matrix)
      return { offset: offset.clone() }
    }),
  })
  vi.stubGlobal(
    'XRRigidTransform',
    class {
      matrix: number[]
      constructor(p: Vector3, q: Quaternion) {
        this.matrix = new Matrix4().compose(p, q, new Vector3(1, 1, 1)).toArray()
      }
    },
  )
  t.native.requestReferenceSpace.mockImplementation(async (...args: unknown[]) =>
    args[0] === 'unbounded' ? (unbounded as unknown as typeof t.floor) : t.floor,
  )
  const native = Object.assign(t.native, { visibilityState: 'visible' })
  await t.session.enter(t.system as unknown as XRSystem, 'immersive-ar')
  const frame = {
    getViewerPose: vi.fn(() => ({
      transform: {
        position: { x: 2, y: 0, z: 3 },
        orientation: new Quaternion().setFromEuler(new Euler(0, 0.4, 0)),
      },
    })),
    getPose: vi.fn(() => ({ transform: { position: { x: 0, y: -1.7, z: 0 } } })),
  }
  native.visibilityState = 'visible-blurred'
  t.session.update(frame as unknown as XRFrame)
  expect(t.session.referenceReady).toBe(false)
  native.visibilityState = 'visible'
  t.session.update(frame as unknown as XRFrame)
  const initial = offset.clone()
  // Fixed room point (ceiling), placed object and eye in physical coordinates.
  const points = [new Vector3(1, 0.8, -2), new Vector3(-1, -1.5, 0), new Vector3(2, 0, 3)]
  const expected = points.map((p) => p.clone().applyMatrix4(initial.clone().invert()))
  let nativeOrigin = new Matrix4()
  for (const yaw of [0.8, -0.3]) {
    native.visibilityState = 'hidden'
    native.dispatchEvent(new Event('visibilitychange'))
    const delta = new Matrix4().compose(
      new Vector3(0.6, 0.4, -0.2),
      new Quaternion().setFromEuler(new Euler(0.02, yaw, -0.01)),
      new Vector3(1, 1, 1),
    )
    nativeOrigin.multiply(delta)
    const calls = t.xr.setReferenceSpace.mock.calls.length
    const reset = () =>
      Object.assign(new Event('reset'), { transform: { matrix: delta.toArray() } })
    t.floor.dispatchEvent(reset())
    expect(t.xr.setReferenceSpace).toHaveBeenCalledTimes(calls)
    unbounded.dispatchEvent(reset())
    expect(t.xr.setReferenceSpace).toHaveBeenCalledTimes(calls + 1)
    native.visibilityState = 'visible'
    native.dispatchEvent(new Event('visibilitychange'))
    frame.getViewerPose.mockClear()
    t.session.update(frame as unknown as XRFrame)
    expect(frame.getViewerPose).toHaveBeenCalledOnce() // Confidence check only; the reset delta still owns the origin.
    expect(t.session.referenceReady).toBe(true)
    for (let i = 0; i < points.length; i++) {
      const actual = points[i]
        .clone()
        .applyMatrix4(nativeOrigin.clone().invert())
        .applyMatrix4(offset.clone().invert())
      expect(actual.distanceTo(expected[i])).toBeLessThan(1e-10)
    }
  }
  await t.session.exit()
  const calls = t.xr.setReferenceSpace.mock.calls.length
  unbounded.dispatchEvent(
    Object.assign(new Event('reset'), { transform: { matrix: new Matrix4().toArray() } }),
  )
  expect(t.xr.setReferenceSpace).toHaveBeenCalledTimes(calls)
})

test('a reset with unknown delta reports the limitation without guessing a new head origin', async () => {
  const t = setup()
  vi.stubGlobal('XRRigidTransform', class {})
  await t.enter()
  const frame = {
    getViewerPose: () => ({
      transform: {
        position: { x: 0, y: 1.7, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
    }),
  }
  t.session.update(frame as unknown as XRFrame)
  t.floor.dispatchEvent(Object.assign(new Event('reset'), { transform: null }))
  t.session.update(frame as unknown as XRFrame)
  expect(t.report).toHaveBeenCalledOnce()
  expect(t.xr.setReferenceSpace).toHaveBeenCalledTimes(1)
})

test('hand tracking is opt-in and preserves AR room features', async () => {
  const t = setup()
  await t.session.enter(t.system as unknown as XRSystem, 'immersive-ar', true)
  expect(t.system.requestSession).toHaveBeenCalledWith('immersive-ar', {
    requiredFeatures: ['unbounded', 'local-floor'],
    optionalFeatures: ['plane-detection', 'mesh-detection', 'anchors', 'hand-tracking'],
  })
})

test('a room anchor recovers fixed placements after Meta interrupts tracking without a reset transform', async () => {
  const t = setup()
  let installed = new Matrix4()
  const unbounded = Object.assign(new EventTarget(), {
    getOffsetReferenceSpace: vi.fn((transform: { matrix: number[] }) => {
      installed.fromArray(transform.matrix)
      return { offset: installed.clone() }
    }),
  })
  vi.stubGlobal(
    'XRRigidTransform',
    class {
      matrix: number[]
      constructor(p: Vector3, q: Quaternion) {
        this.matrix = new Matrix4().compose(p, q, new Vector3(1, 1, 1)).toArray()
      }
    },
  )
  t.native.requestReferenceSpace.mockImplementation(async (...args: unknown[]) =>
    args[0] === 'unbounded' ? (unbounded as unknown as typeof t.floor) : t.floor,
  )
  const native = Object.assign(t.native, { visibilityState: 'visible' })
  await t.session.enter(t.system as unknown as XRSystem, 'immersive-ar')
  const anchor = { anchorSpace: {} as XRSpace, delete: vi.fn() }
  let anchorPose: { emulatedPosition?: boolean; transform: { matrix: number[] } } | null = null
  const frame = {
    createAnchor: vi.fn(async () => anchor),
    trackedAnchors: new Set([anchor]),
    getViewerPose: vi.fn(() => ({
      transform: { position: { x: 2, y: 0, z: 3 }, orientation: new Quaternion() },
    })),
    getPose: vi.fn((space: unknown) =>
      space === t.floor ? { transform: { position: { x: 0, y: -1.7, z: 0 } } } : anchorPose,
    ),
  }
  t.session.update(frame as unknown as XRFrame)
  await Promise.resolve()
  const original = installed.clone()
  expect(frame.createAnchor).toHaveBeenCalledTimes(1)
  const object = new Vector3(0.4, 0.9, -2)
  const physical = object.clone().applyMatrix4(original)
  native.visibilityState = 'hidden'
  native.dispatchEvent(new Event('visibilitychange'))
  unbounded.dispatchEvent(Object.assign(new Event('reset'), { transform: null }))
  t.session.update(frame as unknown as XRFrame)
  expect(t.session.referenceReady).toBe(false)
  expect(installed.equals(original)).toBe(true)
  native.visibilityState = 'visible'
  t.session.update(frame as unknown as XRFrame) // No anchor pose yet: keep waiting.
  expect(t.session.referenceReady).toBe(false)
  const delta = new Matrix4().compose(
    new Vector3(1, 0.3, -0.7),
    new Quaternion().setFromEuler(new Euler(0.02, 0.7, -0.01)),
    new Vector3(1, 1, 1),
  )
  anchorPose = { transform: { matrix: delta.clone().invert().multiply(original).toArray() } }
  t.session.update(frame as unknown as XRFrame)
  expect(t.session.referenceReady).toBe(true)
  expect(
    physical
      .clone()
      .applyMatrix4(delta.clone().invert())
      .applyMatrix4(installed.clone().invert())
      .distanceTo(object),
  ).toBeLessThan(1e-10)
  expect(t.report).not.toHaveBeenCalled()
  const stable = installed.clone()
  const realAnchor = anchorPose
  const down = new Matrix4().makeTranslation(0, -1.5, 0)
  frame.getViewerPose.mockReturnValueOnce({
    emulatedPosition: true,
    transform: { position: { x: 2, y: -1.5, z: 3 }, orientation: new Quaternion() },
  } as never)
  anchorPose = { transform: { matrix: down.toArray() } }
  t.session.update(frame as unknown as XRFrame)
  expect(t.session.referenceReady).toBe(false)
  expect(installed.equals(stable)).toBe(true)
  anchorPose = { emulatedPosition: true, transform: { matrix: down.toArray() } }
  t.session.update(frame as unknown as XRFrame)
  expect(t.session.referenceReady).toBe(false)
  expect(installed.equals(stable)).toBe(true)
  anchorPose = realAnchor
  t.session.update(frame as unknown as XRFrame)
  expect(t.session.referenceReady).toBe(true)
  expect(installed.equals(stable)).toBe(true)
  const calls = t.xr.setReferenceSpace.mock.calls.length
  t.session.recenter()
  t.session.update(frame as unknown as XRFrame)
  expect(t.xr.setReferenceSpace).toHaveBeenCalledTimes(calls)
  await t.session.exit()
  expect(anchor.delete).toHaveBeenCalledOnce()
})

test('an anchor created after its session ends is deleted instead of attached to another session', async () => {
  const t = setup()
  vi.stubGlobal('XRRigidTransform', class {})
  await t.session.enter(t.system as unknown as XRSystem, 'immersive-ar')
  let resolve!: (anchor: XRAnchor) => void
  const frame = {
    createAnchor: vi.fn(
      () =>
        new Promise<XRAnchor>((done) => {
          resolve = done
        }),
    ),
    getViewerPose: () => ({
      transform: { position: { x: 0, y: 1.7, z: 0 }, orientation: new Quaternion() },
    }),
    getPose: () => ({ transform: { position: { x: 0, y: 0, z: 0 } } }),
  }
  t.session.update(frame as unknown as XRFrame)
  await t.session.exit()
  const anchor = { delete: vi.fn() } as unknown as XRAnchor
  resolve(anchor)
  await Promise.resolve()
  expect(anchor.delete).toHaveBeenCalledOnce()
  expect(t.session.active).toBe(false)
})

test('does not bake estimated head or floor positions into the initial AR origin', async () => {
  const t = setup()
  const unbounded = Object.assign(new EventTarget(), { getOffsetReferenceSpace: vi.fn(() => ({})) })
  t.native.requestReferenceSpace.mockImplementation(async (...args: unknown[]) =>
    args[0] === 'unbounded' ? (unbounded as unknown as typeof t.floor) : t.floor,
  )
  vi.stubGlobal('XRRigidTransform', class {})
  await t.session.enter(t.system as unknown as XRSystem, 'immersive-ar')
  let headEstimated = true,
    floorEstimated = false
  const frame = {
    getViewerPose: () => ({
      emulatedPosition: headEstimated,
      transform: { position: { x: 1, y: 0, z: 2 }, orientation: new Quaternion() },
    }),
    getPose: () => ({
      emulatedPosition: floorEstimated,
      transform: { position: { x: 0, y: -1.7, z: 0 } },
    }),
  }
  t.session.update(frame as unknown as XRFrame)
  expect(t.xr.setReferenceSpace).not.toHaveBeenCalled()
  headEstimated = false
  floorEstimated = true
  t.session.update(frame as unknown as XRFrame)
  expect(t.xr.setReferenceSpace).not.toHaveBeenCalled()
  expect(t.session.referenceReady).toBe(false)
  floorEstimated = false
  t.session.update(frame as unknown as XRFrame)
  expect(t.xr.setReferenceSpace).toHaveBeenCalledOnce()
  expect(t.session.referenceReady).toBe(true)
})

test('diagnostics retain failed anchors, visibility changes and a bounded saved report across reload', async () => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  })
  vi.stubGlobal('XRRigidTransform', class {})
  const t = setup()
  const native = Object.assign(t.native, { visibilityState: 'visible' })
  await t.session.enter(t.system as unknown as XRSystem, 'immersive-ar')
  const frame = {
    getViewerPose: () => ({
      transform: { position: { x: 0, y: 1.7, z: 0 }, orientation: new Quaternion() },
    }),
    getPose: () => ({ transform: { position: { x: 0, y: 0, z: 0 } } }),
    createAnchor: () => Promise.reject(new Error('anchor permission denied')),
  }
  t.session.startDiagnostics()
  t.session.update(frame as unknown as XRFrame)
  await Promise.resolve()
  await Promise.resolve()
  native.visibilityState = 'hidden'
  native.dispatchEvent(new Event('visibilitychange'))
  const report = JSON.parse(t.session.exportDiagnostics())
  expect(report.events.some((event: { type: string }) => event.type === 'anchor-failed')).toBe(true)
  expect(report.events.some((event: { type: string }) => event.type === 'visibility-change')).toBe(
    true,
  )
  expect(report.state.anchorError).toContain('permission denied')
  const restored = setup()
  expect(JSON.parse(restored.session.exportDiagnostics()).events).toEqual(report.events)
  for (let i = 0; i < 300; i++) t.session.recordDiagnostic('marker', { i })
  expect(JSON.parse(t.session.exportDiagnostics()).events).toHaveLength(256)
})
