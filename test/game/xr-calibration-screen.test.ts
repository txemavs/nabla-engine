import { expect, it, vi } from 'vitest'
import * as THREE from 'three'
vi.mock('../../src/render/monitors/html-monitor.js', () => ({
  HtmlMonitor: class {
    texture = new THREE.Texture()
    update = vi.fn()
    press = vi.fn()
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
  expect(screen.isOpen).toBe(false)
  screen.show()
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
  screen.activate(750, 190) // shared pistol adjustment in the dropdown
  screen.activate(910, 195)
  expect(screen.calibration.get('grip-left').x).toBe(0.5)
  const before = screen.root.position.clone()
  screen.sync(camera, new THREE.Vector3(1000, 0, 0), true, 100)
  expect(screen.root.position.x).toBeCloseTo(before.x - 1000)
  screen.suspend()
  expect(screen.root.visible).toBe(false)
  screen.dispose()
})

it('pages quality controls without activating calibration or opening on startup', () => {
  const { screen, camera } = setup()
  const change = vi.fn()
  screen.qualityMenu = {
    rows: () => Array.from({ length: 10 }, (_, i) => ({ label: String(i), value: '0' })),
    change,
    road: vi.fn(),
    apply: vi.fn(),
    status: () => '',
  }
  screen.activate(800, 575)
  screen.sync(camera, new THREE.Vector3(), true, 1)
  screen.activate(900, 180)
  expect(change).toHaveBeenCalledWith(6, 1)
  screen.hide()
  screen.sync(camera, new THREE.Vector3(), true, 2)
  expect(screen.root.visible).toBe(false)
  screen.dispose()
})

it('switches from development to quality and gives button feedback', () => {
  const { screen } = setup()
  const change = vi.fn()
  screen.qualityMenu = {
    rows: () => [{ label: 'Resolución', value: '80%' }],
    change,
    road: vi.fn(),
    apply: vi.fn(),
    status: () => '',
  }
  screen.activate(500, 35)
  expect(screen.development).toBe(true)
  screen.activate(100, 35)
  expect(screen.development).toBe(false)
  expect(screen.monitor.press).toHaveBeenLastCalledWith('.header')
  screen.activate(910, 195)
  expect(change).toHaveBeenCalledWith(0, 1)
  expect(screen.monitor.press).toHaveBeenLastCalledWith('.row:has([data-value="label-x"]) .plus')
  screen.dispose()
})

it('opens independent quality/development pages and returns to the main menu', () => {
  const { screen } = setup()
  const add = vi.fn(),
    change = vi.fn()
  screen.mainMenu = () => [{ label: 'Añadir', run: add }]
  screen.qualityMenu = {
    rows: () => [{ label: 'Resolución', value: '80%' }],
    change,
    road: vi.fn(),
    apply: vi.fn(),
    status: () => '',
  }
  screen.activate(100, 120)
  expect(add).toHaveBeenCalledOnce()
  screen.activate(420, 120) // quality after host item
  screen.activate(910, 195)
  expect(change).toHaveBeenCalledWith(0, 1)
  screen.activate(100, 35) // back
  screen.activate(750, 120) // development, independent entry
  expect(screen.development).toBe(true)
  screen.activate(100, 35)
  screen.activate(100, 120)
  expect(add).toHaveBeenCalledTimes(2)
  screen.dispose()
})

it('grabs the frame edge, preserves pose on transfer and releases without following the hand', () => {
  const { screen, pointer, source } = setup()
  const grip = new THREE.Group()
  grip.position.copy(screen.root.localToWorld(new THREE.Vector3(1.04, 0, 0)))
  ;(source.gamepad!.buttons as unknown as { pressed: boolean }[]).push({ pressed: true })
  const hand = { ...pointer, grip }
  screen.interact([hand], true)
  expect(screen.captured.has(source)).toBe(true)
  const start = screen.root.position.clone()
  grip.position.x += 0.2
  screen.interact([hand], true)
  expect(screen.root.position.x - start.x).toBeCloseTo(0.2)
  const otherSource = {
    gamepad: { buttons: [{ pressed: false }, { pressed: true }] },
  } as unknown as XRInputSource
  const otherGrip = new THREE.Group()
  otherGrip.position.copy(screen.root.localToWorld(new THREE.Vector3(-1.04, 0, 0)))
  const other = { ...pointer, source: otherSource, grip: otherGrip }
  const before = screen.root.position.clone()
  screen.interact([hand, other], true)
  expect(screen.root.position.distanceTo(before)).toBeCloseTo(0)
  otherGrip.position.y += 0.3
  screen.interact([hand, other], true)
  expect(screen.root.position.y - before.y).toBeCloseTo(0.15)
  ;(source.gamepad!.buttons[1] as { pressed: boolean }).pressed = false
  screen.interact([hand, other], true)
  const transferred = screen.root.position.clone()
  otherGrip.position.y += 0.2
  screen.interact([hand, other], true)
  expect(screen.root.position.y - transferred.y).toBeCloseTo(0.2)
  ;(otherSource.gamepad!.buttons[1] as { pressed: boolean }).pressed = false
  screen.interact([hand, other], true)
  const dropped = screen.root.position.clone()
  otherGrip.position.y += 0.3
  screen.interact([hand, other], true)
  expect(screen.root.position.distanceTo(dropped)).toBeCloseTo(0)
  screen.dispose()
})

it('keeps the moved monitor pose when hidden and reopened, but can explicitly recenter', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera()
  scene.add(camera)
  const screen = new XRCalibrationScreen(scene, new XRCalibration())
  screen.show()
  screen.sync(camera, new THREE.Vector3(), true, 0)
  screen.root.position.set(3, 1, -4)
  screen.root.rotation.y = 0.7
  const rotation = screen.root.quaternion.clone()
  screen.hide()
  screen.openMain()
  screen.sync(camera, new THREE.Vector3(), true, 1)
  expect(screen.root.position.toArray()).toEqual([3, 1, -4])
  expect(screen.root.quaternion.angleTo(rotation)).toBeCloseTo(0)
  screen.show(true)
  screen.sync(camera, new THREE.Vector3(), true, 2)
  expect(screen.root.position.x).toBeCloseTo(0)
  screen.dispose()
})
