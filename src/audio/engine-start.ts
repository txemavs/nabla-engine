import { audioBus } from './mixer.js'
import { roadVehicleDefaults } from '../config/simulation.js'
import { engineNoteHz } from './powertrain.js'

/**
 * Engine start, fully synthesized: no sample files. One short mechanical click as the starter
 * engages, a very brief crank, then the engine catches on the first try and the idle note
 * (see `Powertrain`) takes over. No starter whine. The nodes are created once; a trigger only
 * schedules envelopes.
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

/** Engagement-click time of one start, seconds from the trigger. One click, then the catch. */
export function crankPulses(seconds: number, pitch = 1): number[] {
  if (!(seconds >= 0.15) || !(pitch > 0)) return []
  return [0.012]
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
    output.connect(audioBus(context, 'engine'))

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
    // The click is immediate; the catch is inside the same short window, then idle.
    const catchAt = time + Math.min(0.16, seconds * 0.75)
    for (const param of [
      this.motorLevel.gain,
      this.chugLevel.gain,
      this.rattleLevel.gain,
      this.motor.frequency,
      this.chug.frequency,
    ])
      param.cancelScheduledValues(time)

    // A plink, not a rising electric whine. The grind stays at one low pitch and is gone
    // before the engine fires.
    this.motor.frequency.setValueAtTime(95 * pitch, time)
    this.chug.frequency.setValueAtTime(80 * pitch, time)
    this.rattleBand.frequency.setValueAtTime(2200 * pitch, time)

    const motor = this.motorLevel.gain
    const chug = this.chugLevel.gain
    const rattle = this.rattleLevel.gain
    motor.setValueAtTime(SILENT, time)
    chug.setValueAtTime(SILENT, time)
    rattle.setValueAtTime(SILENT, time)
    const [click] = crankPulses(seconds, pitch)
    if (click !== undefined) {
      const at = time + click
      rattle.linearRampToValueAtTime(0.1 * gain, at)
      rattle.exponentialRampToValueAtTime(SILENT, at + 0.028)
      rattle.setValueAtTime(0, at + 0.035)
      motor.linearRampToValueAtTime(0.04 * gain, at + 0.02)
      motor.exponentialRampToValueAtTime(SILENT, catchAt)
      motor.setValueAtTime(0, catchAt + 0.01)
      chug.setValueAtTime(SILENT, at)
      chug.linearRampToValueAtTime(0.07 * gain, at + 0.008)
      chug.exponentialRampToValueAtTime(SILENT, at + 0.06)
    }
    // First-try catch, straight down to the idle note. The engine voice takes over there.
    this.chug.frequency.setValueAtTime(
      engineNoteHz(idleRpm * roadVehicleDefaults.ignitionFlare),
      catchAt,
    )
    this.chug.frequency.exponentialRampToValueAtTime(engineNoteHz(idleRpm), end + 0.04)
    chug.setValueAtTime(SILENT, catchAt)
    chug.linearRampToValueAtTime(0.16 * gain, catchAt + 0.01)
    chug.exponentialRampToValueAtTime(SILENT, end + 0.04)
    chug.setValueAtTime(0, end + 0.05)
  }

  silence(time: number): void {
    for (const param of [this.motorLevel.gain, this.chugLevel.gain, this.rattleLevel.gain]) {
      param.cancelScheduledValues(time)
      param.setTargetAtTime(0, time, 0.02)
    }
  }
}
