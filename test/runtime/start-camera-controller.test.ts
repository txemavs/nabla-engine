import { expect, it, vi } from 'vitest'
import { RuntimeStartCameraController } from '../../src/runtime/start-camera-controller.js'
import { createGameCameraState } from '../../src/runtime/game-camera.js'

const simulation = () => ({
  player: { vehicleId: 'car' as string | null },
  vehicleInfo: () => ({ ignition: 'running' as const, helm: 'off' as const }),
  holdEngine: vi.fn(),
  startEngine: vi.fn(),
})

it('holds a descending start across play and ignores an older gate settling', async () => {
  const camera = createGameCameraState(),
    sim = simulation(),
    report = vi.fn()
  const controller = new RuntimeStartCameraController(
    [
      { view: 'overhead', fromHeight: 600 },
      { view: 'chase', after: 0 },
    ],
    camera,
    report,
  )
  let releaseOld!: () => void, releaseNew!: () => void
  controller.hold(
    new Promise<void>((resolve) => {
      releaseOld = resolve
    }),
  )
  controller.hold(
    new Promise<void>((resolve) => {
      releaseNew = resolve
    }),
  )
  controller.start(true, sim)
  releaseOld()
  await Promise.resolve()
  await Promise.resolve()
  controller.advance(sim, 100)
  expect(camera.mapHeight).toBe(600)
  expect(camera.mapDescentDamping).toBe(1.2)
  releaseNew()
  await Promise.resolve()
  await Promise.resolve()
  controller.advance(sim, 10000)
  expect(camera.mode).toBe('map')
  camera.mapDescentDamping = undefined
  camera.transition = null
  camera.entrance = null
  controller.advance(sim, 10001)
  expect(camera.mode).toBe('chase')
  expect(report).toHaveBeenCalledWith('active')
})

it('keeps runtimes independent and starts a held engine once when input skips', () => {
  const ac = createGameCameraState(),
    bc = createGameCameraState(),
    aSim = simulation(),
    bSim = simulation()
  const steps = ['overhead', { view: 'driver', after: 'engine' }] as const
  const a = new RuntimeStartCameraController(steps, ac, vi.fn()),
    b = new RuntimeStartCameraController(steps, bc, vi.fn())
  a.start(true, aSim)
  b.start(true, bSim)
  expect(aSim.holdEngine).toHaveBeenCalledOnce()
  a.skip(aSim, false)
  a.skip(aSim)
  expect(aSim.startEngine).toHaveBeenCalledOnce()
  expect(ac.mode).toBe('map')
  expect(a.active).toBe(false)
  expect(b.active).toBe(true)
  expect(bSim.startEngine).not.toHaveBeenCalled()
  b.skip(bSim)
  expect(bc.mode).toBe('cockpit')
})

it('completes on vehicle exit, clears previous starts and tolerates rejected holds', async () => {
  const camera = createGameCameraState(),
    sim = simulation(),
    report = vi.fn()
  const controller = new RuntimeStartCameraController(['overhead', 'driver'], camera, report)
  controller.hold(Promise.reject(Error('host cancelled')))
  await Promise.resolve()
  await Promise.resolve()
  controller.start(true, sim)
  sim.player.vehicleId = null
  controller.advance(sim, 100)
  expect(controller.active).toBe(false)
  expect(report).toHaveBeenLastCalledWith('complete')
  controller.start(false, sim)
  expect(controller.first).toBeUndefined()
  expect(report).toHaveBeenLastCalledWith('none')
})
