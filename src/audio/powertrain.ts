import { silentOutput } from './graph.js'

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

  update(time: number, audible: boolean, rpm: number, load: number): void {
    this.output.gain.setTargetAtTime(audible ? 0.025 + load * 0.055 : 0, time, 0.035)
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

  update(time: number, dt: number, audible: boolean, rpm: number, load: number): void {
    const target = audible ? load * Math.max(0, Math.min(1, (rpm - 1600) / 3600)) : 0
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
    this.whistleLevel.gain.setTargetAtTime(this.boost * whistleFade * 0.006, time, 0.06)
    this.whistle.frequency.setTargetAtTime(1100 + this.boost * 1900, time, 0.08)
    this.air.gain.setTargetAtTime(
      this.boost * whistleFade * 0.003 + this.release * 0.04,
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

  constructor(context: AudioContext, noise: AudioBufferSourceNode) {
    this.engine = new EngineNote(context)
    this.turbo = new Turbo(context, noise)
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
