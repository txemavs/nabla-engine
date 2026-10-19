import { expect, it, vi } from 'vitest'
import { musicMayStart } from '../../src/audio/music.js'
import { VehicleAudio } from '../../src/audio/vehicle.js'

it('a host-started track stays silent until the host releases it (start screen confirmed)', () => {
  expect(musicMayStart({ startOn: 'host' }, false)).toBe(false)
  expect(musicMayStart({ startOn: 'host' }, true)).toBe(true)
})

it('a default track starts on the first gesture as before', () => {
  expect(musicMayStart({}, false)).toBe(true)
  expect(musicMayStart({ startOn: 'gesture' }, false)).toBe(true)
})

it('a host-started track keeps every AudioContext call until the host starts it', () => {
  let created = 0
  vi.stubGlobal(
    'AudioContext',
    class {
      constructor() {
        created++
        throw new Error('no audio in tests')
      }
    },
  )
  try {
    const audio = new VehicleAudio()
    audio.setMusic({ sources: [{ url: 'intro.ogg', type: 'audio/ogg' }], startOn: 'host' })
    // Loading and pre-ENTER gestures: no context is created (no browser autoplay warnings).
    audio.prepare()
    audio.unlock()
    audio.setEnabled(true)
    expect(created).toBe(0)
    // The host's start (ENTER click) is the first audio call.
    audio.releaseMusic()
    audio.unlock()
    expect(created).toBe(1)
  } finally {
    vi.unstubAllGlobals()
  }
})
