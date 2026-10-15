import { describe, it, expect } from 'vitest'
import { Group } from 'three'
import { XRTrackedHand } from '../../src/runtime/xr-tracked-hands.js'

describe('natural hand adapter', () => {
  it('requires opening first, preserves source identity, and releases on tracking loss', () => {
    const slot = new XRTrackedHand('right', new Group())
    let closed = true
    const source = {
      hand: { get: (name: string) => name },
      handedness: 'right',
      targetRaySpace: {},
    } as unknown as XRInputSource
    const frame = {
      getPose: () => null,
      getJointPose: (name: string) => {
        const x = name.startsWith('index') ? -0.025 : name.startsWith('pinky') ? 0.025 : 0
        const z = name === 'wrist' ? 0 : name.endsWith('tip') ? (closed ? -0.04 : -0.12) : -0.06
        return { transform: { position: { x, y: 0, z } } }
      },
    } as unknown as XRFrame
    const space = {} as XRReferenceSpace
    slot.update(frame, space, source)
    expect(slot.source!.gamepad!.buttons[1].pressed).toBe(false)
    closed = false
    slot.update(frame, space, source)
    const stable = slot.source
    closed = true
    slot.update(frame, space, source)
    expect(slot.source).toBe(stable)
    expect(slot.source!.gamepad!.buttons[1].pressed).toBe(true)
    expect(slot.source!.gamepad!.buttons[0].pressed).toBe(false)
    slot.update(frame, space, undefined)
    expect(slot.source).toBeNull()
    expect(stable!.gamepad!.buttons[1].pressed).toBe(false)
    slot.update(frame, space, source)
    expect(slot.source!.gamepad!.buttons[1].pressed).toBe(false)
  })
})
