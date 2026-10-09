import { describe, expect, it, vi } from 'vitest'
import {
  AudioMixer,
  audioBus,
  attachAudioBuses,
  engineBusTrim,
  defaultAudioMix,
  normalizeAudioMix,
  readAudioMix,
  sliderGain,
  writeAudioMix,
} from '../../src/audio/mixer.js'
import { BackgroundMusic, pickMusicSource } from '../../src/audio/music.js'

class FakeGain {
  readonly gain = {
    value: 1,
    setTargetAtTime: (value: number) => {
      this.gain.value = value
    },
  }
  readonly targets: unknown[] = []
  connect(target: unknown) {
    this.targets.push(target)
  }
}

function fakeContext() {
  const destination = { name: 'speakers' }
  return {
    destination,
    currentTime: 0,
    createGain: () => new FakeGain(),
    createMediaElementSource: () => new FakeGain(),
  } as unknown as AudioContext
}

describe('audio mixer', () => {
  it('routes engine and music under master, effects to master, and falls back to speakers', () => {
    const bare = fakeContext()
    expect(audioBus(bare, 'engine')).toBe(bare.destination)
    const context = fakeContext()
    const buses = attachAudioBuses(context)
    expect((buses.master as unknown as FakeGain).targets).toEqual([context.destination])
    expect((buses.engine as unknown as FakeGain).targets).toEqual([buses.master])
    expect((buses.music as unknown as FakeGain).targets).toEqual([buses.master])
    expect(audioBus(context, 'sfx')).toBe(buses.master)
    expect(audioBus(context, 'engine')).toBe(buses.engine)
  })

  it('applies slider levels and the music mute to the bus gains', () => {
    const context = fakeContext()
    const mixer = new AudioMixer({ master: 0.8 })
    mixer.attach(context)
    const buses = attachAudioBuses(context)
    expect(buses.master.gain.value).toBeCloseTo(sliderGain(0.8))
    expect(buses.engine.gain.value).toBeCloseTo(sliderGain(1) * engineBusTrim)
    expect(buses.music.gain.value).toBeCloseTo(sliderGain(defaultAudioMix.music))
    mixer.set({ engine: 0.5, musicMuted: true })
    expect(buses.engine.gain.value).toBeCloseTo(0.25 * engineBusTrim)
    expect(buses.music.gain.value).toBe(0)
  })

  it('clamps junk and persists the mix', () => {
    expect(normalizeAudioMix({ master: 3, engine: Number.NaN })).toMatchObject({
      master: 1,
      engine: 1,
    })
    const data = new Map<string, string>()
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    }
    expect(readAudioMix(storage)).toBeUndefined()
    writeAudioMix(storage, { master: 0.7, engine: 0.4, music: 0.2, musicMuted: true })
    expect(readAudioMix(storage)).toEqual({
      master: 0.7,
      engine: 0.4,
      music: 0.2,
      musicMuted: true,
    })
  })
})

describe('background music', () => {
  it('picks the first playable encoding', () => {
    const sources = [
      { url: '/m.ogg', type: 'audio/ogg; codecs=opus' },
      { url: '/m.m4a', type: 'audio/mp4' },
    ]
    expect(pickMusicSource(sources, (t) => (t === 'audio/mp4' ? 'maybe' : ''))?.url).toBe('/m.m4a')
    expect(pickMusicSource(sources, () => ''))?.toBeUndefined()
  })

  it('creates the element only on start, loops it, and pauses while hidden or stopped', () => {
    let created = 0
    const element = {
      src: '',
      loop: false,
      preload: 'none',
      crossOrigin: null as string | null,
      paused: true,
      canPlayType: () => 'probably',
      play() {
        element.paused = false
        return Promise.resolve()
      },
      pause() {
        element.paused = true
      },
    }
    const music = new BackgroundMusic({ sources: [{ url: '/m.ogg', type: 'audio/ogg' }] }, () => {
      created++
      return element as unknown as HTMLAudioElement
    })
    expect(created).toBe(0)
    const context = fakeContext()
    music.start(context, attachAudioBuses(context).music)
    expect(created).toBe(1)
    expect(element.src).toBe('/m.ogg')
    expect(element.loop).toBe(true)
    expect(music.playing).toBe(true)
    music.setHidden(true)
    expect(music.playing).toBe(false)
    music.setHidden(false)
    expect(music.playing).toBe(true)
    music.stop()
    expect(music.playing).toBe(false)
    music.start(context, attachAudioBuses(context).music)
    expect(created).toBe(1)
    expect(music.playing).toBe(true)
  })

  it('fades out, stays off through gestures and mix changes, and restarts from the start', () => {
    vi.useFakeTimers()
    try {
      const element = {
        src: '',
        loop: false,
        preload: 'none',
        crossOrigin: null as string | null,
        paused: true,
        currentTime: 0,
        canPlayType: () => 'probably',
        play() {
          element.paused = false
          return Promise.resolve()
        },
        pause() {
          element.paused = true
        },
      }
      const music = new BackgroundMusic(
        { sources: [{ url: '/m.ogg', type: 'audio/ogg' }] },
        () => element as unknown as HTMLAudioElement,
      )
      const context = fakeContext()
      const bus = attachAudioBuses(context).music
      music.start(context, bus)
      element.currentTime = 42
      music.fadeOut(3.5)
      // Still audible while the fade runs, even if a gesture or the mix re-syncs it.
      music.start(context, bus)
      expect(music.playing).toBe(true)
      vi.advanceTimersByTime(3600)
      expect(music.playing).toBe(false)
      expect(element.currentTime).toBe(0)
      music.start(context, bus)
      expect(music.playing).toBe(false)
      music.restart()
      expect(music.playing).toBe(true)
      expect(music.halted).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('never starts a track faded out before it began', () => {
    const element = {
      src: '',
      loop: false,
      preload: 'none',
      crossOrigin: null as string | null,
      paused: true,
      canPlayType: () => 'probably',
      play() {
        element.paused = false
        return Promise.resolve()
      },
      pause() {
        element.paused = true
      },
    }
    const music = new BackgroundMusic(
      { sources: [{ url: '/m.ogg', type: 'audio/ogg' }] },
      () => element as unknown as HTMLAudioElement,
    )
    music.fadeOut(3)
    const context = fakeContext()
    music.start(context, attachAudioBuses(context).music)
    expect(music.playing).toBe(false)
  })
})
