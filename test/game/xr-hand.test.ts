import { expect, it } from 'vitest'
import { XRControllerHand } from '../../src/runtime/xr-hand.js'
it('mirrors gloves and animates trigger/grip; hides lost tracking', () => {
  const hand = new XRControllerHand()
  const source = {
    handedness: 'right',
    gamepad: { buttons: [{ value: 0 }, { value: 0 }] },
  } as unknown as XRInputSource
  hand.update(source, true)
  expect(hand.root.visible).toBe(true)
  const fingers = hand.root.children.slice(2, 6)
  const open = fingers.map((finger) => finger.rotation.x)
  ;(source.gamepad!.buttons[1] as { value: number }).value = 1
  hand.update(source, true)
  expect(fingers[1].rotation.x).toBeLessThan(open[1])
  ;(source.gamepad!.buttons[0] as { value: number }).value = 1
  hand.update(source, true)
  expect(fingers[0].rotation.x).toBeLessThan(open[0])
  hand.update({ ...source, handedness: 'left' }, true)
  expect(hand.root.scale.x).toBe(-1)
  hand.update(source, false)
  expect(hand.root.visible).toBe(false)
  hand.dispose()
})
