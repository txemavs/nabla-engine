import { expect, it } from 'vitest'
import { RuntimeInputPreferences } from '../../src/runtime/input-preferences.js'
import { createSettingsStore } from '../../src/runtime/settings-scope.js'
import { deadzone, gamepadAxes, GameInput } from '../../src/runtime/input.js'
import type { SceneDocument } from '../../src/scene/document.js'
import { preferenceKeys } from '../../src/runtime/settings-backup.js'

it('preserves legacy response and independently saves, restores and mutates runtime preferences', () => {
  const data = new Map<string, string>()
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v)
    },
    removeItem: (k: string) => {
      data.delete(k)
    },
  }
  const aStore = createSettingsStore({ storage, namespace: 'a' })
  const bStore = createSettingsStore({ storage, namespace: 'b' })
  const a = new RuntimeInputPreferences(),
    b = new RuntimeInputPreferences()
  a.restore(aStore)
  b.restore(bStore)
  expect(a.mouseDelta(10, 20)).toEqual({ yaw: -0.03, pitch: 0.06 })
  a.set({ mouseSensitivity: 2, invertMouseY: true, gamepadDeadzone: 0.3 }, aStore)
  expect(a.mouseDelta(10, 20)).toEqual({ yaw: -0.06, pitch: -0.12 })
  expect(b.settings).toEqual({
    mouseSensitivity: 1,
    invertMouseY: false,
    steeringRiseSeconds: 0.4,
    steeringReleaseSeconds: 0.12,
    gamepadDeadzone: 0.12,
  })
  const restored = new RuntimeInputPreferences()
  restored.restore(createSettingsStore({ storage, namespace: 'a' }))
  expect(restored.settings).toEqual(a.settings)
  const copy = a.settings
  copy.mouseSensitivity = 4
  expect(a.settings.mouseSensitivity).toBe(2)
  expect(preferenceKeys.has('nabla.input')).toBe(true)
})

it('handles corrupt, partial and unavailable storage without changing defaults globally', () => {
  const p = new RuntimeInputPreferences()
  const store = {
    getItem: () => '{bad',
    setItem: () => {
      throw Error('denied')
    },
  }
  p.restore(store)
  expect(p.settings.mouseSensitivity).toBe(1)
  p.set({ mouseSensitivity: NaN, gamepadDeadzone: 100, invertMouseY: true }, store)
  expect(p.settings).toEqual({
    mouseSensitivity: 1,
    steeringRiseSeconds: 0.4,
    steeringReleaseSeconds: 0.12,
    gamepadDeadzone: 0.5,
    invertMouseY: true,
  })
  p.restore({ ...store, getItem: () => '{"mouseSensitivity":0.5}' })
  expect(p.settings.mouseSensitivity).toBe(0.5)
  expect(new RuntimeInputPreferences().settings.gamepadDeadzone).toBe(0.12)
})

it('applies per-source dead zone to gamepad sticks while retaining full travel and trigger values', () => {
  const pad = {
    axes: [0.2, -1, 0.2, -1],
    buttons: Array.from({ length: 8 }, (_, i) => ({
      value: i === 7 ? 0.7 : 0,
      pressed: false,
      touched: false,
    })),
  }
  expect(gamepadAxes(pad, false, 0.3)).toMatchObject({ right: 0, forward: 0.7 })
  expect(gamepadAxes(pad, true, 0.3)).toMatchObject({ right: 0, lift: 1, forward: 1 })
  const doc = { entities: [] } as unknown as SceneDocument
  const a = new GameInput(),
    b = new GameInput()
  const sources = { keys: new Set<string>(), yaw: 0, pad }
  expect(a.read(null, doc, 0.016, { ...sources, gamepadDeadzone: 0.3 }).right).toBe(0)
  expect(b.read(null, doc, 0.016, sources).right).toBeGreaterThan(0)
  expect(deadzone(NaN, 0.3)).toBe(0)
  expect(deadzone(1, 0.5)).toBe(1)
  expect(deadzone(-1, 0.5)).toBe(-1)
})
