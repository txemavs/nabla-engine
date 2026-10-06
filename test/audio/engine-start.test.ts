import { afterEach, describe, expect, it, vi } from 'vitest'
import { Scene, Vector3 } from 'three'
import { crankPulses, resolveEngineStart } from '../../src/audio/engine-start.js'
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
  it('resolves profiles safely and pulses faster as the starter spins up', () => {
    expect(resolveEngineStart()).toEqual({ pitch: 1, gain: 1 })
    expect(resolveEngineStart({ pitch: Number.NaN, gain: 9 })).toEqual({ pitch: 1, gain: 2 })
    const pulses = crankPulses(roadVehicleDefaults.ignitionCrankSeconds)
    expect(pulses.length).toBeGreaterThan(6)
    expect(pulses.length).toBeLessThan(14)
    expect(pulses[1] - pulses[0]).toBeGreaterThan(pulses.at(-1)! - pulses.at(-2)!)
    expect(pulses.at(-1)!).toBeLessThan(roadVehicleDefaults.ignitionCrankSeconds - 0.1)
  })

  it('schedules a ~1 s start with no new nodes, and nothing when muted or before unlock', () => {
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
    audio.setEnabled(false)
    audio.engineStart()
    expect(audio.engineStartCount).toBe(1)
  })
})

describe('engine start from the simulation', () => {
  for (const [entity, catalog] of [
    ['s3', 'car'],
    ['a3', 'a3'],
    ['truck', 'white-truck'],
  ] as const) {
    it(`${entity}: silent sweep, one starter sound while cranking, then idle in P`, () => {
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
        for (let i = 0; i < Math.ceil((START_UP_SECONDS + 1) * 60); i++) {
          sim.step(1 / 60)
          effects.updateAudio(sim, document, eye)
          const info = sim.vehicleInfo(entity)
          if (phases.at(-1) !== info.ignition) phases.push(info.ignition)
          // While starting the engine note is silent; the starter voice covers the crank.
          if (info.ignition !== 'running') expect(engine.at(-1)).toBe(0)
          expect(info.gear).toBe(0)
          expect(info.parked).toBe(true)
        }
        expect(phases).toEqual(['sweep', 'cranking', 'running'])
        expect(starts).toHaveLength(1)
        const idle = presetVehicle(catalog, entity).vehicle!.powertrain?.idleRpm ?? 900
        expect((starts[0] as { pitch: number }).pitch).toBeCloseTo(idle / 900)
        // Settled to idle after the catch.
        expect(engine.at(-1)!).toBeGreaterThan(idle * 0.9)
        expect(engine.at(-1)!).toBeLessThan(idle * 1.15)
      } finally {
        effects.dispose()
        sim.dispose()
      }
    })
  }
})
