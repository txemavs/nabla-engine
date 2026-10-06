import { afterEach, describe, expect, it, vi } from 'vitest'
import { Scene, Vector3 } from 'three'
import { carGearClack, resolveGearClack } from '../../src/audio/gear-clack.js'
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

describe('gear clack synthesis', () => {
  it('resolves partial and invalid profiles to safe, car-like values', () => {
    expect(resolveGearClack()).toEqual(carGearClack)
    const odd = resolveGearClack({
      clunkHz: Number.NaN,
      gain: 99,
      decaySeconds: -1,
      airSeconds: 0.5,
    })
    expect(odd.clunkHz).toBe(carGearClack.clunkHz)
    expect(odd.gain).toBe(2)
    expect(odd.decaySeconds).toBe(0.02)
    expect(odd.airSeconds).toBe(0.5)
  })

  it('schedules a clack on every request and nothing when muted or before unlock', () => {
    const silent = new VehicleAudio()
    silent.gearChange()
    expect(silent.gearClackCount).toBe(0)

    const { audio, context } = audioWithContext()
    const before = context.nodes.length
    audio.gearChange()
    audio.gearChange()
    expect(audio.gearClackCount).toBe(2)
    // Hits are only automation: no node is created per gear change.
    expect(context.nodes.length).toBe(before)
    audio.setEnabled(false)
    audio.gearChange()
    expect(audio.gearClackCount).toBe(2)
  })

  it('renders a truck profile lower, longer and with an air release compared with the car', () => {
    const truck = presetVehicle('white-truck', 'truck').vehicle!.powertrain!.shift!.clack!
    const peaks = (profile?: typeof truck) => {
      const { audio, context } = audioWithContext()
      audio.gearChange(profile)
      const thump = context.nodes.filter((entry) => entry.kind === 'oscillator').slice(-2)
      const first = thump[0].node.frequency.events.find((event) => event.kind === 'set')!.value
      const gains = context.nodes
        .filter((entry) => entry.kind === 'gain')
        .map((entry) => entry.node.gain.events)
        .filter((events) => events.length > 0)
      const hiss = gains.filter((events) =>
        events.some((e) => e.value > 0.01 && e.kind === 'linear'),
      )
      const lastTime = Math.max(...gains.flat().map((e) => e.time)) - context.currentTime
      return { first, lastTime, gainEvents: gains.length, hiss: hiss.length }
    }
    const car = peaks()
    const heavy = peaks(truck)
    expect(heavy.first).toBeLessThan(car.first / 2)
    expect(heavy.lastTime).toBeGreaterThan(car.lastTime * 3)
    expect(heavy.gainEvents).toBeGreaterThan(car.gainEvents)
  })
})

describe('gear clack events from the simulation', () => {
  function drive(entity: string, catalog: string) {
    const floor = createEntity('floor', 'box', [0, -0.5, -4000])
    floor.size = [10000, 1, 10000]
    const document = {
      version: 1 as const,
      name: 'Clack',
      entities: [
        floor,
        createEntity('spawn', 'spawn', [5, 1, 0]),
        presetVehicle(catalog, entity, [0, 1.45, 0]),
      ],
    }
    const sim = new Simulation(document)
    for (let i = 0; i < 180; i++) sim.step(1 / 60)
    sim.startInVehicle(entity)
    finishStartUp(sim)
    const calls: unknown[] = []
    const audio = { gearChange: (profile: unknown) => calls.push(profile) } as never
    const stub = new Proxy(audio as object, {
      get: (target, key) => (key in target ? (target as never)[key] : () => {}),
    }) as VehicleAudio
    const effects = new VehicleEffects(new Scene(), stub)
    return { sim, effects, document, calls }
  }

  for (const [entity, catalog] of [
    ['s3', 'car'],
    ['truck', 'white-truck'],
  ] as const) {
    it(`${entity}: automatic shifts are silent; D/R engagement clacks once each`, () => {
      const { sim, effects, document, calls } = drive(entity, catalog)
      try {
        const eye = new Vector3()
        const step = (ticks: number) => {
          for (let i = 0; i < ticks; i++) {
            sim.step(1 / 60)
            effects.updateAudio(sim, document, eye)
          }
        }
        // Baseline: nothing plays just because a vehicle was entered.
        step(5)
        expect(calls).toHaveLength(0)
        const start = sim.vehicleInfo(entity)
        sim.setInput({ ...idleInput(), forward: 1 })
        step(60 * 8)
        const accelerated = sim.vehicleInfo(entity)
        // Entered in P: engaging D clacks once. Several automatic upshifts were counted,
        // but none of them clacks.
        expect(start.parked).toBe(true)
        expect(accelerated.gearShifts - start.gearShifts).toBeGreaterThanOrEqual(3)
        expect(accelerated.gearClacks - start.gearClacks).toBe(1)
        expect(calls).toHaveLength(1)
        // Braking downshifts are automatic too; only engaging R clacks, exactly once.
        sim.setInput({ ...idleInput(), forward: -1 })
        step(60 * 40)
        const reversed = sim.vehicleInfo(entity)
        expect(reversed.gear).toBe(-1)
        expect(reversed.gearShifts - accelerated.gearShifts).toBeGreaterThanOrEqual(1)
        expect(reversed.gearClacks - start.gearClacks).toBe(2)
        expect(calls).toHaveLength(2)
        // Selecting drive again after braking to a stop clacks once more.
        sim.setInput({ ...idleInput(), forward: 1 })
        step(60 * 20)
        expect(sim.vehicleInfo(entity).gear).toBeGreaterThan(0)
        expect(calls).toHaveLength(3)
        const profile = presetVehicle(catalog, entity).vehicle!.powertrain!.shift?.clack ?? null
        for (const played of calls) expect(played).toEqual(profile)
        // Truck uses its own heavy profile, the car's falls back to the audio default.
        if (entity === 'truck') expect((calls[0] as { clunkHz: number }).clunkHz).toBeLessThan(80)
      } finally {
        effects.dispose()
        sim.dispose()
      }
    })

    it(`${entity}: a manual shift clacks once while automatic shifts stay silent`, () => {
      const { sim, effects, document, calls } = drive(entity, catalog)
      try {
        const eye = new Vector3()
        const step = (ticks: number) => {
          for (let i = 0; i < ticks; i++) {
            sim.step(1 / 60)
            effects.updateAudio(sim, document, eye)
          }
        }
        step(5)
        sim.setInput({ ...idleInput(), forward: 1 })
        step(60 * 6)
        expect(sim.vehicleInfo(entity).gearShifts).toBeGreaterThanOrEqual(2)
        // Only the P -> D engagement clacked.
        expect(calls).toHaveLength(1)
        sim.shiftVehicle(1)
        step(2)
        expect(sim.vehicleInfo(entity).manualTransmission).toBe(true)
        expect(calls).toHaveLength(2)
        // Manual mode holds the gear; no further sound until another paddle press.
        step(60 * 3)
        expect(calls).toHaveLength(2)
        // A protected (refused) change is silent; whichever direction is accepted clacks once.
        const second = sim.shiftVehicle(-1)
        const message = second.startsWith('Manual') ? second : sim.shiftVehicle(1)
        expect(message).toMatch(/^Manual/)
        step(2)
        expect(calls).toHaveLength(3)
      } finally {
        effects.dispose()
        sim.dispose()
      }
    })
  }

  it('s3 (assets/library/cars/a3/s3.json) at full throttle: one counted shift per gear change, no clack', () => {
    const { sim, effects, document, calls } = drive('s3', 'car')
    try {
      const eye = new Vector3()
      sim.step(1 / 60)
      effects.updateAudio(sim, document, eye)
      sim.setInput({ ...idleInput(), forward: 1 })
      // Leave P first; its D engagement is the one audible change.
      for (let i = 0; i < 60 && sim.vehicleInfo('s3').gear === 0; i++) {
        sim.step(1 / 60)
        effects.updateAudio(sim, document, eye)
      }
      expect(calls).toHaveLength(1)
      let gear = sim.vehicleInfo('s3').gear
      let counted = sim.vehicleInfo('s3').gearShifts
      const clacks = sim.vehicleInfo('s3').gearClacks
      let changes = 0
      for (let i = 0; i < 60 * 40; i++) {
        sim.step(1 / 60)
        effects.updateAudio(sim, document, eye)
        const info = sim.vehicleInfo('s3')
        if (info.gear !== gear) {
          changes++
          expect(info.gearShifts).toBe(counted + 1)
          gear = info.gear
        }
        counted = info.gearShifts
      }
      expect(changes).toBeGreaterThanOrEqual(3)
      expect(counted).toBe(changes + 1)
      expect(sim.vehicleInfo('s3').gearClacks).toBe(clacks)
      expect(calls).toHaveLength(1)
    } finally {
      effects.dispose()
      sim.dispose()
    }
  })
})
