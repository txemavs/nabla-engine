import { EngineStart, type EngineStartSound } from './engine-start.js'
import { GearClack, type GearClackSound } from './gear-clack.js'
import { loopingNoise } from './graph.js'
import { Gunshot } from './gunshot.js'
import { Powertrain } from './powertrain.js'
import { Propeller } from './propeller.js'
import { TireSqueal } from './tires.js'
import { Turbine } from './turbine.js'
import { ReverseAlarm } from './reverse-alarm.js'

/**
 * One browser audio context, eight independent voices.
 *
 * The context has to be created from a click or a key press (`unlock`).
 * Turbine, propeller, tires, powertrain, engine start, reverse alarm, gear clack and the
 * sidearm gunshot own their nodes; they only
 * share that context and one noise buffer. Studio owns the mute button.
 * Audio never throws into the host loop.
 */
export class VehicleAudio {
  private context?: AudioContext
  private turbineVoice?: Turbine
  private propellerVoice?: Propeller
  private tireVoice?: TireSqueal
  private powertrainVoice?: Powertrain
  private gearVoice?: GearClack
  private startVoice?: EngineStart
  private reverseVoice?: ReverseAlarm
  private gunshotVoice?: Gunshot
  private clacks = 0
  private starts = 0
  private shots = 0
  private enabled = true
  private suspended = false

  constructor(enabled = true) {
    this.enabled = enabled
  }

  /** Mute or restore every voice. Muting ramps the gains to zero. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) this.silence()
    else this.unlock()
  }

  /** Silence while the document is hidden. Does not change the stored preference. */
  setSuspended(suspended: boolean): void {
    this.suspended = suspended
    if (suspended) this.silence()
  }

  /** Close the context. Further updates are no-ops. */
  dispose(): void {
    if (this.context) void this.context.close().catch(() => {})
    this.context = undefined
    this.enabled = false
  }

  /**
   * Create the voices on the first user gesture and resume the context if the
   * browser suspended it. Safe to call every frame; construction runs once.
   */
  unlock(): void {
    if (!this.enabled) return
    try {
      if (!this.context) this.build()
      if (this.context?.state === 'suspended') void this.context.resume().catch(() => {})
    } catch {
      /* Audio is optional; never interrupt the host loop. */
    }
  }

  /** Current tire-squeal gain, for tests and the renderer dataset. */
  get tireSoundLevel(): number {
    return this.tireVoice?.level ?? 0
  }

  /** Number of gear clacks played so far, for tests and the renderer dataset. */
  get gearClackCount(): number {
    return this.clacks
  }

  /** Number of engine starts played so far, for tests and the renderer dataset. */
  get engineStartCount(): number {
    return this.starts
  }

  /** Number of gunshots played so far, for tests and the renderer dataset. */
  get gunshotCount(): number {
    return this.shots
  }

  /** `level` is 0..1. `speed` is km/h. */
  turbine(level: number, speed: number): void {
    const frame = this.frame()
    if (!frame || !this.turbineVoice) return
    this.turbineVoice.update(frame.time, frame.audible, level, speed)
  }

  /** Pass 0 when the player is not flying the plane. */
  propeller(level: number): void {
    const frame = this.frame()
    if (!frame || !this.propellerVoice) return
    this.propellerVoice.update(frame.time, frame.audible, level)
  }

  /** `rpm` is engine speed. `load` is 0..1. Rpm 0 silences the car and the turbo. */
  powertrain(rpm: number, load: number): void {
    const frame = this.frame()
    if (!frame || !this.powertrainVoice) return
    this.powertrainVoice.update(frame.time, frame.audible, rpm, load)
  }

  /**
   * One mechanical clack for a gear change or D/R engagement. `sound` is the vehicle's own
   * profile (a truck passes a heavier, lower one); omitted fields use the car sound.
   */
  gearChange(sound?: GearClackSound | null): void {
    const frame = this.frame()
    if (!frame || !this.gearVoice || !frame.audible) return
    this.gearVoice.trigger(frame.time, true, sound)
    this.clacks++
  }

  /**
   * One ~0.6 s starter-motor crank ending in the engine catching (`ignitionCrankSeconds`). The
   * host keeps `powertrain` at rpm 0 meanwhile and then feeds the settling idle speed.
   */
  engineStart(sound?: EngineStartSound | null): void {
    const frame = this.frame()
    if (!frame || !this.startVoice || !frame.audible) return
    this.startVoice.trigger(frame.time, true, sound)
    this.starts++
  }

  /** One sidearm shot. Silent before the first gesture, while muted or while suspended. */
  gunshot(): void {
    const frame = this.frame()
    if (!frame || !this.gunshotVoice || !frame.audible) return
    this.gunshotVoice.trigger(frame.time, true)
    this.shots++
  }

  tires(slip: number, speedKmh: number): void {
    const frame = this.frame()
    if (!frame || !this.tireVoice) return
    this.tireVoice.update(frame.time, frame.audible, slip, speedKmh)
  }
  /** Reverse-warning voice, gated by the vehicle profile, gear and global audio preference. */
  reverseAlarm(active: boolean): void {
    const frame = this.frame()
    if (frame) this.reverseVoice?.update(frame.time, frame.audible && active)
  }

  private build(): void {
    const context = new AudioContext()
    const noise = loopingNoise(context)
    this.context = context
    this.turbineVoice = new Turbine(context, noise)
    this.propellerVoice = new Propeller(context)
    this.tireVoice = new TireSqueal(context, noise)
    this.powertrainVoice = new Powertrain(context, noise)
    this.reverseVoice = new ReverseAlarm(context)
    this.startVoice = new EngineStart(context, noise)
    this.gearVoice = new GearClack(context, noise)
    this.gunshotVoice = new Gunshot(context, noise)
  }

  private frame(): { time: number; audible: boolean } | undefined {
    if (!this.context) return undefined
    return { time: this.context.currentTime, audible: this.enabled && !this.suspended }
  }

  private silence(): void {
    if (!this.context) return
    const time = this.context.currentTime
    this.turbineVoice?.silence(time)
    this.propellerVoice?.silence(time)
    this.tireVoice?.silence(time)
    this.powertrainVoice?.silence(time)
    this.gearVoice?.silence(time)
    this.startVoice?.silence(time)
    this.reverseVoice?.silence(time)
    this.gunshotVoice?.silence(time)
  }
}
