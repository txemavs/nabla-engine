import { afterEach, describe, expect, it, vi } from 'vitest'
import { Scene, Vector3 } from 'three'
import { gearClickDefaults, resolveGearClickVolume } from '../../src/audio/gear-click.js'
import { resolveVehicleSound } from '../../src/audio/vehicle-sound.js'
import { VehicleAudio } from '../../src/audio/vehicle.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { VehicleEffects } from '../../src/runtime/vehicle-effects.js'
import { createEntity } from '../../src/entity/schema.js'
import { Simulation, idleInput } from '../../src/simulation/simulation.js'
import { finishStartUp } from '../start-up.js'

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
const gainEvents = (context: FakeContext) =>
  context.nodes.filter((entry) => entry.kind === 'gain').map((entry) => entry.node.gain.events)

describe('per-vehicle sound options', () => {
  it('defaults to the road-car sound and clamps the volume', () => {
    expect(resolveVehicleSound()).toEqual({ turbo: true, gearShift: 'clack', gearShiftVolume: 1 })
    expect(resolveVehicleSound({ turbo: false, gearShift: { sound: 'click', volume: 9 } })).toEqual(
      { turbo: false, gearShift: 'click', gearShiftVolume: 2 },
    )
    expect(resolveGearClickVolume({ volume: Number.NaN })).toBe(1)
    expect(resolveGearClickVolume({ volume: -1 })).toBe(0)
  })
})

describe('gear click synthesis', () => {
  it('schedules one short, quiet transient per click without creating nodes', () => {
    const silent = new VehicleAudio()
    silent.gearClick()
    expect(silent.gearClickCount).toBe(0)
    const { audio, context } = audioWithContext()
    const before = context.nodes.length
    audio.gearClick()
    expect(audio.gearClickCount).toBe(1)
    expect(context.nodes.length).toBe(before)
    const click = gainEvents(context).find((events) => events.some((e) => e.kind === 'linear'))!
    const peak = Math.max(...click.map((e) => e.value))
    const length = Math.max(...click.map((e) => e.time)) - context.currentTime
    expect(peak).toBeCloseTo(gearClickDefaults.peak, 9)
    // Far quieter than the car clack's 0.16 thump, and a few tens of milliseconds long.
    expect(peak).toBeLessThan(0.16 / 4)
    expect(length).toBeGreaterThan(0.01)
    expect(length).toBeLessThan(0.05)
    audio.setEnabled(false)
    audio.gearClick()
    expect(audio.gearClickCount).toBe(1)
  })

  it('keeps the turbo silent when the vehicle has none', () => {
    const positiveGains = (turbo: boolean) => {
      const { audio, context } = audioWithContext()
      for (let i = 0; i < 30; i++) {
        context.currentTime += 0.05
        audio.powertrain(3000, 1, { turbo })
      }
      return gainEvents(context).filter((events) =>
        events.some((e) => e.kind === 'target' && e.value > 1e-4),
      ).length
    }
    const withTurbo = positiveGains(true),
      without = positiveGains(false)
    // Engine note only, versus engine note plus turbo whistle and air.
    expect(without).toBe(1)
    expect(withTurbo).toBe(3)
  })
})

describe('gear-change sound from the simulation', () => {
  function drive(catalog: string, id: string, y: number) {
    const floor = createEntity('floor', 'box', [0, -0.5, -4000])
    floor.size = [10000, 1, 10000]
    const document = {
      version: 1 as const,
      name: 'Click',
      entities: [
        floor,
        createEntity('spawn', 'spawn', [5, 1, 0]),
        presetVehicle(catalog, id, [0, y, 0]),
      ],
    }
    const sim = new Simulation(document)
    for (let i = 0; i < 120; i++) sim.step(1 / 60)
    sim.startInVehicle(id)
    finishStartUp(sim)
    const clacks: unknown[] = [],
      clicks: unknown[] = [],
      turbo: boolean[] = []
    const audio = {
      gearChange: (profile: unknown) => clacks.push(profile),
      gearClick: (sound: unknown) => clicks.push(sound),
      powertrain: (_rpm: number, _load: number, options?: { turbo?: boolean }) =>
        turbo.push(options?.turbo ?? true),
    } as never
    const stub = new Proxy(audio as object, {
      get: (target, key) => (key in target ? (target as never)[key] : () => {}),
    }) as VehicleAudio
    const effects = new VehicleEffects(new Scene(), stub)
    const step = (ticks: number) => {
      for (let i = 0; i < ticks; i++) {
        sim.step(1 / 60)
        effects.updateAudio(sim, document, new Vector3())
      }
    }
    return { sim, effects, clacks, clicks, turbo, step }
  }

  it('vfr800: no turbo, one quiet click per gear change, automatic ones included, no clack', () => {
    const { sim, effects, clacks, clicks, turbo, step } = drive('vfr800', 'bike', 0.6)
    try {
      step(5)
      const start = sim.vehicleInfo('bike').gearShifts
      sim.setInput({ ...idleInput(), forward: 1 })
      step(60 * 8)
      const shifts = sim.vehicleInfo('bike').gearShifts - start
      expect(shifts).toBeGreaterThanOrEqual(3)
      expect(clicks).toHaveLength(shifts)
      expect(clicks[0]).toEqual({ volume: 1 })
      expect(clacks).toHaveLength(0)
      expect(turbo.length).toBeGreaterThan(0)
      expect(turbo.every((on) => on === false)).toBe(true)
    } finally {
      effects.dispose()
      sim.dispose()
    }
  })

  it('s3 keeps its turbo and clack-on-engagement only', () => {
    const { sim, effects, clacks, clicks, turbo, step } = drive('car', 's3', 0.62)
    try {
      step(5)
      sim.setInput({ ...idleInput(), forward: 1 })
      step(60 * 8)
      expect(sim.vehicleInfo('s3').gearShifts).toBeGreaterThanOrEqual(3)
      expect(clacks).toHaveLength(1)
      expect(clicks).toHaveLength(0)
      expect(turbo.every((on) => on === true)).toBe(true)
    } finally {
      effects.dispose()
      sim.dispose()
    }
  })
})
