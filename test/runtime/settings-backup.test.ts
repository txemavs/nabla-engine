import { expect, it } from 'vitest'
import {
  applySettingsBackup,
  exportSettingsBackup,
  parseSettingsBackup,
  restoreSettingsDefaults,
  type PreferenceStorage,
} from '../../src/runtime/settings-backup.js'
import { defaultUsbSettings } from '../../src/runtime/usb/controllers.js'
class Memory implements PreferenceStorage {
  data = new Map<string, string>()
  fail = ''
  constructor(values: Record<string, string> = {}) {
    this.data = new Map(Object.entries(values))
  }
  get length() {
    return this.data.size
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null
  }
  getItem(k: string) {
    return this.data.get(k) ?? null
  }
  setItem(k: string, v: string) {
    if (this.fail === k) {
      this.fail = ''
      throw new Error('quota')
    }
    this.data.set(k, v)
  }
  removeItem(k: string) {
    this.data.delete(k)
  }
}
it('exports managed preferences from both stores plus display options without scenes, caches or tokens', () => {
  const local = new Memory({
      'nabla.cameraFov': '20',
      'nabla.usb.controllers.v1': JSON.stringify(defaultUsbSettings()),
      'nabla.terrain.cache': 'terrain',
      token: 'secret',
      'nabla.scene.v1': 'scene',
    }),
    session = new Memory({ 'nabla.actionCam': 'true' })
  const backup = exportSettingsBackup(
    local,
    session,
    '?quality=mobile&fps=60&tile=1/2&token=secret',
  )
  expect(Object.keys(backup.local)).toEqual(['nabla.cameraFov', 'nabla.usb.controllers.v1'])
  expect(backup.session).toEqual({ 'nabla.actionCam': 'true' })
  expect(backup.query).toEqual({ quality: 'mobile', fps: '60' })
  expect(parseSettingsBackup(JSON.stringify(backup))).toEqual(backup)
})
it('merges by default, can replace deliberately and preserves location and unrelated storage', () => {
  const l = new Memory({ 'nabla.cameraFov': '5', 'nabla.bodycam': 'false', token: 'secret' }),
    s = new Memory()
  const copy = exportSettingsBackup(new Memory({ 'nabla.cameraFov': '25' }), s, '?scale=0.8')
  let query = applySettingsBackup(copy, l, s, '?tile=1/2&fps=90')
  expect(l.getItem('nabla.bodycam')).toBe('false')
  expect(new URLSearchParams(query).get('fps')).toBe('90')
  query = applySettingsBackup(copy, l, s, '?tile=1/2&fps=90', true)
  expect(l.getItem('nabla.bodycam')).toBe(null)
  expect(l.getItem('token')).toBe('secret')
  expect(new URLSearchParams(query).get('fps')).toBe(null)
  expect(new URLSearchParams(query).get('tile')).toBe('1/2')
})
it('restores defaults preserving calibrated USB/XR unless explicitly included', () => {
  const l = new Memory({
      'nabla.cameraFov': '20',
      'nabla.usb.controllers.v1': 'usb',
      'nabla.xr.calibration.v5': 'hands',
      'nabla.terrain.cache': 'keep',
    }),
    s = new Memory({ 'nabla.actionCam': 'true' })
  const query = restoreSettingsDefaults(l, s, '?tile=1/2&quality=mobile&scale=0.5')
  expect(l.getItem('nabla.usb.controllers.v1')).toBe('usb')
  expect(l.getItem('nabla.xr.calibration.v5')).toBe('hands')
  expect(l.getItem('nabla.cameraFov')).toBe(null)
  expect(s.length).toBe(0)
  expect(query).toBe('tile=1%2F2')
  restoreSettingsDefaults(l, s, '', true)
  expect([...l.data.keys()]).toEqual(['nabla.terrain.cache'])
})
it('validates the whole file before writes and rolls back both stores on failed imports', () => {
  const local = new Memory({ 'nabla.cameraFov': '10' }),
    session = new Memory({ 'nabla.actionCam': 'false' }),
    backup = exportSettingsBackup(
      new Memory({ 'nabla.cameraFov': '25', 'nabla.audioMix': '{}' }),
      new Memory({ 'nabla.actionCam': 'true' }),
      '',
    )
  local.fail = 'nabla.audioMix'
  expect(() => applySettingsBackup(backup, local, session, '')).toThrow('quota')
  expect(local.getItem('nabla.cameraFov')).toBe('10')
  expect(local.getItem('nabla.audioMix')).toBe(null)
  expect(session.getItem('nabla.actionCam')).toBe('false')
  const invalid = { ...backup, local: { token: 'oops' } }
  expect(() => applySettingsBackup(invalid, local, session, '')).toThrow()
  expect(local.getItem('nabla.cameraFov')).toBe('10')
  expect(() =>
    parseSettingsBackup(JSON.stringify({ ...backup, local: { 'nabla.usb.controllers.v1': '{}' } })),
  ).toThrow()
  expect(() => parseSettingsBackup(JSON.stringify({ ...backup, version: 2 }))).toThrow()
})
