import { describe, expect, it } from 'vitest'
import { Scene, Vector3 } from 'three'
import {
  inlineFiringAngles,
  inlinePulseWeights,
  overrunBurbleDefaults,
  OverrunBurble,
} from '../../src/audio/inline-engine.js'
import {
  firingIntervals,
  firingPulseHarmonics,
  harmonicMagnitudes,
} from '../../src/audio/v4-engine.js'
import { Powertrain } from '../../src/audio/powertrain.js'
import {
  resolveEngineVoice,
  resolveVehicleSound,
  type ResolvedEngineVoice,
} from '../../src/audio/vehicle-sound.js'
import type { VehicleAudio } from '../../src/audio/vehicle.js'
import { presetVehicle, vehiclePresets } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import { VehicleEffects } from '../../src/runtime/vehicle-effects.js'
import { Simulation, idleInput } from '../../src/simulation/simulation.js'
import { finishStartUp } from '../start-up.js'

class Param {
  value = 0
  readonly targets: { value: number; time: number }[] = []
  readonly values: { value: number; time: number }[] = []
  setTargetAtTime(value: number, time: number) {
    this.targets.push({ value, time })
    return this
  }
  setValueAtTime(value: number, time: number) {
    this.values.push({ value, time })
    return this
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.values.push({ value, time })
    return this
  }
  exponentialRampToValueAtTime() {
    return this
  }
  cancelScheduledValues() {
    return this
  }
}
class Node {
  readonly gain = new Param()
  readonly frequency = new Param()
  readonly Q = new Param()
  type = ''
  curve: unknown
  oversample = ''
  connect() {}
  start() {}
  setPeriodicWave() {}
}
class Context {
  readonly nodes: Node[] = []
  readonly destination = new Node()
  readonly sampleRate = 8000
  private make() {
    const node = new Node()
    this.nodes.push(node)
    return node
  }
  createGain() {
    return this.make()
  }
  createBiquadFilter() {
    return this.make()
  }
  createOscillator() {
    return this.make()
  }
  createWaveShaper() {
    return this.make()
  }
  createPeriodicWave() {
    return {}
  }
}
const noise = { connect() {} } as unknown as AudioBufferSourceNode
const car = () => presetVehicle('car', 's3').vehicle!

describe('refined inline voice', () => {
  it('fires evenly: an inline-4 every 180°, an inline-5 every 144°', () => {
    expect(inlineFiringAngles(4)).toEqual([0, 180, 360, 540])
    expect(firingIntervals(inlineFiringAngles(5))).toEqual([144, 144, 144, 144, 144])
    expect(() => inlineFiringAngles(0)).toThrow()
  })

  it('the five-cylinder warble: uneven pulses add half-orders an even five does not have', () => {
    const angles = inlineFiringAngles(5)
    expect(inlinePulseWeights(4, 0.3)).toEqual([1, 1, 1, 1])
    const offOrder = (weights: number[]) => {
      const m = harmonicMagnitudes(firingPulseHarmonics(angles, 30, 0.07, weights))
      const total = m.reduce((sum, value) => sum + value * value, 0)
      const off = m.reduce((sum, value, k) => sum + (k % 5 === 0 ? 0 : value * value), 0)
      return off / total
    }
    expect(offOrder(inlinePulseWeights(5, 0))).toBeLessThan(1e-6)
    expect(offOrder(inlinePulseWeights(5, 0.14))).toBeGreaterThan(0.005)
  })
})

describe('car sound selection per engine mode', () => {
  it('the S3 is a calm inline-4 in Normal and the warbling five in Bestia', () => {
    const audio = car().audio
    const normal = resolveVehicleSound(audio, 'normal').engine
    const wild = resolveVehicleSound(audio, 'beast').engine
    expect(normal).toMatchObject({ voice: 'inline', firing: [0, 180, 360, 540], blowOff: 0 })
    expect(normal.burble).toBe(0)
    expect(normal.volume).toBeLessThan(1)
    expect(wild).toMatchObject({ voice: 'inline', firing: [0, 144, 288, 432, 576] })
    expect(wild.burble).toBeGreaterThan(0)
    expect(wild.burble).toBeLessThan(0.5) // occasional, not on every lift
    expect(wild.turboWhistle).toBeLessThan(1)
    expect(wild.blowOff).toBeLessThan(0.5)
    // No mode (older callers): the `engine` voice, which is the Normal one.
    expect(resolveVehicleSound(audio).engine).toEqual(normal)
  })

  it('the bike keeps its V4 and the other vehicles their note in either mode', () => {
    const bike = presetVehicle('vfr800', 'bike').vehicle!
    for (const mode of ['normal', 'beast'] as const) {
      expect(resolveVehicleSound(bike.audio, mode).engine).toEqual({
        voice: 'v4',
        firing: [0, 90, 270, 540],
        volume: 0.8,
      })
      for (const preset of vehiclePresets().filter(
        (p) => !['car', 'vfr800', 'white-truck'].includes(p.id),
      ))
        expect(resolveVehicleSound(preset.vehicle.audio, mode).engine.voice).toBe('note')
      expect(
        resolveVehicleSound(presetVehicle('white-truck', 'truck').vehicle!.audio, mode).engine
          .voice,
      ).toBe('diesel')
    }
  })
})

describe('inline voice in the powertrain', () => {
  const play = (_engine: ResolvedEngineVoice, random = () => 0.99) => {
    const context = new Context()
    const powertrain = new Powertrain(context as unknown as AudioContext, noise, random)
    return { context, powertrain }
  }

  it('plays the inline voice with a subdued turbo whistle', () => {
    const wild = resolveVehicleSound(car().audio, 'beast').engine
    const loud = play(resolveEngineVoice())
    const soft = play(wild)
    let t = 1
    for (let i = 0; i < 40; i++) {
      t += 0.05
      loud.powertrain.update(t, true, 3000, 1, true, resolveEngineVoice())
      soft.powertrain.update(t, true, 3000, 1, true, wild)
    }
    expect(soft.powertrain.activeVoice).toBe('inline')
    expect(loud.powertrain.activeVoice).toBe('note')
    // The whistle oscillator is the first gain created by the turbo in both graphs: compare the
    // loudest whistle level reached.
    const peak = (context: Context) =>
      Math.max(...context.nodes.flatMap((node) => node.gain.targets.map((e) => e.value)))
    expect(peak(soft.context)).toBeGreaterThan(0)
    expect(peak(loud.context)).toBeGreaterThan(0)
  })

  it('burbles occasionally on a high-rpm lift, never on the throttle or in Normal', () => {
    const d = overrunBurbleDefaults
    const context = new Context()
    const burble = new OverrunBurble(context as unknown as AudioContext, noise, () => 0)
    let t = 0
    const step = (rpm: number, load: number) => burble.update((t += 0.05), 0.05, rpm, load, 0.35)
    for (let i = 0; i < 40; i++) step(6000, 1)
    expect(burble.bursts).toBe(0) // on the throttle: nothing
    step(6000, 0)
    expect(burble.bursts).toBe(1) // lift at high rpm (random 0 < chance)
    for (let i = 0; i < 4; i++) step(6000, 1)
    step(6000, 0)
    expect(burble.bursts).toBe(1) // within the cooldown
    for (let i = 0; i < d.cooldownSeconds / 0.05 + 2; i++) step(6000, 1)
    step(2500, 0)
    expect(burble.bursts).toBe(1) // low rpm lift
    // A chance that fails leaves it silent.
    const quiet = new OverrunBurble(context as unknown as AudioContext, noise, () => 0.9)
    quiet.update(1, 0.05, 6000, 1, 0.35)
    quiet.update(1.05, 0.05, 6000, 0, 0.35)
    expect(quiet.bursts).toBe(0)
    // Normal mode (burble 0) builds no burble chain at all.
    const normal = resolveVehicleSound(car().audio, 'normal').engine
    const calm = play(normal, () => 0)
    const before = calm.context.nodes.length
    calm.powertrain.update(1, true, 4500, 1, true, normal)
    const built = calm.context.nodes.length
    calm.powertrain.update(1.05, true, 4500, 0, true, normal)
    expect(calm.context.nodes.length).toBe(built)
    expect(built).toBeGreaterThan(before)
  })
})

describe('car voice from the simulation', () => {
  it('the S3 drives its audio with the Normal four, then the five after J/B selects Bestia', () => {
    const floor = createEntity('floor', 'box', [0, -0.5, -4000])
    floor.size = [10000, 1, 10000]
    const document = {
      version: 1 as const,
      name: 'S3',
      entities: [
        floor,
        createEntity('spawn', 'spawn', [5, 1, 0]),
        presetVehicle('car', 's3', [0, 0.62, 0]),
      ],
    }
    const sim = new Simulation(document)
    for (let i = 0; i < 120; i++) sim.step(1 / 60)
    sim.startInVehicle('s3')
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
      const run = () => {
        voices.length = 0
        for (let i = 0; i < 20; i++) {
          sim.step(1 / 60)
          effects.updateAudio(sim, document, new Vector3())
        }
        return voices.map((voice) => voice?.firing.length)
      }
      expect(run().every((n) => n === 4)).toBe(true)
      sim.setEngineMode('s3', 'beast')
      expect(run().every((n) => n === 5)).toBe(true)
    } finally {
      effects.dispose()
      sim.dispose()
    }
  })
})
