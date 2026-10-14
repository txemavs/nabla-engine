import { expect, it } from 'vitest'
import { Group, Vector3 } from 'three'
import { XRForklift } from '../../src/runtime/xr-forklift.js'
it('requires grip, follows chassis-local pull, and stops on release or tracking loss', () => {
  const object = new Group(),
    lever = new Group()
  lever.name = 'forklift-lever-0'
  object.add(lever)
  const grip = new Group()
  grip.position.set(0, 0.19, 0)
  const buttons = [
    { pressed: false, value: 0 },
    { pressed: false, value: 0 },
  ]
  const source = { gamepad: { buttons } } as unknown as XRInputSource
  const hand = { grip, mount: new Group(), source }
  const controller = new XRForklift()
  expect(controller.update([hand], object)).toEqual([0, 0, 0])
  buttons[1].pressed = true
  controller.update([hand], object)
  grip.position.z = 0.08
  expect(controller.update([hand], object)[0]).toBeCloseTo(1)
  expect(controller.owns(source)).toBe(true)
  object.position.set(50, 2, -10)
  object.updateMatrixWorld(true)
  grip.position.copy(object.localToWorld(new Vector3(0, 0.19, 0.08)))
  expect(controller.update([hand], object)[0]).toBeCloseTo(1)
  buttons[1].pressed = false
  expect(controller.update([hand], object)).toEqual([0, 0, 0])
  expect(controller.owns(source)).toBe(false)
  expect(controller.update([], null)).toEqual([0, 0, 0])
})
