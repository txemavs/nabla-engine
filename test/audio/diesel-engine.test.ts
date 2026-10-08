import { describe, expect, it } from 'vitest'
import { AirBrakeHiss, ExhaustBrake } from '../../src/audio/diesel-engine.js'
import { resolveEngineVoice } from '../../src/audio/vehicle-sound.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'

class Param {
  readonly events: { kind: string; value: number; time: number }[] = []
  setValueAtTime(value: number, time: number) {
    this.events.push({ kind: 'set', value, time })
    return this
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.events.push({ kind: 'linear', value, time })
    return this
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    this.events.push({ kind: 'exp', value, time })
    return this
  }
  setTargetAtTime() {
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
  connect() {}
  start() {}
}
class Context {
  currentTime = 0
  createGain() {
    return new Node()
  }
  createOscillator() {
    return new Node()
  }
  createBiquadFilter() {
    return new Node()
  }
}

describe('truck diesel voice', () => {
  it('is an inline-6 with the jake bark and the air brake, from the preset', () => {
    const voice = resolveEngineVoice({ voice: 'diesel' })
    expect(voice.voice).toBe('diesel')
    expect(voice.firing).toHaveLength(6)
    expect(voice.jake).toBe(true)
    expect(voice.airBrake).toBe(true)
    const truck = presetVehicle('white-truck', 'truck')
    expect(truck.vehicle?.audio?.engine?.voice).toBe('diesel')
    expect(truck.vehicle?.powertrain?.torqueNm).toBe(2600)
    expect(truck.vehicle?.powertrain?.powerCv).toBe(530)
  })

  it('barks once when the throttle is lifted and hisses when the brake comes on', () => {
    const context = new Context() as unknown as AudioContext
    const noise = new Node() as unknown as AudioBufferSourceNode
    const jake = new ExhaustBrake(context)
    jake.update(0, true, 1400, 0.8, true)
    expect(jake.barks).toBe(0)
    jake.update(0.1, true, 1400, 0.05, true)
    expect(jake.barks).toBe(1)
    jake.update(0.2, true, 1400, 0.05, true)
    expect(jake.barks).toBe(1)
    const air = new AirBrakeHiss(context, noise)
    air.update(0, true, false, true)
    expect(air.hisses).toBe(0)
    air.update(0.1, true, true, true)
    air.update(0.5, true, false, true)
    expect(air.hisses).toBe(2)
  })
})
