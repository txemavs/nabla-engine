import { expect, it } from 'vitest'
import { musicMayStart } from '../../src/audio/music.js'

it('a host-started track stays silent until the host releases it (start screen confirmed)', () => {
  expect(musicMayStart({ startOn: 'host' }, false)).toBe(false)
  expect(musicMayStart({ startOn: 'host' }, true)).toBe(true)
})

it('a default track starts on the first gesture as before', () => {
  expect(musicMayStart({}, false)).toBe(true)
  expect(musicMayStart({ startOn: 'gesture' }, false)).toBe(true)
})
