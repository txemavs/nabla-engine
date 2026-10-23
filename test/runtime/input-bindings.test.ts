import { describe, expect, it, vi } from 'vitest'
import {
  inputBindings,
  bindingForKey,
  keyboardAction,
  actionAxis,
  actionCompletesChord,
  controlsFor,
  controlsHint,
  contextualAction,
  inputMode,
  gamepadActionButtons,
  xrActionButtons,
} from '../../src/config/input-bindings.js'
import { vehicleMenuKey } from '../../src/runtime/vehicle-menu.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { GameRuntime } from '../../src/runtime/game.js'
import { createEntity } from '../../src/entity/schema.js'
import type { SceneView } from '../../src/presentation/scene-view.js'

describe('shared action contexts', () => {
  it('distinguishes entering from leaning, and recovery from reloading', () => {
    expect(keyboardAction('KeyE', { mode: 'walk' })).toBe('interact')
    expect(bindingForKey('KeyE', { mode: 'walk', weapon: true, aiming: true })).toBe('lean.right')
    expect(keyboardAction('KeyE', { mode: 'walk', weapon: true, aiming: true })).toBeUndefined()
    expect(keyboardAction('KeyY', { mode: 'road' })).toBe('recover')
    expect(keyboardAction('KeyY', { mode: 'walk' })).toBe('recover')
    expect(keyboardAction('KeyR', { mode: 'road' })).toBe('horn')
    expect(keyboardAction('KeyR', { mode: 'walk' })).toBe('weapon.slotR')
    expect(keyboardAction('KeyR', { mode: 'walk', weapon: true })).toBe('weapon.magazine')
    expect(keyboardAction('KeyY', { mode: 'walk', weapon: true })).toBe('recover')
    expect(contextualAction('recover', { mode: 'walk', weapon: true })).toBe('recover')
    expect(keyboardAction('KeyM', { mode: 'flight', weapon: true })).toBe('helm')
    expect(keyboardAction('KeyM', { mode: 'walk', weapon: true })).toBe('weapon.auto')
  })
  it('keeps menus ahead of gameplay and reports only effective help', () => {
    expect(keyboardAction('ArrowUp', { mode: 'road', menu: true })).toBe('menu.up')
    expect(keyboardAction('KeyJ', { mode: 'road', menu: true })).toBe('vehicle.menu')
    expect(keyboardAction('KeyP', { mode: 'forklift', menu: true })).toBe('forklift.menu')
    expect(
      actionAxis(new Set(['KeyW']), 'move.forward', 'move.back', { mode: 'road', menu: true }),
    ).toBe(0)
    expect(
      controlsFor({ mode: 'walk', weapon: true, aiming: true }).some(
        (b) => b.action === 'interact',
      ),
    ).toBe(false)
    expect(controlsHint({ mode: 'road' }, ['camera', 'stance'])).toContain('V Change camera')
    expect(controlsHint({ mode: 'road' }, ['highBeam'])).toContain('C/K High / low beam')
    expect(keyboardAction('KeyC', { mode: 'road' })).toBe('highBeam')
    expect(keyboardAction('KeyC', { mode: 'bike' })).toBe('highBeam')
    expect(keyboardAction('KeyC', { mode: 'flight' })).toBe('stance')
  })
  it('shares forward aliases but keeps aircraft thrust separate from pitch', () => {
    expect(
      actionAxis(new Set(['KeyW', 'ArrowUp']), 'move.forward', 'move.back', { mode: 'road' }),
    ).toBe(1)
    expect(
      actionAxis(new Set(['KeyW']), 'flight.liftUp', 'flight.liftDown', { mode: 'flight' }),
    ).toBe(1)
    expect(actionAxis(new Set(['KeyW']), 'flight.forward', 'flight.back', { mode: 'flight' })).toBe(
      0,
    )
    expect(
      actionAxis(new Set(['ArrowUp']), 'flight.forward', 'flight.back', { mode: 'flight' }),
    ).toBe(1)
    expect(inputMode(true, false, { twoWheeled: true })).toBe('bike')
    expect(inputMode(true, false, { forklift: true })).toBe('forklift')
  })
  it('recognizes either press order for prone without consuming an unrelated key', () => {
    const context = { mode: 'walk' as const }
    expect(actionCompletesChord(new Set(['KeyC']), 'prone', 'jump', context)).toBe(true)
    expect(actionCompletesChord(new Set(['Space']), 'prone', 'stance', context)).toBe(true)
    expect(actionCompletesChord(new Set(['Space', 'KeyC']), 'prone', 'camera', context)).toBe(false)
  })
  it('uses declared semantic actions for standard controllers', () => {
    for (const [, action] of gamepadActionButtons) expect(inputBindings[action]).toBeDefined()
    for (const [, , action] of xrActionButtons) expect(inputBindings[action]).toBeDefined()
  })
})

it('routes the actual forklift menu through P without intercepting its J/K hydraulic controls', () => {
  const open = vi.fn(() => true)
  const view = { toggleVehicleMenu: open, vehicleMenu: () => null } as unknown as SceneView
  const scene = {
    version: 1 as const,
    name: 'Toro',
    entities: [presetVehicle('forklift-rc', 'toro')],
  }
  const press = (code: string) =>
    vehicleMenuKey(
      view,
      scene,
      'toro',
      code,
      false,
      () => {},
      () => {},
    )
  expect(press('KeyJ').handled).toBe(false)
  expect(open).not.toHaveBeenCalled()
  expect(keyboardAction('KeyK', { mode: 'forklift' })).toBeUndefined()
  expect(bindingForKey('KeyK', { mode: 'forklift' })).toBe('forklift.liftDown')
  expect(press('KeyP')).toMatchObject({ handled: true, opened: true })
  expect(open).toHaveBeenCalledOnce()
  expect(controlsHint({ mode: 'forklift' })).toContain('P Forklift menu')
  expect(controlsFor({ mode: 'forklift' }).some((b) => b.action === 'highBeam')).toBe(false)
  expect(keyboardAction('KeyJ', { mode: 'road' })).toBe('vehicle.menu')
})

it('executes semantic gameplay actions and preserves the historical key-code adapter', async () => {
  const floor = createEntity('floor', 'box', [0, -0.5, 0])
  floor.size = [20, 1, 20]
  const game = new GameRuntime()
  await game.play({
    version: 1,
    name: 'Actions',
    entities: [floor, createEntity('spawn', 'spawn', [0, 1, 0])],
  })
  try {
    expect(game.dispatch('stance')).toBe('Agachado')
    expect(game.action('KeyC')).toBe('De pie')
    expect(game.action('not-a-control')).toBeUndefined()
  } finally {
    game.stop()
  }
})

it('uses Q to draw or holster even while aiming, leaving Tab to the host menu', () => {
  for (const context of [
    { mode: 'walk' as const },
    { mode: 'walk' as const, weapon: true, aiming: true },
  ]) {
    expect(keyboardAction('KeyQ', context)).toBe('holster')
    expect(keyboardAction('Tab', context)).toBeUndefined()
  }
  expect(bindingForKey('KeyU', { mode: 'walk', weapon: true, aiming: true })).toBe('lean.left')
})
