import { silentOutput } from './graph.js'
import type { FiringVoiceTimbre } from './v4-engine.js'

/**
 * Big-displacement inline-6 turbo-diesel voice. The firing pattern is the even six
 * (`inlineFiringAngles(6)`); this timbre only makes that pulse train idle as a deep rumble
 * and growl with load. Timbre numbers are gameplay choices, not measurements.
 * TODO(unverified): pulse width, gains and filter are not from a recorded engine.
 */
export const dieselEngineDefaults: FiringVoiceTimbre = Object.freeze({
  harmonics: 24,
  /** Wider pulses than the petrol inline: a rounder, lower note. */
  pulseWidth: 0.11,
  idleGain: 0.04,
  loadGain: 0.075,
  drive: 1.35,
  cutoffBaseHz: 80,
  cutoffPerRpm: 0.045,
  cutoffLoadHz: 260,
  filterQ: 0.45,
  intakeGain: 0.012,
  intakeBaseHz: 90,
  intakeFiringMultiple: 1,
  /**
   * An even six's strong partial is 6 × (rpm/120) = rpm/20. Yesterday's truck note
   * (`engineNoteHz`) is rpm/24, the deeper prrrón. 20/24 keeps this pulse train and puts
   * that partial on the old pitch. TODO(unverified): not a measured spectrum.
   */
  pitch: 20 / 24,
})

/** Turbo spool range for that diesel (the road-car turbo waits until 1,600 rpm). */
export const dieselTurboSpool = Object.freeze({
  fromRpm: 900,
  spanRpm: 1400,
  whistleBaseHz: 700,
  whistleRiseHz: 1500,
})

/**
 * Exhaust-brake / jake bark on a sharp lift-off: one low thud, not a petrol burble.
 * TODO(unverified): the bark pitch and length are not from a measured retarder.
 */
export class ExhaustBrake {
  private readonly level: GainNode
  private readonly osc: OscillatorNode
  private previousLoad = 0
  /** Barks started, for tests. */
  barks = 0

  constructor(context: AudioContext) {
    this.level = silentOutput(context)
    this.osc = context.createOscillator()
    this.osc.type = 'square'
    this.osc.frequency.value = 70
    this.osc.connect(this.level)
    this.osc.start()
  }

  silence(time: number): void {
    this.level.gain.setTargetAtTime(0, time, 0.02)
    this.previousLoad = 0
  }

  update(time: number, audible: boolean, rpm: number, load: number, enabled: boolean): void {
    const lifted = this.previousLoad >= 0.4 && load <= 0.15 && rpm >= 900
    this.previousLoad = audible ? load : 0
    if (!enabled || !audible || !lifted) return
    this.barks++
    const gain = this.level.gain
    gain.cancelScheduledValues(time)
    this.osc.frequency.setValueAtTime(55 + Math.min(40, rpm / 80), time)
    gain.setValueAtTime(0.0001, time)
    gain.linearRampToValueAtTime(0.09, time + 0.012)
    gain.exponentialRampToValueAtTime(0.0001, time + 0.22)
    gain.setValueAtTime(0, time + 0.24)
  }
}

/**
 * Air-brake hiss: a short band of noise when the service brake comes on, and a smaller
 * one when it releases. TODO(unverified): the hiss length is not from a measured system.
 */
export class AirBrakeHiss {
  private readonly level: GainNode
  private wasBraking = false
  /** Hisses started, for tests. */
  hisses = 0

  constructor(context: AudioContext, noise: AudioBufferSourceNode) {
    this.level = silentOutput(context)
    const band = context.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 3200
    band.Q.value = 0.7
    band.connect(this.level)
    noise.connect(band)
  }

  silence(time: number): void {
    this.level.gain.setTargetAtTime(0, time, 0.02)
    this.wasBraking = false
  }

  update(time: number, audible: boolean, braking: boolean, enabled: boolean): void {
    const rising = braking && !this.wasBraking
    const falling = !braking && this.wasBraking
    this.wasBraking = braking
    if (!enabled || !audible || (!rising && !falling)) return
    this.hisses++
    const peak = rising ? 0.045 : 0.02
    const hold = rising ? 0.28 : 0.14
    const gain = this.level.gain
    gain.cancelScheduledValues(time)
    gain.setValueAtTime(0.0001, time)
    gain.linearRampToValueAtTime(peak, time + 0.02)
    gain.exponentialRampToValueAtTime(0.0001, time + hold)
    gain.setValueAtTime(0, time + hold + 0.02)
  }
}
