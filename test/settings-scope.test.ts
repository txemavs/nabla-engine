import { describe, expect, it, vi } from 'vitest'
import {
  createSettingsStore,
  playModeFromSearch,
  scopedKey,
} from '../src/runtime/settings-scope.js'

describe('settings scope', () => {
  it('reads the play mode from ?vr=', () => {
    expect(playModeFromSearch('')).toBe('pc')
    expect(playModeFromSearch('?vr=pc')).toBe('headset-pc')
    expect(playModeFromSearch('?vr=headset')).toBe('headset')
    expect(playModeFromSearch('?vr=x')).toBe('pc')
  })
  it('keeps PC keys and namespaces VR modes', () => {
    expect(scopedKey('pc', 'nabla.quality')).toBe('nabla.quality')
    expect(scopedKey('headset', 'nabla.quality')).toBe('nabla.settings.headset.quality')
    expect(scopedKey('headset-pc', 'nabla.layers')).toBe('nabla.settings.headset-pc.layers')
    expect(scopedKey('headset', 'other')).toBe('other')
  })
})

function memory(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial))
  return {
    get length() {
      return map.size
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    },
    clear: () => map.clear(),
  }
}
it('snapshots even unread keys, preserves PC/VR preferences and never patches native methods', () => {
  const storage = memory({ 'nabla.cameraFov': '12', 'nabla.settings.headset.cameraFov': '24' })
  const get = storage.getItem,
    set = storage.setItem
  const a = createSettingsStore({ storage, mode: 'pc' })
  const b = createSettingsStore({ storage, mode: 'pc' })
  a.setItem('nabla.cameraFov', '30')
  expect(b.getItem('nabla.cameraFov')).toBe('12')
  a.setItem('nabla.new', 'yes')
  expect(b.getItem('nabla.new')).toBeNull()
  a.switchMode('headset')
  expect(a.getItem('nabla.cameraFov')).toBe('24')
  expect(b.mode).toBe('pc')
  expect(b.getItem('nabla.cameraFov')).toBe('12')
  expect(storage.getItem).toBe(get)
  expect(storage.setItem).toBe(set)
  expect(createSettingsStore({ storage, mode: 'pc' }).getItem('nabla.cameraFov')).toBe('30')
})
it('named instances inherit legacy values, then persist independently', () => {
  const storage = memory({ 'nabla.cameraFov': '12' })
  const a = createSettingsStore({ storage, mode: 'pc', namespace: 'left' })
  const b = createSettingsStore({ storage, mode: 'pc', namespace: 'right' })
  expect(a.getItem('nabla.cameraFov')).toBe('12')
  a.setItem('nabla.cameraFov', '30')
  b.setItem('nabla.cameraFov', '5')
  expect(
    createSettingsStore({ storage, mode: 'pc', namespace: 'left' }).getItem('nabla.cameraFov'),
  ).toBe('30')
  expect(
    createSettingsStore({ storage, mode: 'pc', namespace: 'right' }).getItem('nabla.cameraFov'),
  ).toBe('5')
  expect(storage.getItem('nabla.cameraFov')).toBe('12')
})
it('seeds VR once with saved values above host values above engine defaults', () => {
  const storage = memory({ 'nabla.settings.headset.quality': 'high' })
  const defaults = { headset: { 'nabla.quality': 'low', 'nabla.cameraFov': '9' } }
  const a = createSettingsStore({ storage, mode: 'headset', hostDefaults: defaults })
  expect(a.getItem('nabla.quality')).toBe('high')
  expect(a.getItem('nabla.cameraFov')).toBe('9')
  expect(a.getItem('nabla.xr.quality.v1')).toContain('0.7')
  a.removeItem('nabla.cameraFov')
  expect(
    createSettingsStore({ storage, mode: 'headset', hostDefaults: defaults }).getItem(
      'nabla.cameraFov',
    ),
  ).toBeNull()
  expect(storage.getItem('nabla.cameraFov')).toBeNull()
})
it.each([true, false])(
  'retains session settings when storage is denied (snapshot=%s)',
  (snapshot) => {
    const denied = () => {
      throw new Error('SecurityError')
    }
    const store = createSettingsStore({
      mode: 'pc',
      snapshot,
      storage: {
        get length(): number {
          return denied()
        },
        key: denied,
        getItem: denied,
        setItem: denied,
        removeItem: denied,
      },
    })
    store.setItem('nabla.cameraFov', '17')
    expect(store.getItem('nabla.cameraFov')).toBe('17')
    store.removeItem('nabla.cameraFov')
    expect(store.getItem('nabla.cameraFov')).toBeNull()
    const transient = createSettingsStore({ storage: null, snapshot, mode: 'pc' })
    transient.setItem('nabla.cameraFov', '8')
    expect(transient.getItem('nabla.cameraFov')).toBe('8')
  },
)
it('enumerates logical keys for backup and reset without crossing VR profiles', () => {
  const storage = memory({
    token: 'keep',
    'nabla.cameraFov': '12',
    'nabla.settings.headset.cameraFov': '24',
  })
  const vr = createSettingsStore({ storage, mode: 'headset' })
  expect(Array.from({ length: vr.length }, (_, i) => vr.key(i))).toContain('nabla.cameraFov')
  vr.clear()
  expect(storage.getItem('nabla.cameraFov')).toBe('12')
  expect(storage.getItem('nabla.settings.headset.cameraFov')).toBeNull()
  expect(storage.getItem('token')).toBe('keep')
})
it('page scope selects only future runtimes and retains explicitly injected storage', async () => {
  vi.resetModules()
  const { installSettingsScope, pageSettingsStorage, createSettingsStore } =
    await import('../src/runtime/settings-scope.js')
  const storage = memory({ 'nabla.cameraFov': '12' })
  installSettingsScope('pc', storage)
  const a = createSettingsStore({ storage })
  installSettingsScope('headset-pc', storage)
  pageSettingsStorage().setItem('nabla.cameraFov', '33')
  expect(storage.getItem('nabla.settings.headset-pc.cameraFov')).toBe('33')
  expect(a.mode).toBe('pc')
  expect(a.getItem('nabla.cameraFov')).toBe('12')
})
