import { afterEach, describe, expect, it, vi } from 'vitest'
import { Scene, Vector3 } from 'three'
import {
  firingIntervals,
  firingPulseHarmonics,
  harmonicMagnitudes,
  v4CycleHz,
  v4FiringAngles,
} from '../../src/audio/v4-engine.js'
import { resolveEngineVoice, resolveVehicleSound } from '../../src/audio/vehicle-sound.js'
import { VehicleAudio } from '../../src/audio/vehicle.js'
import type { ResolvedEngineVoice } from '../../src/audio/vehicle-sound.js'
import { presetVehicle, vehiclePresets } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import { VehicleEffects } from '../../src/runtime/vehicle-effects.js'
import { Simulation, idleInput } from '../../src/simulation/simulation.js'
import { finishStartUp } from '../start-up.js'

describe('V4 firing order from the engine geometry', () => {
  it('90° V4 with a 180° crank fires unevenly: 90-180-270-180', () => {
    const angles = v4FiringAngles(90, 180)
    expect(angles).toEqual([0, 90, 270, 540])
    expect(firingIntervals(angles)).toEqual([90, 180, 270, 180])
    expect(v4FiringAngles()).toEqual(angles)
  })

  it('a 360° crank gives the 90-270 "big bang" pattern, a 180° V with 180° pins fires evenly', () => {
    expect(firingIntervals(v4FiringAngles(90, 360))).toEqual([90, 270, 90, 270])
    expect(firingIntervals(v4FiringAngles(180, 180))).toEqual([180, 180, 180, 180])
  })

  it('always fires four times per 720° cycle', () => {
    for (const [v, pin] of [
      [60, 180],
      [72, 0],
      [90, 270],
      [65, 90],
    ]) {
      const gaps = firingIntervals(v4FiringAngles(v, pin))
      expect(gaps).toHaveLength(4)
      expect(gaps.reduce((a, b) => a + b, 0)).toBeCloseTo(720, 9)
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(0)
    }
    expect(() => v4FiringAngles(Number.NaN, 180)).toThrow()
  })

  it('plays the cycle rate (rpm / 120) as the fundamental', () => {
    expect(v4CycleHz(1200)).toBe(10)
    expect(v4CycleHz(-5)).toBe(0)
  })
})

describe('V4 pulse spectrum', () => {
  const oddEnergy = (angles: number[]) => {
    const m = harmonicMagnitudes(firingPulseHarmonics(angles, 32))
    const total = m.reduce((a, b) => a + b, 0)
    const offFiring = m.filter((_, n) => n % 4 !== 0).reduce((a, b) => a + b, 0)
    return offFiring / total
  }

  it('an even-firing four only has energy at multiples of the firing rate', () => {
    expect(oddEnergy([0, 180, 360, 540])).toBeLessThan(1e-4)
  })

  it('the uneven 90° V4 puts energy below and between the firing harmonics', () => {
    const v4 = oddEnergy(v4FiringAngles(90, 180))
    expect(v4).toBeGreaterThan(0.2)
    const m = harmonicMagnitudes(firingPulseHarmonics(v4FiringAngles(90, 180), 16))
    // The cycle and half-firing orders (1×, 2× cycle) are clearly present.
    expect(m[1]).toBeGreaterThan(0.05 * m[4])
    expect(m[2]).toBeGreaterThan(0.05 * m[4])
  })

  it('returns a PeriodicWave-shaped series and validates its arguments', () => {
    const series = firingPulseHarmonics([0], 8)
    expect(series.real).toHaveLength(9)
    expect(series.imag).toHaveLength(9)
    expect(series.real[0]).toBe(0)
    expect(() => firingPulseHarmonics([0], 0)).toThrow()
    expect(() => firingPulseHarmonics([0], 8, 0.6)).toThrow()
  })
})

describe('engine voice selection', () => {
  it('defaults to the road-car note and resolves the V4 firing from the preset geometry', () => {
    expect(resolveEngineVoice()).toEqual({ voice: 'note', firing: [], volume: 1 })
    expect(resolveEngineVoice({ voice: 'v4' })).toEqual({
      voice: 'v4',
      firing: [0, 90, 270, 540],
      volume: 1,
    })
    expect(resolveEngineVoice({ voice: 'v4', crankpin: 360, volume: 5 })).toEqual({
      voice: 'v4',
      firing: [0, 90, 360, 450],
      volume: 2,
    })
  })

  it('the VFR800 preset asks for the 90°/180° V4; other vehicles but the S3 keep the note', () => {
    const bike = presetVehicle('vfr800', 'bike', [0, 1, 0]).vehicle!
    expect(resolveVehicleSound(bike.audio).engine).toEqual({
      voice: 'v4',
      firing: [0, 90, 270, 540],
      volume: 1,
    })
    // The S3 (`car`) has its own refined inline voices (test/audio/car-engine-voice.test.ts).
    const others = vehiclePresets().filter(
      (preset) => !['vfr800', 'car', 'white-truck'].includes(preset.id),
    )
    expect(others.length).toBeGreaterThan(0)
    for (const preset of others)
      expect(resolveVehicleSound(preset.vehicle.audio).engine.voice).toBe('note')
    expect(
      resolveVehicleSound(presetVehicle('white-truck', 'truck').vehicle?.audio).engine.voice,
    ).toBe('diesel')
  })
})

/** Web Audio double with the nodes the V4 voice needs; `withV4: false` drops them. */
class FakeParam {
  value = 0
  readonly events: { value: number; time: number }[] = []
  setTargetAtTime(value: number, time: number) {
    this.events.push({ value, time })
    return this
  }
  setValueAtTime() {
    return this
  }
  linearRampToValueAtTime() {
    return this
  }
  exponentialRampToValueAtTime() {
    return this
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
  curve: unknown
  oversample = ''
  loop = false
  wave: unknown
  connect() {}
  start() {}
  setPeriodicWave(wave: unknown) {
    this.wave = wave
  }
}
let withV4 = true
class FakeContext {
  static last: FakeContext
  readonly nodes: { kind: string; node: FakeNode }[] = []
  readonly destination = new FakeNode()
  readonly sampleRate = 8000
  readonly waves: { real: Float32Array; imag: Float32Array }[] = []
  currentTime = 1
  state = 'running'
  constructor() {
    FakeContext.last = this
    if (!withV4) {
      ;(this as { createPeriodicWave?: unknown }).createPeriodicWave = undefined
      ;(this as { createWaveShaper?: unknown }).createWaveShaper = undefined
    }
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
  createWaveShaper() {
    return this.make('shaper')
  }
  createPeriodicWave(real: Float32Array, imag: Float32Array) {
    const wave = { real, imag }
    this.waves.push(wave)
    return wave
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
  withV4 = true
})

function play(engine?: ResolvedEngineVoice) {
  vi.stubGlobal('AudioContext', FakeContext)
  const audio = new VehicleAudio()
  audio.unlock()
  const context = FakeContext.last
  for (let i = 0; i < 20; i++) {
    context.currentTime += 0.05
    audio.powertrain(4000, 0.8, { turbo: false, engine })
  }
  return { audio, context }
}

describe('V4 voice in the powertrain', () => {
  const v4 = resolveEngineVoice({ voice: 'v4' })

  it('plays the V4 for a V4 preset with a single periodic wave tracking rpm / 120', () => {
    const { audio, context } = play(v4)
    expect(audio.engineVoice).toBe('v4')
    expect(context.waves).toHaveLength(1)
    expect(context.nodes.some((entry) => entry.kind === 'shaper')).toBe(true)
    const tracked = context.nodes.filter(
      (entry) =>
        entry.kind === 'oscillator' &&
        entry.node.wave &&
        entry.node.frequency.events.some((e) => Math.abs(e.value - 4000 / 120) < 1e-9),
    )
    expect(tracked).toHaveLength(1)
    // No nodes are created per update once the voice exists.
    const before = context.nodes.length
    audio.powertrain(5000, 1, { turbo: false, engine: v4 })
    expect(context.nodes.length).toBe(before)
  })

  it('keeps the road-car note for cars and builds no V4 nodes', () => {
    const { audio, context } = play(resolveEngineVoice())
    expect(audio.engineVoice).toBe('note')
    expect(context.waves).toHaveLength(0)
    expect(context.nodes.some((entry) => entry.kind === 'shaper')).toBe(false)
  })

  it('falls back to the note where the browser cannot build the V4', () => {
    withV4 = false
    const { audio } = play(v4)
    expect(audio.engineVoice).toBe('note')
  })
})

describe('V4 voice from the simulation', () => {
  it('the vfr800 drives its powertrain audio with the V4 voice', () => {
    const floor = createEntity('floor', 'box', [0, -0.5, -4000])
    floor.size = [10000, 1, 10000]
    const document = {
      version: 1 as const,
      name: 'V4',
      entities: [
        floor,
        createEntity('spawn', 'spawn', [5, 1, 0]),
        presetVehicle('vfr800', 'bike', [0, 0.6, 0]),
      ],
    }
    const sim = new Simulation(document)
    for (let i = 0; i < 120; i++) sim.step(1 / 60)
    sim.startInVehicle('bike')
    finishStartUp(sim)
    const voices: (ResolvedEngineVoice | undefined)[] = []
    const audio = {
      powertrain: (_rpm: number, _load: number, options?: { engine?: ResolvedEngineVoice }) =>
        voices.push(options?.engine),
    }
    const stub = new Proxy(audio as object, {
      get: (target, key) => (key in target ? (target as never)[key] : () => {}),
    }) as VehicleAudio
    const effects = new VehicleEffects(new Scene(), stub)
    try {
      sim.setInput({ ...idleInput(), forward: 1 })
      for (let i = 0; i < 30; i++) {
        sim.step(1 / 60)
        effects.updateAudio(sim, document, new Vector3())
      }
      expect(voices.length).toBeGreaterThan(0)
      expect(voices.every((voice) => voice?.voice === 'v4')).toBe(true)
      expect(voices[0]?.firing).toEqual([0, 90, 270, 540])
    } finally {
      effects.dispose()
      sim.dispose()
    }
  })
})
