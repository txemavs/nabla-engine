import { afterEach, describe, expect, it, vi } from 'vitest'
import { Scene, Vector3 } from 'three'
import { crankPulses, resolveEngineStart } from '../../src/audio/engine-start.js'
import { engineNoteCutoffHz, engineNoteHz } from '../../src/audio/powertrain.js'
import { VehicleAudio } from '../../src/audio/vehicle.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { roadVehicleDefaults } from '../../src/config/simulation.js'
import { createEntity } from '../../src/entity/schema.js'
import { VehicleEffects } from '../../src/runtime/vehicle-effects.js'
import { Simulation } from '../../src/simulation/simulation.js'
import { START_UP_SECONDS } from '../start-up.js'

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
  static last: FakeContext
  readonly nodes: { kind: string; node: FakeNode }[] = []
  readonly destination = new FakeNode()
  readonly sampleRate = 8000
  currentTime = 1
  state = 'running'
  constructor() {
    FakeContext.last = this
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

afterEach(() => vi.unstubAllGlobals())

describe('engine start synthesis', () => {
  it('resolves profiles safely and engages with one click', () => {
    expect(resolveEngineStart()).toEqual({ pitch: 1, gain: 1, idleRpm: 1000 })
    expect(resolveEngineStart({ pitch: Number.NaN, gain: 9, idleRpm: 50 })).toEqual({
      pitch: 1,
      gain: 2,
      idleRpm: 300,
    })
    expect(roadVehicleDefaults.ignitionCrankSeconds).toBeGreaterThanOrEqual(0.15)
    expect(roadVehicleDefaults.ignitionCrankSeconds).toBeLessThanOrEqual(0.3)
    expect(crankPulses(roadVehicleDefaults.ignitionCrankSeconds)).toEqual([0.012])
    expect(crankPulses(0.01)).toEqual([])
  })

  it('schedules the starter crank with no new nodes, and nothing when muted or before unlock', () => {
    const silent = new VehicleAudio()
    silent.engineStart()
    expect(silent.engineStartCount).toBe(0)
    vi.stubGlobal('AudioContext', FakeContext)
    const audio = new VehicleAudio()
    audio.unlock()
    const context = FakeContext.last
    const before = context.nodes.length
    audio.engineStart()
    expect(audio.engineStartCount).toBe(1)
    expect(context.nodes.length).toBe(before)
    const times = context.nodes
      .flatMap((entry) => [...entry.node.gain.events, ...entry.node.frequency.events])
      .map((event) => event.time - context.currentTime)
    expect(Math.max(...times)).toBeGreaterThan(roadVehicleDefaults.ignitionCrankSeconds - 0.05)
    expect(Math.max(...times)).toBeLessThan(roadVehicleDefaults.ignitionCrankSeconds + 0.3)
    // No rising starter whine: frequency is set, never ramped up.
    const ramps = context.nodes.flatMap((entry) =>
      entry.node.frequency.events.filter((event) => event.kind === 'linear'),
    )
    expect(ramps).toEqual([])
    const early = times.filter((offset) => offset < 0.05)
    expect(early.length).toBeGreaterThan(0)
    audio.setEnabled(false)
    audio.engineStart()
    expect(audio.engineStartCount).toBe(1)
  })

  it('ends the catch on the idle engine note, where the engine voice takes over', () => {
    vi.stubGlobal('AudioContext', FakeContext)
    for (const idleRpm of [1000, 750]) {
      const audio = new VehicleAudio()
      audio.unlock()
      const context = FakeContext.last
      audio.engineStart({ pitch: idleRpm / 1000, idleRpm })
      const glides = context.nodes.flatMap((entry) =>
        entry.node.frequency.events.filter((event) => event.kind === 'exp'),
      )
      expect(glides.length).toBeGreaterThan(0)
      const last = glides.reduce((a, b) => (b.time > a.time ? b : a))
      expect(last.value).toBeCloseTo(engineNoteHz(idleRpm))
      expect(last.time - context.currentTime).toBeGreaterThan(
        roadVehicleDefaults.ignitionCrankSeconds,
      )
    }
  })

  it('idle reads as a low-revving engine, not a sub-bass rumble', () => {
    // Before: rpm / 30 with a 30 Hz floor, so a 900 rpm idle sat on the 30 Hz floor.
    expect(engineNoteHz(roadVehicleDefaults.idleRpm)).toBeCloseTo(41.7, 1)
    expect(engineNoteHz(750)).toBeGreaterThan(30)
    expect(engineNoteCutoffHz(roadVehicleDefaults.idleRpm)).toBeGreaterThan(380)
    // Rising rpm still rises in pitch and brightness.
    expect(engineNoteHz(6900)).toBeGreaterThan(engineNoteHz(3000))
    expect(engineNoteCutoffHz(6900, 1)).toBeGreaterThan(engineNoteCutoffHz(1000))
  })
})

describe('engine start from the simulation', () => {
  for (const [entity, catalog] of [
    ['s3', 'car'],
    ['a3', 'a3'],
    ['truck', 'white-truck'],
  ] as const) {
    it(`${entity}: no starter sound; the engine idles through the needle sweep, in P`, () => {
      const floor = createEntity('floor', 'box', [0, -0.5, 0])
      floor.size = [400, 1, 400]
      const document = {
        version: 1 as const,
        name: 'Start',
        entities: [
          floor,
          createEntity('spawn', 'spawn', [6, 1, 0]),
          presetVehicle(catalog, entity, [0, 1.45, 0]),
        ],
      }
      const sim = new Simulation(document)
      const starts: unknown[] = []
      const engine: number[] = []
      const stub = new Proxy(
        {
          engineStart: (sound: unknown) => starts.push(sound),
          powertrain: (rpm: number) => engine.push(rpm),
        },
        { get: (target, key) => (key in target ? (target as never)[key] : () => {}) },
      ) as unknown as VehicleAudio
      const effects = new VehicleEffects(new Scene(), stub)
      const eye = new Vector3()
      try {
        for (let i = 0; i < 120; i++) sim.step(1 / 60)
        sim.startInVehicle(entity)
        const phases: string[] = []
        const sweeping: number[] = []
        for (let i = 0; i < Math.ceil((START_UP_SECONDS + 1) * 60); i++) {
          sim.step(1 / 60)
          effects.updateAudio(sim, document, eye)
          const info = sim.vehicleInfo(entity)
          if (phases.at(-1) !== info.ignition) phases.push(info.ignition)
          // No starter sound (Txema 2026-10-09).
          expect(starts).toHaveLength(0)
          // While cranking the engine note is silent.
          if (info.ignition === 'cranking') expect(engine.at(-1)).toBe(0)
          if (info.ignition === 'cranking') expect(info.gaugeSweep).toBe(0)
          // During the sweep the engine has caught and its note is already playing.
          if (info.ignition === 'sweep') sweeping.push(engine.at(-1)!)
          expect(info.gear).toBe(0)
          expect(info.parked).toBe(true)
        }
        expect(phases).toEqual(['cranking', 'sweep', 'running'])
        expect(starts).toHaveLength(0)
        expect(sweeping.length).toBeGreaterThan(30)
        expect(Math.min(...sweeping)).toBeGreaterThan(0)
        // The catch flares above idle and settles while the needles sweep.
        expect(sweeping[0]).toBeGreaterThan(sweeping.at(-1)!)
        const idle =
          presetVehicle(catalog, entity).vehicle!.powertrain?.idleRpm ?? roadVehicleDefaults.idleRpm
        expect(idle).toBe(entity === 'truck' ? 750 : 1000)
        // Settled to idle after the catch: about 1,000 rpm for the cars, 750 for the truck.
        expect(engine.at(-1)!).toBeGreaterThan(idle * 0.9)
        expect(engine.at(-1)!).toBeLessThan(idle * 1.15)
      } finally {
        effects.dispose()
        sim.dispose()
      }
    })
  }
})
