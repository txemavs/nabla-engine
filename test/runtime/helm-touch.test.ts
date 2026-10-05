import { describe, expect, it } from 'vitest'
import { helmTouchAxis } from '../../src/runtime/helm-touch.js'
import { GameInput } from '../../src/runtime/input.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import { Simulation } from '../../src/simulation/simulation.js'

describe('helm tactile commands', () => {
  it('keeps lift and turn on the WASD pad in flight', () => {
    expect(helmTouchAxis('lift:1', true)).toEqual({ axis: 'lift', sign: 1 })
    expect(helmTouchAxis('turn:-1', true)).toEqual({ axis: 'turn', sign: -1 })
    expect(helmTouchAxis('forward:1', true)).toEqual({ axis: 'forward', sign: 1 })
    expect(helmTouchAxis('brake', true)).toEqual({ axis: 'brake', sign: 1 })
  })

  it('maps the Studio helm pads onto road steer, throttle and brake', () => {
    expect(helmTouchAxis('lift:1', false)).toEqual({ axis: 'forward', sign: 1 })
    expect(helmTouchAxis('lift:-1', false)).toEqual({ axis: 'forward', sign: -1 })
    expect(helmTouchAxis('turn:-1', false)).toEqual({ axis: 'right', sign: -1 })
    expect(helmTouchAxis('turn:1', false)).toEqual({ axis: 'right', sign: 1 })
    expect(helmTouchAxis('forward:1', false)).toEqual({ axis: 'forward', sign: 1 })
    expect(helmTouchAxis('right:-1', false)).toEqual({ axis: 'right', sign: -1 })
    expect(helmTouchAxis('brake', false)).toEqual({ axis: 'brake', sign: 1 })
  })

  it('ignores malformed pad actions', () => {
    expect(helmTouchAxis('lift:', false)).toBeNull()
    expect(helmTouchAxis('yaw:1', false)).toBeNull()
    expect(helmTouchAxis('', false)).toBeNull()
  })
})

describe('touch driving mixes with keyboard and gamepad', () => {
  it('adds helm/HUD driving on top of keys and still accepts a later key-only frame', () => {
    const floor = createEntity('floor', 'box', [0, -0.5, 0])
    floor.size = [40, 1, 40]
    const document = {
      version: 1 as const,
      name: 'Touch mix',
      entities: [
        floor,
        createEntity('spawn', 'spawn', [5, 1, 0]),
        presetVehicle('car', 's3', [0, 1.45, 0]),
      ],
    }
    const sim = new Simulation(document)
    for (let i = 0; i < 60; i++) sim.step(1 / 60)
    sim.startInVehicle('s3')
    const input = new GameInput()
    const mixed = input.read(sim, document, 1 / 60, {
      keys: new Set(['KeyW']),
      yaw: 0,
      driving: { forward: 0, right: 1, brake: true },
      touch: { forward: 0, right: 0, lift: 0, turn: 0, brake: false },
    })
    expect(mixed.forward).toBe(1)
    expect(mixed.right).toBeGreaterThan(0)
    expect(mixed.brake).toBe(true)
    const keysOnly = input.read(sim, document, 1 / 60, {
      keys: new Set(['KeyS']),
      yaw: 0,
      driving: { forward: 0, right: 0, brake: false },
    })
    expect(keysOnly.forward).toBe(-1)
    expect(keysOnly.brake).toBe(false)
    sim.dispose()
  })
})
