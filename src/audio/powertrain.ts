import { silentOutput } from './graph.js'
import { V4Engine } from './v4-engine.js'
import { inlineEngineDefaults, OverrunBurble } from './inline-engine.js'
import {
  AirBrakeHiss,
  dieselEngineDefaults,
  dieselTurboSpool,
  ExhaustBrake,
} from './diesel-engine.js'
import type { ResolvedEngineVoice } from './vehicle-sound.js'

/**
 * Pitch of the engine note at `rpm`, Hz. Slightly above the bare four-cylinder firing rate
 * (rpm / 30) so idle reads as an engine at low revs rather than a sub-bass rumble: 1,000 rpm
 * idle = 41.7 Hz, 750 rpm diesel idle = 31.3 Hz, 6,900 rpm = 288 Hz. The engine-start voice ends
 * its catch on this pitch at idle so the hand-over is seamless.
 */
export const engineNoteHz = (rpm: number): number => Math.max(25, rpm / 24)
/** Lowpass cutoff of the engine note, Hz. It opens with rpm and load. */
export const engineNoteCutoffHz = (rpm: number, load = 0): number => 260 + rpm * 0.14 + load * 700

/** Road-car engine. One sawtooth at `engineNoteHz`, through a lowpass at `engineNoteCutoffHz`. */
class EngineNote {
  private readonly output: GainNode
  private readonly oscillator: OscillatorNode
  private readonly filter: BiquadFilterNode

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

  silence(time: number): void {
    this.output.gain.setTargetAtTime(0, time, 0.05)
  }

  update(time: number, audible: boolean, rpm: number, load: number, volume = 1): void {
    this.output.gain.setTargetAtTime(audible ? (0.025 + load * 0.055) * volume : 0, time, 0.035)
    this.oscillator.frequency.setTargetAtTime(engineNoteHz(rpm), time, 0.035)
    this.filter.frequency.setTargetAtTime(engineNoteCutoffHz(rpm, load), time, 0.04)
  }
}

/**
 * Turbo on that same engine. A sine whistle plus a slice of the shared noise.
 * No new nodes per gear change. A hard drop in load vents the stored boost once:
 * that is the short shift cut. The whistle fades out as rpm rises.
 */
class Turbo {
  private readonly whistle: OscillatorNode
  private readonly whistleLevel: GainNode
  private readonly air: GainNode
  private boost = 0
  private release = 0
  private previousLoad = 0

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

  silence(time: number): void {
    this.whistleLevel.gain.setTargetAtTime(0, time, 0.03)
    this.air.gain.setTargetAtTime(0, time, 0.03)
    this.boost = 0
    this.release = 0
    this.previousLoad = 0
  }

  update(
    time: number,
    dt: number,
    audible: boolean,
    rpm: number,
    load: number,
    whistle = 1,
    blowOff = 1,
    spoolFrom = 1600,
    spoolSpan = 3600,
    whistleBase = 1100,
    whistleRise = 1900,
  ): void {
    const target = audible
      ? load * Math.max(0, Math.min(1, (rpm - spoolFrom) / Math.max(1, spoolSpan)))
      : 0
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

    const whistleFade = Math.max(0, Math.min(1, (3800 - rpm) / 1400))
    this.whistleLevel.gain.setTargetAtTime(this.boost * whistleFade * 0.006 * whistle, time, 0.06)
    this.whistle.frequency.setTargetAtTime(whistleBase + this.boost * whistleRise, time, 0.08)
    this.air.gain.setTargetAtTime(
      this.boost * whistleFade * 0.003 * whistle + this.release * 0.04 * blowOff,
      time,
      0.025,
    )
  }
}

/**
 * Engine voice and turbo, driven by the same rpm and load. Pass rpm 0 to silence; pass
 * `turbo: false` for an engine without one (the turbo voice then stays silent). `engine`
 * picks the voice: the road-car note (default), the procedural V4 or the refined inline voice
 * (with its subdued turbo and optional overrun burble), built on first use; if the browser
 * cannot build it the note plays instead.
 */
export class Powertrain {
  private readonly engine: EngineNote
  private readonly turbo: Turbo
  private v4?: V4Engine
  private v4Unavailable = false
  private inline?: V4Engine
  private inlineUnavailable = false
  private diesel?: V4Engine
  private dieselUnavailable = false
  private jake?: ExhaustBrake
  private air?: AirBrakeHiss
  private burble?: OverrunBurble
  private previousTime = 0

  constructor(
    private readonly context: AudioContext,
    private readonly noise: AudioBufferSourceNode,
    /** Randomness of the occasional overrun burble; injectable for tests. */
    private readonly random: () => number = Math.random,
  ) {
    this.engine = new EngineNote(context)
    this.turbo = new Turbo(context, noise)
  }

  /** Which voice played on the last update, for tests and diagnostics. */
  activeVoice: 'note' | 'v4' | 'inline' | 'diesel' = 'note'

  silence(time: number): void {
    this.engine.silence(time)
    this.turbo.silence(time)
    this.v4?.silence(time)
    this.inline?.silence(time)
    this.diesel?.silence(time)
    this.jake?.silence(time)
    this.air?.silence(time)
    this.burble?.silence(time)
  }

  update(
    time: number,
    audible: boolean,
    rpm: number,
    load: number,
    turbo = true,
    engine?: ResolvedEngineVoice,
    braking = false,
  ): void {
    rpm = Number.isFinite(rpm) ? Math.max(0, Math.min(20000, rpm)) : 0
    load = Number.isFinite(load) ? Math.max(0, Math.min(1, load)) : 0
    const running = audible && rpm > 0
    const dt = Math.min(0.1, Math.max(0, time - this.previousTime))
    this.previousTime = time
    const v4 = engine?.voice === 'v4' ? this.v4Voice(engine.firing) : undefined
    const inline = engine?.voice === 'inline' ? this.inlineVoice(engine) : undefined
    const diesel = engine?.voice === 'diesel' ? this.dieselVoice(engine) : undefined
    const spool = diesel ? dieselTurboSpool : undefined
    if (turbo)
      this.turbo.update(
        time,
        dt,
        running,
        rpm,
        load,
        inline || diesel ? (engine?.turboWhistle ?? 1) : 1,
        inline || diesel ? (engine?.blowOff ?? 1) : 1,
        spool?.fromRpm,
        spool?.spanRpm,
        spool?.whistleBaseHz,
        spool?.whistleRiseHz,
      )
    else this.turbo.silence(time)
    if (diesel && engine) {
      this.jake ??= new ExhaustBrake(this.context)
      this.air ??= new AirBrakeHiss(this.context, this.noise)
      if (running) this.jake.update(time, true, rpm, load, engine.jake !== false)
      else this.jake.silence(time)
      this.air.update(time, running, braking, engine.airBrake !== false)
    } else {
      this.jake?.silence(time)
      this.air?.silence(time)
    }
    if (v4) {
      this.activeVoice = 'v4'
      this.engine.silence(time)
      this.inline?.silence(time)
      this.diesel?.silence(time)
      v4.update(time, running, rpm, load, engine?.volume ?? 1)
    } else if (diesel) {
      this.activeVoice = 'diesel'
      this.engine.silence(time)
      this.v4?.silence(time)
      this.inline?.silence(time)
      diesel.update(time, running, rpm, load, engine?.volume ?? 1)
    } else if (inline) {
      this.activeVoice = 'inline'
      this.engine.silence(time)
      this.v4?.silence(time)
      this.diesel?.silence(time)
      inline.update(time, running, rpm, load, engine?.volume ?? 1)
      if (engine?.burble) {
        this.burble ??= new OverrunBurble(this.context, this.noise, this.random)
        if (running) this.burble.update(time, dt, rpm, load, engine.burble, engine.volume)
        else this.burble.silence(time)
      } else this.burble?.silence(time)
    } else {
      this.activeVoice = 'note'
      this.v4?.silence(time)
      this.inline?.silence(time)
      this.diesel?.silence(time)
      this.engine.update(time, running, rpm, load, engine?.volume ?? 1)
    }
  }

  private inlineVoice(engine: ResolvedEngineVoice): V4Engine | undefined {
    if (this.inlineUnavailable) return undefined
    try {
      if (!this.inline)
        this.inline = new V4Engine(
          this.context,
          this.noise,
          engine.firing,
          inlineEngineDefaults,
          engine.weights,
        )
      else this.inline.setFiring(engine.firing, engine.weights)
      return this.inline
    } catch {
      this.inlineUnavailable = true
      return undefined
    }
  }

  private dieselVoice(engine: ResolvedEngineVoice): V4Engine | undefined {
    if (this.dieselUnavailable) return undefined
    try {
      if (!this.diesel)
        this.diesel = new V4Engine(
          this.context,
          this.noise,
          engine.firing,
          dieselEngineDefaults,
          engine.weights,
        )
      else this.diesel.setFiring(engine.firing, engine.weights)
      return this.diesel
    } catch {
      this.dieselUnavailable = true
      return undefined
    }
  }

  private v4Voice(firing: readonly number[]): V4Engine | undefined {
    if (this.v4Unavailable) return undefined
    try {
      if (!this.v4) this.v4 = new V4Engine(this.context, this.noise, firing)
      else this.v4.setFiring(firing)
      return this.v4
    } catch {
      this.v4Unavailable = true
      return undefined
    }
  }
}
