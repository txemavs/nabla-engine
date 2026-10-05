import { afterEach, describe, expect, it, vi } from 'vitest'
import { gunshotSeconds } from '../../src/audio/gunshot.js'
import { VehicleAudio } from '../../src/audio/vehicle.js'

/** Minimal Web Audio double that records every automation call. */
class FakeParam {
  value = 0
  readonly events: { kind: string; value: number; time: number }[] = []
  private record(kind: string, value: number, time: number) {
    this.events.push({ kind, value, time })
    return this
  }
  setValueAtTime(value: number, time: number) {
    return this.record('set', value, time)
  }
  linearRampToValueAtTime(value: number, time: number) {
    return this.record('linear', value, time)
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    return this.record('exp', value, time)
  }
  setTargetAtTime(value: number, time: number) {
    return this.record('target', value, time)
  }
  cancelScheduledValues() {
    return this
  }
}
class FakeNode {
  readonly gain = new FakeParam()
  readonly frequency = new FakeParam()
  readonly Q = new FakeParam()
  type = ''
  buffer: unknown
  loop = false
  connect() {}
  start() {}
}
class FakeContext {
  static instances: FakeContext[] = []
  readonly nodes: { kind: string; node: FakeNode }[] = []
  readonly destination = new FakeNode()
  readonly sampleRate = 8000
  currentTime = 1
  state = 'running'
  constructor() {
    FakeContext.instances.push(this)
  }
  private make(kind: string) {
    const node = new FakeNode()
    this.nodes.push({ kind, node })
    return node
  }
  createBuffer(_channels: number, length: number) {
    return { getChannelData: () => new Float32Array(length) }
  }
  createBufferSource() {
    return this.make('source')
  }
  createGain() {
    return this.make('gain')
  }
  createBiquadFilter() {
    return this.make('filter')
  }
  createOscillator() {
    return this.make('oscillator')
  }
  resume() {
    return Promise.resolve()
  }
  close() {
    return Promise.resolve()
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  FakeContext.instances = []
})

function audioWithContext() {
  vi.stubGlobal('AudioContext', FakeContext)
  const audio = new VehicleAudio()
  audio.unlock()
  return { audio, context: FakeContext.instances[FakeContext.instances.length - 1] }
}

describe('sidearm gunshot synthesis', () => {
  it('plays once per shot and nothing before unlock, while muted or while suspended', () => {
    const silent = new VehicleAudio()
    silent.gunshot()
    expect(silent.gunshotCount).toBe(0)

    const { audio, context } = audioWithContext()
    const before = context.nodes.length
    audio.gunshot()
    audio.gunshot()
    expect(audio.gunshotCount).toBe(2)
    // Shots are only automation: rapid fire never creates nodes.
    expect(context.nodes.length).toBe(before)
    audio.setSuspended(true)
    audio.gunshot()
    audio.setSuspended(false)
    audio.setEnabled(false)
    audio.gunshot()
    expect(audio.gunshotCount).toBe(2)
  })

  it('is a sharp transient: instant attack, loud crack, decayed within the tail length', () => {
    const { audio, context } = audioWithContext()
    const gains = () =>
      context.nodes
        .filter((entry) => entry.kind === 'gain')
        .map((entry) => entry.node.gain.events)
        .filter((events) => events.length > 0)
    expect(gains()).toHaveLength(0)
    audio.gunshot()
    const scheduled = gains()
    // Crack, boom, thump and tail each get their own envelope.
    expect(scheduled.length).toBeGreaterThanOrEqual(4)
    const peaks = scheduled.flat().filter((event) => event.kind === 'linear')
    expect(Math.max(...peaks.map((event) => event.value))).toBeGreaterThan(0.3)
    const attack = Math.min(...peaks.map((event) => event.time)) - context.currentTime
    expect(attack).toBeLessThan(0.005)
    const end = Math.max(...scheduled.flat().map((event) => event.time)) - context.currentTime
    expect(end).toBeGreaterThan(0.2)
    expect(end).toBeLessThanOrEqual(gunshotSeconds + 0.01)
    // Envelopes always settle to silence.
    for (const events of scheduled) expect(events[events.length - 1].value).toBe(0)
  })
})
