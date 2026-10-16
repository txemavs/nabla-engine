import { describe, expect, it } from 'vitest'
import { XRGameInput } from '../../src/runtime/xr-input.js'
function hand(
  handedness: XRHandedness,
  axes: number[],
  pressed: number[] = [],
  trigger = 0,
): XRInputSource {
  return {
    handedness,
    targetRayMode: 'tracked-pointer',
    gamepad: {
      axes,
      buttons: Array.from({ length: 6 }, (_, i) => ({
        pressed: pressed.includes(i),
        value: i === 0 ? trigger : Number(pressed.includes(i)),
      })),
    },
  } as unknown as XRInputSource
}
describe('Engine XR gameplay controls', () => {
  it('walks, snap-turns once and maps actions independently of controller ordering', () => {
    const input = new XRGameInput()
    const sources = [hand('right', [0, 0, 1, 0], [4]), hand('left', [0, 0, 0, -1])]
    expect(input.read(sources, false, false, true)).toMatchObject({
      actions: ['interact'],
      snap: -Math.PI / 6,
      touch: { forward: 1, right: 0 },
    })
    expect(input.read(sources, false, false, true)).toMatchObject({ actions: [], snap: 0 })
    expect(input.read(sources, false, false, false)).toMatchObject({
      actions: [],
      touch: { forward: 0, right: 0 },
    })
    expect(input.read(sources, false, false, true).actions).toEqual(['interact'])
  })
  it('shares throttle, steering, brake and flight axes with the simulation', () => {
    const input = new XRGameInput()
    const sources = [hand('left', [0, 0, -1, -1], [1], 0.2), hand('right', [0, 0, 1, -1], [], 0.8)]
    expect(input.read(sources, false, true, true).touch).toEqual({
      forward: 0.8 - 0.2,
      right: -1,
      lift: 0,
      turn: 0,
      brake: false,
    })
    expect(input.read(sources, true, true, true).touch).toEqual({
      forward: 1,
      right: 1,
      lift: 1,
      turn: -1,
      brake: false,
    })
    expect(input.read([], false, false, true).touch.forward).toBe(0)
  })
})

it('reserves squeeze buttons for physical grabbing', () => {
  const input = new XRGameInput()
  const sources = [hand('left', [0, 0, 0, 0], [0, 1])]
  expect(input.read(sources, false, false, true, true).actions).toEqual([])
  expect(input.read(sources, false, false, true, true).actions).toEqual([])
  input.reset()
  expect(input.read(sources, false, true, true, true).actions).toEqual([])
  input.reset()
  expect(input.read(sources, false, false, false, true).actions).toEqual([])
})

it('X toggles the main menu once per press and no longer hitches the vehicle', () => {
  const input = new XRGameInput(),
    left = hand('left', [0, 0, 0, 0], [4])
  expect(input.read([left], false, true, true).actions).toEqual(['xr.menu'])
  expect(input.read([left], false, true, true).actions).toEqual([])
  input.read([], false, true, true)
  expect(input.read([left], false, true, true).actions).toEqual(['xr.menu'])
})
