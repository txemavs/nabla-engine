import { describe, expect, it } from 'vitest'
import { GameInput } from '../../src/runtime/input.js'
import type { SceneDocument } from '../../src/scene/document.js'

describe('GameInput facing', () => {
  // Opening the menu or releasing pointer lock must not turn the player (seen by others) to yaw 0.
  it('keeps the yaw while input is disabled or a menu is open', () => {
    const input = new GameInput()
    const doc = { entities: [] } as unknown as SceneDocument
    const keys = new Set<string>()
    expect(input.read(null, doc, 0.016, { keys, yaw: 1.25, enabled: false }).yaw).toBe(1.25)
    const menu = input.read(null, doc, 0.016, { keys, yaw: -2, menuOpen: true })
    expect(menu.yaw).toBe(-2)
    expect(menu.forward).toBe(0)
    expect(menu.brake).toBe(true)
  })
})
