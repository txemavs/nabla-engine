import { expect, it, vi } from 'vitest'
import * as THREE from 'three'
vi.mock('../../src/render/monitors/html-monitor.js', () => ({
  HtmlMonitor: class {
    texture = new THREE.Texture()
    update = vi.fn()
    dispose() {
      this.texture.dispose()
    }
  },
}))
vi.mock('../../src/render/entity/assets.js', () => ({
  assets: { instantiate: async () => new THREE.Group() },
  disposeObject: vi.fn(),
}))
import { XRCalibrationScreen } from '../../src/runtime/xr-calibration-screen.js'
import { XRCalibration } from '../../src/runtime/xr-calibration.js'

function setup() {
  const calibration = new XRCalibration(),
    scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera()
  camera.position.set(0, 1.65, 0)
  scene.add(camera)
  const screen = new XRCalibrationScreen(scene, calibration)
  screen.sync(camera, new THREE.Vector3(), true, 0)
  const source = { gamepad: { buttons: [{ pressed: false }] } } as unknown as XRInputSource
  const aim = new THREE.Group()
  scene.add(aim)
  const at = (x: number, y: number, z = 0.01) =>
    screen.face.localToWorld(new THREE.Vector3((x / 1024 - 0.5) * 2, (0.5 - y / 640) * 1.25, z))
  const pointer = { source, aim, tip: at(910, 195), armed: false }
  return { screen, calibration, pointer, source, at, camera }
}
it('touches once per contact with a finger or gun muzzle, without repeating while held', () => {
  for (const armed of [false, true]) {
    const { screen, calibration, pointer, at } = setup()
    pointer.armed = armed
    screen.interact([pointer], true)
    expect(calibration.get('hand-left').x).toBe(0.5)
    screen.interact([pointer], true)
    expect(calibration.get('hand-left').x).toBe(0.5)
    pointer.tip = at(910, 195, 0.15)
    screen.interact([pointer], true)
    pointer.tip = at(910, 195)
    screen.interact([pointer], true)
    expect(calibration.get('hand-left').x).toBe(1)
    screen.dispose()
  }
})
it('permits ray clicks only with an empty hand and consumes a held trigger until released', () => {
  const { screen, calibration, pointer, source, at } = setup()
  pointer.tip = at(910, 195, 0.3)
  pointer.aim.position.copy(at(910, 195, 0.4))
  pointer.aim.updateMatrixWorld(true)
  ;(source.gamepad!.buttons[0] as { pressed: boolean }).pressed = true
  pointer.armed = true
  screen.interact([pointer], true)
  expect(calibration.get('hand-left').x).toBe(0)
  ;(source.gamepad!.buttons[0] as { pressed: boolean }).pressed = false
  screen.interact([pointer], true)
  pointer.armed = false
  ;(source.gamepad!.buttons[0] as { pressed: boolean }).pressed = true
  screen.interact([pointer], true)
  expect(calibration.get('hand-left').x).toBe(0.5)
  screen.hide()
  screen.interact([pointer], true)
  expect(screen.captured.has(source)).toBe(true)
  ;(source.gamepad!.buttons[0] as { pressed: boolean }).pressed = false
  screen.interact([pointer], true)
  expect(screen.captured.has(source)).toBe(false)
  screen.dispose()
})
it('selects objects and keeps world placement stable across floating-origin changes', () => {
  const { screen, camera } = setup()
  screen.activate(500, 120)
  screen.activate(750, 190) // right hand in the dropdown
  screen.activate(910, 195)
  expect(screen.calibration.get('hand-right').x).toBe(0.5)
  const before = screen.root.position.clone()
  screen.sync(camera, new THREE.Vector3(1000, 0, 0), true, 100)
  expect(screen.root.position.x).toBeCloseTo(before.x - 1000)
  screen.suspend()
  expect(screen.root.visible).toBe(false)
  screen.dispose()
})
