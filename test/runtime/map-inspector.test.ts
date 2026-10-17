import { afterEach, expect, it, vi } from 'vitest'
import { Euler, Quaternion, Vector3 } from 'three'
import { MapInspector } from '../../src/runtime/map-inspector.js'
import { GameRuntime } from '../../src/runtime/browser.js'

afterEach(() => vi.unstubAllGlobals())
it('moves horizontally regardless of look pitch, with normalized diagonals', () => {
  const camera = new MapInspector(new Vector3(10, 20, 30), new Quaternion())
  camera.look(0, 500)
  camera.step(new Set(['KeyW']), 0.1)
  expect(camera.position.toArray()).toEqual([10, 50, 10])
  const before = camera.position.clone()
  camera.step(new Set(['KeyW', 'KeyD']), 0.1)
  expect(camera.position.distanceTo(before)).toBeCloseTo(20)
  expect(camera.home.toArray()).toEqual([10, 20, 30])
})
it('respects heading and stops moving while the original terrain is being restored', () => {
  const camera = new MapInspector(
    new Vector3(),
    new Quaternion().setFromEuler(new Euler(0, Math.PI / 2, 0)),
  )
  camera.step(new Set(['KeyW', 'ShiftLeft']), 0.1)
  expect(camera.position.x).toBeCloseTo(-80)
  camera.returning = true
  const before = camera.position.clone()
  camera.step(new Set(['KeyW', 'KeyE']), 0.1)
  expect(camera.position.toArray()).toEqual(before.toArray())
})
it('inspection frames bypass gameplay and physics without changing vehicle state', () => {
  vi.stubGlobal('document', { hidden: false })
  const vehicle = { position: [1, 2, 3], velocity: [0, 0, -200 / 3.6] }
  const step = vi.fn()
  const inspectionFrame = vi.fn()
  const runtime = {
    session: { simulation: { vehicle, step }, state: 'playing' },
    options: {},
    xr: {},
    renderer: { info: { programs: [] } },
    lastTime: 0,
    inspector: {},
    inspectionFrame,
    game: { step },
    controlSurfaces: vi.fn(),
  }
  const frame = (GameRuntime.prototype as unknown as { frame(t: number): void }).frame
  frame.call(runtime, 16)
  expect(inspectionFrame).toHaveBeenCalledOnce()
  expect(step).not.toHaveBeenCalled()
  expect(runtime.controlSurfaces).not.toHaveBeenCalled()
  expect(vehicle).toEqual({ position: [1, 2, 3], velocity: [0, 0, -200 / 3.6] })
})
