import { silentOutput } from './graph.js'

export type EngineProfile = 'gasoline' | 'diesel'

interface EngineNoteTuning {
  rpmDivisor: number
  baseGain: number
  loadGain: number
  baseFilterFreq: number
  rpmFilterScale: number
  loadFilterScale: number
}

const GASOLINE_NOTE: EngineNoteTuning = {
  rpmDivisor: 30,
  baseGain: 0.025,
  loadGain: 0.055,
  baseFilterFreq: 180,
  rpmFilterScale: 0.1,
  loadFilterScale: 700,
}

const DIESEL_NOTE: EngineNoteTuning = {
  rpmDivisor: 60,
  baseGain: 0.045,
  loadGain: 0.035,
  baseFilterFreq: 90,
  rpmFilterScale: 0.06,
  loadFilterScale: 400,
}

/**
 * Engine note synthesis.
 * Gasoline: 4-cylinder firing rate at rpm/30 Hz (higher-revving).
 * Diesel: 6-cylinder firing rate at rpm/60 Hz (deeper, slower-revving).
 */
class EngineNote {
  private readonly output: GainNode
  private readonly oscillator: OscillatorNode
  private readonly filter: BiquadFilterNode
  private tuning: EngineNoteTuning = GASOLINE_NOTE

  constructor(context: AudioContext) {
    this.output = silentOutput(context)

    this.filter = context.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.Q.value = 0.7
    this.filter.connect(this.output)

    this.oscillator = context.createOscillator()
    this.oscillator.type = 'sawtooth'
    this.oscillator.connect(this.filter)
    this.oscillator.start()
  }

  setProfile(profile: EngineProfile): void {
    this.tuning = profile === 'diesel' ? DIESEL_NOTE : GASOLINE_NOTE
  }

  silence(time: number): void {
    this.output.gain.setTargetAtTime(0, time, 0.05)
  }

  update(time: number, audible: boolean, rpm: number, load: number): void {
    const t = this.tuning
    this.output.gain.setTargetAtTime(audible ? t.baseGain + load * t.loadGain : 0, time, 0.035)
    this.oscillator.frequency.setTargetAtTime(Math.max(15, rpm / t.rpmDivisor), time, 0.035)
    this.filter.frequency.setTargetAtTime(
      t.baseFilterFreq + rpm * t.rpmFilterScale + load * t.loadFilterScale,
      time,
      0.04,
    )
  }
}

interface TurboTuning {
  spoolStartRpm: number
  spoolRangeRpm: number
  whistleFadeEndRpm: number
  whistleFadeRangeRpm: number
  whistleBaseFreq: number
  whistleBoostScale: number
  airGainScale: number
  releaseGainScale: number
}

const GASOLINE_TURBO: TurboTuning = {
  spoolStartRpm: 1600,
  spoolRangeRpm: 3600,
  whistleFadeEndRpm: 3800,
  whistleFadeRangeRpm: 1400,
  whistleBaseFreq: 1100,
  whistleBoostScale: 1900,
  airGainScale: 0.003,
  releaseGainScale: 0.04,
}

const DIESEL_TURBO: TurboTuning = {
  spoolStartRpm: 800,
  spoolRangeRpm: 1200,
  whistleFadeEndRpm: 1800,
  whistleFadeRangeRpm: 600,
  whistleBaseFreq: 700,
  whistleBoostScale: 1000,
  airGainScale: 0.006,
  releaseGainScale: 0.06,
}

/**
 * Turbo on that same engine. A sine whistle plus a slice of the shared noise.
 * No new nodes per gear change. A hard drop in load vents the stored boost once:
 * that is the short shift cut. The whistle fades out as rpm rises.
 * Diesel turbos spool earlier and lower, with deeper whistle and more air release.
 */
class Turbo {
  private readonly whistle: OscillatorNode
  private readonly whistleLevel: GainNode
  private readonly air: GainNode
  private boost = 0
  private release = 0
  private previousLoad = 0
  private tuning: TurboTuning = GASOLINE_TURBO

  constructor(context: AudioContext, noise: AudioBufferSourceNode) {
    this.whistleLevel = silentOutput(context)
    this.whistle = context.createOscillator()
    this.whistle.type = 'sine'
    this.whistle.frequency.value = 1100
    this.whistle.connect(this.whistleLevel)
    this.whistle.start()

    this.air = silentOutput(context)
    const airFilter = context.createBiquadFilter()
    airFilter.type = 'bandpass'
    airFilter.frequency.value = 2400
    airFilter.Q.value = 0.8
    airFilter.connect(this.air)
    noise.connect(airFilter)
  }

  setProfile(profile: EngineProfile): void {
    this.tuning = profile === 'diesel' ? DIESEL_TURBO : GASOLINE_TURBO
  }

  silence(time: number): void {
    this.whistleLevel.gain.setTargetAtTime(0, time, 0.03)
    this.air.gain.setTargetAtTime(0, time, 0.03)
    this.boost = 0
    this.release = 0
    this.previousLoad = 0
  }

  update(time: number, dt: number, audible: boolean, rpm: number, load: number): void {
    const t = this.tuning
    const spoolFactor = Math.max(0, Math.min(1, (rpm - t.spoolStartRpm) / t.spoolRangeRpm))
    const target = audible ? load * spoolFactor : 0
    const lifted = audible && this.previousLoad > 0.5 && load < 0.25
    if (lifted) this.release = Math.max(this.release, this.boost)
    if (!audible) {
      this.release = 0
      this.boost = 0
    }
    const rising = target > this.boost
    this.boost += (target - this.boost) * (1 - Math.exp(-dt / (rising ? 0.3 : 0.12)))
    this.release *= Math.exp(-dt / 0.14)
    this.previousLoad = audible ? load : 0

    const whistleFade = Math.max(
      0,
      Math.min(1, (t.whistleFadeEndRpm - rpm) / t.whistleFadeRangeRpm),
    )
    this.whistleLevel.gain.setTargetAtTime(this.boost * whistleFade * 0.006, time, 0.06)
    this.whistle.frequency.setTargetAtTime(
      t.whistleBaseFreq + this.boost * t.whistleBoostScale,
      time,
      0.08,
    )
    this.air.gain.setTargetAtTime(
      this.boost * whistleFade * t.airGainScale + this.release * t.releaseGainScale,
      time,
      0.025,
    )
  }
}

/** Engine note and turbo, driven by the same rpm and load. Pass rpm 0 to silence. */
export class Powertrain {
  private readonly engine: EngineNote
  private readonly turbo: Turbo
  private previousTime = 0
  private profile: EngineProfile = 'gasoline'

  constructor(context: AudioContext, noise: AudioBufferSourceNode) {
    this.engine = new EngineNote(context)
    this.turbo = new Turbo(context, noise)
  }

  /** Switch between gasoline (high-revving car) and diesel (low-revving truck) profiles. */
  setProfile(profile: EngineProfile): void {
    this.profile = profile
    this.engine.setProfile(profile)
    this.turbo.setProfile(profile)
  }

  getProfile(): EngineProfile {
    return this.profile
  }

  silence(time: number): void {
    this.engine.silence(time)
    this.turbo.silence(time)
  }

  update(time: number, audible: boolean, rpm: number, load: number): void {
    rpm = Number.isFinite(rpm) ? Math.max(0, Math.min(10000, rpm)) : 0
    load = Number.isFinite(load) ? Math.max(0, Math.min(1, load)) : 0
    const running = audible && rpm > 0
    const dt = Math.min(0.1, Math.max(0, time - this.previousTime))
    this.previousTime = time
    this.turbo.update(time, dt, running, rpm, load)
    this.engine.update(time, running, rpm, load)
  }
}
