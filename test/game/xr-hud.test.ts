import { expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { XRHUD } from '../../src/runtime/xr-hud.js'

function setup() {
  const hud = new XRHUD()
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), new THREE.MeshBasicMaterial())
  mesh.position.z = -0.55
  const activate = vi.fn()
  const source = { gamepad: { buttons: [{ pressed: false }] } } as unknown as XRInputSource
  const pointer = { source, aim: new THREE.Group(), tip: new THREE.Vector3(1, 0, 0), armed: false }
  const tick = (now = 0, enabled = true) =>
    hud.update([{ mesh, activate }], [pointer], enabled, now)
  return { hud, mesh, activate, pointer, tick }
}
it('activates by trigger once and captures the input while held', () => {
  const f = setup()
  f.tick()
  expect(f.activate).not.toHaveBeenCalled()
  ;(f.pointer.source.gamepad!.buttons[0] as { pressed: boolean }).pressed = true
  f.tick(1)
  f.tick(2)
  expect(f.activate).toHaveBeenCalledTimes(1)
  expect(f.hud.captured.has(f.pointer.source)).toBe(true)
  expect(f.mesh.position.z).toBeLessThan(-0.55)
})
it('touch works with the weapon tip, without trigger; holding contact does not repeat', () => {
  const f = setup()
  f.pointer.armed = true
  f.pointer.tip.set(0, 0, -0.55)
  f.tick()
  f.tick(20)
  expect(f.activate).toHaveBeenCalledTimes(1)
  expect(f.hud.captured.has(f.pointer.source)).toBe(true)
  f.pointer.tip.x = 1
  f.tick(160)
  expect(f.mesh.position.z).toBe(-0.55)
  f.pointer.tip.x = 0
  f.tick(200)
  expect(f.activate).toHaveBeenCalledTimes(2)
})
it('an armed ray does not activate HUD or consume shots', () => {
  const f = setup()
  f.pointer.armed = true
  ;(f.pointer.source.gamepad!.buttons[0] as { pressed: boolean }).pressed = true
  f.tick()
  expect(f.activate).not.toHaveBeenCalled()
  expect(f.hud.captured.size).toBe(0)
})
it('ignores hidden buttons and disabled interaction', () => {
  const f = setup()
  f.pointer.tip.set(0, 0, -0.55)
  f.mesh.visible = false
  f.tick()
  f.mesh.visible = true
  f.tick(1, false)
  expect(f.activate).not.toHaveBeenCalled()
  expect(f.hud.captured.size).toBe(0)
})

it('does not activate or capture the free hand while it grips the slide', () => {
  const f = setup()
  const buttons = f.pointer.source.gamepad!.buttons as GamepadButton[]
  buttons[0] = { pressed: true } as GamepadButton
  buttons[1] = { pressed: true, value: 1 } as GamepadButton
  f.pointer.tip.set(0, 0, -0.55)
  f.tick()
  expect(f.activate).not.toHaveBeenCalled()
  expect(f.hud.captured.size).toBe(0)
})
it('exit needs a continuous deliberate hold and fires once', () => {
  const f = setup()
  const tick = (time: number) =>
    f.hud.update([{ mesh: f.mesh, activate: f.activate, holdMs: 800 }], [f.pointer], true, time)
  const button = f.pointer.source.gamepad!.buttons[0] as { pressed: boolean }
  button.pressed = true
  tick(0)
  tick(100)
  button.pressed = false
  tick(110)
  expect(f.activate).not.toHaveBeenCalled()
  button.pressed = true
  tick(200)
  tick(999)
  expect(f.activate).not.toHaveBeenCalled()
  tick(1000)
  tick(1500)
  expect(f.activate).toHaveBeenCalledTimes(1)
})
it('looking away cancels a pending exit hold', () => {
  const f = setup()
  const tick = (time: number) =>
    f.hud.update([{ mesh: f.mesh, activate: f.activate, holdMs: 800 }], [f.pointer], true, time)
  ;(f.pointer.source.gamepad!.buttons[0] as { pressed: boolean }).pressed = true
  tick(0)
  f.pointer.aim.rotation.y = Math.PI
  tick(400)
  f.pointer.aim.rotation.y = 0
  tick(900)
  expect(f.activate).not.toHaveBeenCalled()
})
