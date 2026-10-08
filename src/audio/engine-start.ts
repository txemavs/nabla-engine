import { roadVehicleDefaults } from '../config/simulation.js'
import { engineNoteHz } from './powertrain.js'

/**
 * Engine start, fully synthesized: no sample files. A starter motor (filtered sawtooth whose
 * level pulses with every compression stroke), a low "chug" per stroke and a slice of the
 * shared noise for the mechanical rattle, then a louder catch when the engine fires. The
 * engine note itself (see `Powertrain`) takes over from the catch and settles to idle.
 * The nodes are created once; a trigger only schedules envelopes.
 */
export interface EngineStartSound {
  /** Pitch multiplier, 0.4..2. Heavier engines (lower idle rpm) crank lower. */
  pitch?: number
  /** Loudness multiplier, 0..2. */
  gain?: number
  /**
   * Idle speed of the engine being started, rpm (300..2000). The catch fires at the flare above
   * idle and glides down to the idle engine note (`engineNoteHz`), where `Powertrain` takes over.
   */
  idleRpm?: number
}

const SILENT = 0.0001
const clampNumber = (value: number | undefined, fallback: number, low: number, high: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(high, Math.max(low, value))
    : fallback

/** Fill omitted or invalid fields and clamp them to a safe range. */
export function resolveEngineStart(sound?: EngineStartSound | null): Required<EngineStartSound> {
  return {
    pitch: clampNumber(sound?.pitch, 1, 0.4, 2),
    gain: clampNumber(sound?.gain, 1, 0, 2),
    idleRpm: clampNumber(sound?.idleRpm, roadVehicleDefaults.idleRpm, 300, 2000),
  }
}

/** Compression-stroke times of one start, seconds from the trigger. The rate rises as it spins up. */
export function crankPulses(seconds: number, pitch = 1): number[] {
  const pulses: number[] = []
  // Leave the last ~0.15 s for the catch.
  for (let t = 0.04; t < seconds - 0.15;) {
    pulses.push(t)
    const rate = (8 + 3 * Math.min(1, t / Math.max(0.1, seconds - 0.15))) * Math.sqrt(pitch)
    t += 1 / rate
  }
  return pulses
}

export class EngineStart {
  private readonly motor: OscillatorNode
  private readonly motorLevel: GainNode
  private readonly chug: OscillatorNode
  private readonly chugLevel: GainNode
  private readonly rattleBand: BiquadFilterNode
  private readonly rattleLevel: GainNode

  constructor(context: AudioContext, noise: AudioBufferSourceNode) {
    const output = context.createGain()
    output.gain.value = 1
    output.connect(context.destination)

    this.motorLevel = context.createGain()
    this.motorLevel.gain.value = 0
    this.motorLevel.connect(output)
    const motorFilter = context.createBiquadFilter()
    motorFilter.type = 'lowpass'
    motorFilter.frequency.value = 1600
    motorFilter.Q.value = 0.8
    motorFilter.connect(this.motorLevel)
    this.motor = context.createOscillator()
    this.motor.type = 'sawtooth'
    this.motor.frequency.value = 110
    this.motor.connect(motorFilter)
    this.motor.start()

    this.chugLevel = context.createGain()
    this.chugLevel.gain.value = 0
    this.chugLevel.connect(output)
    this.chug = context.createOscillator()
    this.chug.type = 'sine'
    this.chug.frequency.value = 55
    this.chug.connect(this.chugLevel)
    this.chug.start()

    this.rattleLevel = context.createGain()
    this.rattleLevel.gain.value = 0
    this.rattleLevel.connect(output)
    this.rattleBand = context.createBiquadFilter()
    this.rattleBand.type = 'bandpass'
    this.rattleBand.frequency.value = 520
    this.rattleBand.Q.value = 1.2
    this.rattleBand.connect(this.rattleLevel)
    noise.connect(this.rattleBand)
  }

  /** Schedule one start at audio time `time`, lasting `ignitionCrankSeconds`. Silent when not `audible`. */
  trigger(time: number, audible: boolean, sound?: EngineStartSound | null): void {
    if (!audible) return
    const { pitch, gain, idleRpm } = resolveEngineStart(sound)
    const seconds = roadVehicleDefaults.ignitionCrankSeconds
    const end = time + seconds
    const catchAt = end - 0.12
    for (const param of [
      this.motorLevel.gain,
      this.chugLevel.gain,
      this.rattleLevel.gain,
      this.motor.frequency,
      this.chug.frequency,
    ])
      param.cancelScheduledValues(time)

    // Electric starter: a gear whine well above the compression chugs, rising as it spins,
    // then freewheeling off once the engine fires. Not the running engine note.
    this.motor.frequency.setValueAtTime(240 * pitch, time)
    this.motor.frequency.linearRampToValueAtTime(320 * pitch, time + 0.2)
    this.motor.frequency.linearRampToValueAtTime(420 * pitch, catchAt)
    this.motor.frequency.linearRampToValueAtTime(180 * pitch, end)
    this.chug.frequency.setValueAtTime(55 * pitch, time)
    this.rattleBand.frequency.setValueAtTime(520 * pitch, time)

    const motor = this.motorLevel.gain
    const chug = this.chugLevel.gain
    const rattle = this.rattleLevel.gain
    motor.setValueAtTime(SILENT, time)
    chug.setValueAtTime(SILENT, time)
    rattle.setValueAtTime(SILENT, time)
    const pulses = crankPulses(seconds, pitch)
    pulses.forEach((offset, i) => {
      const start = time + offset
      const next = time + (pulses[i + 1] ?? seconds - 0.15)
      const period = Math.max(0.02, next - start)
      // Each compression loads the starter (louder, rougher) and releases it.
      motor.linearRampToValueAtTime(0.03 * gain, start)
      motor.linearRampToValueAtTime(0.075 * gain, start + period * 0.3)
      motor.linearRampToValueAtTime(0.035 * gain, start + period * 0.95)
      chug.setValueAtTime(SILENT, start)
      chug.linearRampToValueAtTime(0.11 * gain, start + 0.008)
      chug.exponentialRampToValueAtTime(SILENT, start + period * 0.8)
      rattle.setValueAtTime(SILENT, start)
      rattle.linearRampToValueAtTime(0.03 * gain, start + 0.006)
      rattle.exponentialRampToValueAtTime(SILENT, start + period * 0.6)
    })
    // The engine fires: one strong combustion thump at the flare above idle that glides down to
    // the idle engine note, where the engine voice takes over; the starter freewheels away.
    this.chug.frequency.setValueAtTime(
      engineNoteHz(idleRpm * roadVehicleDefaults.ignitionFlare),
      catchAt,
    )
    this.chug.frequency.exponentialRampToValueAtTime(engineNoteHz(idleRpm), end + 0.12)
    chug.setValueAtTime(SILENT, catchAt)
    chug.linearRampToValueAtTime(0.18 * gain, catchAt + 0.01)
    chug.exponentialRampToValueAtTime(SILENT, end + 0.12)
    chug.setValueAtTime(0, end + 0.13)
    rattle.setValueAtTime(SILENT, catchAt)
    rattle.linearRampToValueAtTime(0.05 * gain, catchAt + 0.01)
    rattle.exponentialRampToValueAtTime(SILENT, end + 0.05)
    rattle.setValueAtTime(0, end + 0.06)
    motor.linearRampToValueAtTime(0.05 * gain, catchAt)
    motor.exponentialRampToValueAtTime(SILENT, end)
    motor.setValueAtTime(0, end + 0.01)
  }

  silence(time: number): void {
    for (const param of [this.motorLevel.gain, this.chugLevel.gain, this.rattleLevel.gain]) {
      param.cancelScheduledValues(time)
      param.setTargetAtTime(0, time, 0.02)
    }
  }
}
