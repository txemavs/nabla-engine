import { EngineStart, type EngineStartSound } from './engine-start.js'
import { GearClack, type GearClackSound } from './gear-clack.js'
import { GearClick, type GearClickSound } from './gear-click.js'
import { loopingNoise } from './graph.js'
import { Gunshot } from './gunshot.js'
import { WeaponHandling, type WeaponSound } from './weapon-handling.js'
import { MetalImpact } from './metal-impact.js'
import { impactSounds, vehicleImpactSurface, type ImpactSurface } from '../config/impact-sounds.js'
import { CasingTinkle } from './casing-tinkle.js'
import { Powertrain } from './powertrain.js'
import type { ResolvedEngineVoice } from './vehicle-sound.js'
import { Propeller } from './propeller.js'
import { TireSqueal } from './tires.js'
import { MetalScrape } from './scrape.js'
import { Turbine } from './turbine.js'
import { ReverseAlarm } from './reverse-alarm.js'
import { AudioMixer, audioBus, withAudioOutputs, type AudioMixLevels } from './mixer.js'
import { SpatialEmitter } from './positional.js'
import { DestructionSound } from './destruction.js'
import { BackgroundMusic, type MusicTrack } from './music.js'

/**
 * One browser audio context, nine independent voices (the powertrain one picks a road-car
 * note or a procedural V4 per vehicle).
 *
 * The context has to be created from a click or a key press (`unlock`).
 * Turbine, propeller, tires, powertrain, engine start, reverse alarm, gear clack, gear click and the
 * sidearm gunshot own their nodes; they only
 * share that context and one noise buffer. Studio owns the mute button.
 * Audio never throws into the host loop.
 */
export class VehicleAudio {
  private context?: AudioContext
  private turbineVoice?: Turbine
  private propellerVoice?: Propeller
  private tireVoice?: TireSqueal
  private scrapeVoice?: MetalScrape
  private powertrainVoice?: Powertrain
  private gearVoice?: GearClack
  private clickVoice?: GearClick
  private startVoice?: EngineStart
  private reverseVoice?: ReverseAlarm
  private gunshotVoice?: Gunshot
  private weaponHandling?: WeaponHandling
  private readonly metalVoices: MetalImpact[] = []
  private readonly metalEmitters: SpatialEmitter[] = []
  private nextMetal = 0
  private lastMetalTimbre = -1
  private readonly lastImpactAt = new Map<ImpactSurface, number>()
  private weaponClickVoice?: GearClick
  private vehicleEngine?: SpatialEmitter
  private turbineEmitter?: SpatialEmitter
  private vehicleEffects?: SpatialEmitter
  private weaponEmitter?: SpatialEmitter
  private casingVoices: { voice: CasingTinkle; emitter: SpatialEmitter }[] = []
  private nextCasing = 0
  private readonly destructionVoices: { voice: DestructionSound; emitter: SpatialEmitter }[] = []
  private nextDestruction = 0
  destruction(position: readonly number[], glass = false): void {
    const frame = this.frame()
    if (!frame?.audible || !this.context) return
    const entry = this.destructionVoices[this.nextDestruction++ % this.destructionVoices.length]
    entry.emitter.setPosition(position)
    entry.emitter.setListener(this.eye, this.orientation)
    entry.voice.trigger(frame.time, glass)
  }
  private eye: readonly number[] = [0, 0, 0]
  private orientation: readonly number[] = [0, 0, 0, 1]
  private listenerSpeed = 0
  private tinkles = 0
  private clacks = 0
  private clicks = 0
  private starts = 0
  private shots = 0
  private nextHorn = 0
  private enabled = true
  private suspended = false
  /** Master / engine / music buses; levels apply as soon as the context exists. */
  readonly mixer = new AudioMixer()
  private music?: BackgroundMusic

  constructor(enabled = true) {
    this.enabled = enabled
  }

  /** Looping background track; it starts on the next unlock (a user gesture). */
  setMusic(track: MusicTrack | undefined): void {
    this.music?.dispose()
    this.music = track?.sources.length ? new BackgroundMusic(track) : undefined
    this.syncMusic()
  }

  /** Fade the background track out over `seconds`; it stays off until `playMusic`. */
  fadeOutMusic(seconds: number): void {
    this.music?.fadeOut(seconds)
  }

  /**
   * Play the background track again from the start (vehicle menu «MUSICA»). Returns `false`
   * when there is no track, audio is off or the music is muted in the mix.
   */
  playMusic(): boolean {
    if (!this.music) return false
    this.music.restart()
    this.unlock()
    this.syncMusic()
    return !!this.context && this.enabled && !this.mixer.levels.musicMuted
  }

  /** The background track, if any (title and menu label for hosts). */
  get musicTrack(): MusicTrack | undefined {
    return this.music?.track
  }

  /** True while the background track is playing. */
  get musicPlaying(): boolean {
    return this.music?.playing ?? false
  }

  /** Change the mix (0..1 sliders, music mute). Returns the clamped levels. */
  setMix(patch: Partial<AudioMixLevels>): AudioMixLevels {
    const levels = this.mixer.set(patch)
    this.syncMusic()
    return levels
  }

  /** Pause the music while the page is hidden; effects use `setSuspended`. */
  setPageHidden(hidden: boolean): void {
    this.music?.setHidden(hidden)
  }

  private syncMusic(): void {
    if (!this.music) return
    if (!this.context || !this.enabled || this.mixer.levels.musicMuted) this.music.stop()
    else this.music.start(this.context, audioBus(this.context, 'music'))
  }

  /** Mute or restore every voice. Muting ramps the gains to zero. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) this.silence()
    else this.unlock()
    this.syncMusic()
  }

  /** Silence while the document is hidden. Does not change the stored preference. */
  setSuspended(suspended: boolean): void {
    this.suspended = suspended
    if (suspended) this.silence()
  }

  /** Close the context. Further updates are no-ops. */
  dispose(): void {
    for (const entry of this.destructionVoices) entry.emitter.dispose()
    this.destructionVoices.length = 0
    for (const emitter of this.metalEmitters) emitter.dispose()
    this.metalEmitters.length = 0
    this.metalVoices.length = 0
    this.music?.dispose()
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
      // A blocked autoplay left the track paused; any later gesture retries it.
      this.syncMusic()
    } catch {
      /* Audio is optional; never interrupt the host loop. */
    }
  }

  /** Build the silent common graph during loading; playback still requires unlock(). */
  prepare(): void {
    if (!this.enabled || this.context) return
    try {
      this.build()
    } catch {
      /* Audio remains optional. */
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

  /** Number of gear clicks played so far, for tests and the renderer dataset. */
  get gearClickCount(): number {
    return this.clicks
  }

  /** Number of engine starts played so far, for tests and the renderer dataset. */
  get engineStartCount(): number {
    return this.starts
  }

  /** Number of gunshots played so far, for tests and the renderer dataset. */
  get gunshotCount(): number {
    return this.shots
  }

  /** Camera pose and listener speed, in the same absolute world frame as source positions. */
  setListener(position: readonly number[], quaternion: readonly number[], speedKmh = 0): void {
    this.eye = [...position]
    this.orientation = [...quaternion]
    this.listenerSpeed = Math.abs(speedKmh)
    for (const emitter of [
      this.vehicleEngine,
      this.vehicleEffects,
      this.weaponEmitter,
      this.turbineEmitter,
      ...this.casingVoices.map((entry) => entry.emitter),
      ...this.destructionVoices.map((entry) => entry.emitter),
      ...this.metalEmitters,
    ]) {
      emitter?.setListener(this.eye, this.orientation)
    }
    for (const entry of this.casingVoices)
      entry.emitter.setMask(1 / (1 + (this.listenerSpeed / 30) ** 2))
  }
  setVehiclePosition(position: readonly number[]): void {
    this.vehicleEngine?.setPosition(position)
    this.vehicleEffects?.setPosition(position)
  }
  setTurbinePosition(position: readonly number[]): void {
    this.turbineEmitter?.setPosition(position)
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

  /**
   * `rpm` is engine speed. `load` is 0..1. Rpm 0 silences the car and the turbo.
   * `turbo: false` keeps the turbo silent for engines without one (e.g. a motorcycle);
   * `engine` picks the voice (`resolveEngineVoice`; default the road-car note).
   */
  powertrain(
    rpm: number,
    load: number,
    options: { turbo?: boolean; engine?: ResolvedEngineVoice; braking?: boolean } = {},
  ): void {
    const frame = this.frame()
    if (!frame || !this.powertrainVoice) return
    this.powertrainVoice.update(
      frame.time,
      frame.audible,
      rpm,
      load,
      options.turbo ?? true,
      options.engine,
      options.braking ?? false,
    )
  }

  /** Engine voice that played on the last `powertrain` call, for tests and the dataset. */
  get engineVoice(): 'note' | 'v4' | 'inline' | 'diesel' {
    return this.powertrainVoice?.activeVoice ?? 'note'
  }

  /** One short, quiet mechanical click for a gear change (`gearShift.sound: 'click'`). */
  gearClick(sound?: GearClickSound | null, position?: readonly number[]): void {
    const frame = this.frame()
    if (!frame || !this.clickVoice || !frame.audible) return
    if (position) this.weaponEmitter?.setPosition(position)
    const voice = position ? this.weaponClickVoice : this.clickVoice
    voice?.trigger(frame.time, true, sound)
    this.clicks++
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
   * One click and a very brief crank, then the engine catches (`ignitionCrankSeconds`, about 0.2 s). The
   * host keeps `powertrain` at rpm 0 meanwhile and then feeds the settling idle speed.
   */
  engineStart(sound?: EngineStartSound | null): void {
    const frame = this.frame()
    if (!frame || !this.startVoice || !frame.audible) return
    this.startVoice.trigger(frame.time, true, sound)
    this.starts++
  }

  /** One sidearm shot. Silent before the first gesture, while muted or while suspended. */
  gunshot(position?: readonly number[], last = false): void {
    const frame = this.frame()
    if (!frame || !this.gunshotVoice || !frame.audible) return
    this.weaponEmitter?.setPosition(position ?? this.eye)
    this.gunshotVoice.trigger(frame.time, true)
    if (last) this.weaponHandling?.trigger(frame.time + 0.035, 'slide-lock')
    this.shots++
  }

  /** Short dual-tone vehicle horn, through the existing SFX mixer and mute policy. */
  horn(): void {
    const frame = this.frame()
    const context = this.context
    if (!frame?.audible || !context || frame.time < this.nextHorn) return
    const time = frame.time
    this.nextHorn = time + 0.3
    const gain = context.createGain()
    gain.connect(audioBus(context, 'sfx'))
    gain.gain.setValueAtTime(0, time)
    gain.gain.linearRampToValueAtTime(0.08, time + 0.015)
    gain.gain.setValueAtTime(0.08, time + 0.25)
    gain.gain.linearRampToValueAtTime(0, time + 0.3)
    let remaining = 2
    for (const frequency of [400, 500]) {
      const tone = context.createOscillator()
      tone.type = 'triangle'
      tone.frequency.value = frequency
      tone.connect(gain)
      tone.onended = () => {
        tone.disconnect()
        if (--remaining === 0) gain.disconnect()
      }
      tone.start(time)
      tone.stop(time + 0.31)
    }
  }

  /** Procedural handling cue, at the weapon rather than the listener. */
  weaponSound(sound: WeaponSound, position?: readonly number[]): void {
    const frame = this.frame()
    if (!frame?.audible || !this.weaponEmitter) return
    this.weaponEmitter.setPosition(position ?? this.eye)
    this.weaponHandling?.trigger(frame.time, sound)
  }

  /** A metal target rings at the hit point; independent emitters preserve previous tails. */
  metalImpact(position: readonly number[], surface: ImpactSurface = vehicleImpactSurface): void {
    if (!this.frame()?.audible || !this.metalEmitters.length) return
    const sound = impactSounds[surface]
    // Rate limit per surface: a burst of hits rings as one flurry, not as a wall of voices.
    const now = this.context!.currentTime
    if (now - (this.lastImpactAt.get(surface) ?? -Infinity) < sound.minInterval) return
    this.lastImpactAt.set(surface, now)
    const index = this.nextMetal++ % this.metalEmitters.length
    const emitter = this.metalEmitters[index]
    emitter.setPosition(position)
    emitter.setListener(this.eye, this.orientation)
    // Voice allocation stays predictable for overlap; timbre does not follow the pool cycle.
    const choices = [0, 1, 2, 3].filter((value) => value !== this.lastMetalTimbre)
    this.lastMetalTimbre = choices[Math.floor(Math.random() * choices.length)]
    this.metalVoices[index].trigger(now, this.lastMetalTimbre, sound)
  }

  /** Reverse-warning voice, gated by the vehicle profile, gear and global audio preference. */
  reverseAlarm(active: boolean): void {
    const frame = this.frame()
    if (frame) this.reverseVoice?.update(frame.time, frame.audible && active)
  }

  /** A brass casing hitting the ground at `speed` m/s. */
  casing(speed: number, position?: readonly number[]): void {
    const frame = this.frame()
    if (!frame || !frame.audible) return
    const entry = this.casingVoices[this.nextCasing++ % this.casingVoices.length]
    if (!entry) return
    entry.emitter.setListener(this.eye, this.orientation)
    entry.emitter.setPosition(position ?? this.eye)
    entry.emitter.setMask(1 / (1 + (this.listenerSpeed / 30) ** 2))
    entry.voice.trigger(frame.time, true, speed)
    this.tinkles++
  }

  private prepareCasings(context: AudioContext, noise: AudioBufferSourceNode): void {
    if (!this.casingVoices.length) {
      for (let i = 0; i < 4; i++) {
        const emitter = new SpatialEmitter(context, audioBus(context), {
          referenceDistance: 0.75,
          maxDistance: 12,
          rolloff: 2,
        })
        const voice = withAudioOutputs(
          context,
          { sfx: emitter.input },
          () => new CasingTinkle(context, noise),
        )
        this.casingVoices.push({ emitter, voice })
      }
    }
  }
  /** Casing tinkles played so far, for tests and the renderer dataset. */
  get casingCount(): number {
    return this.tinkles
  }

  tires(slip: number, speedKmh: number): void {
    const frame = this.frame()
    if (!frame || !this.tireVoice) return
    this.tireVoice.update(frame.time, frame.audible, slip, speedKmh)
  }
  /** Footpeg scrape grind, 0 (none) … 1, from the two-wheeler pose. */
  scrape(level: number, speedKmh: number): void {
    const frame = this.frame()
    if (!frame || !this.scrapeVoice) return
    this.scrapeVoice.update(frame.time, frame.audible, level, speedKmh)
  }
  /** Current scrape gain, for tests. */
  get scrapeLevel(): number {
    return this.scrapeVoice?.level ?? 0
  }
  private build(): void {
    const context = new AudioContext()
    this.mixer.attach(context)
    const noise = loopingNoise(context)
    for (let i = 0; i < 4; i++) {
      const emitter = new SpatialEmitter(context, audioBus(context), {
        referenceDistance: 5,
        maxDistance: 250,
      })
      this.destructionVoices.push({
        emitter,
        voice: new DestructionSound(context, noise, emitter.input),
      })
    }
    this.context = context
    this.prepareCasings(context, noise)
    for (let i = 0; i < 8; i++) {
      const emitter = new SpatialEmitter(context, audioBus(context), {
        referenceDistance: 2,
        maxDistance: 150,
      })
      this.metalEmitters.push(emitter)
      this.metalVoices.push(
        withAudioOutputs(context, { sfx: emitter.input }, () => new MetalImpact(context, noise)),
      )
    }
    this.vehicleEngine = new SpatialEmitter(context, audioBus(context, 'engine'), {
      referenceDistance: 3,
      maxDistance: 180,
    })
    this.vehicleEffects = new SpatialEmitter(context, audioBus(context), {
      referenceDistance: 2,
      maxDistance: 60,
    })
    this.weaponEmitter = new SpatialEmitter(context, audioBus(context), {
      referenceDistance: 1,
      maxDistance: 250,
    })
    this.turbineEmitter = new SpatialEmitter(context, audioBus(context, 'engine'), {
      referenceDistance: 3,
      maxDistance: 180,
    })
    this.turbineVoice = withAudioOutputs(
      context,
      { engine: this.turbineEmitter.input },
      () => new Turbine(context, noise),
    )
    withAudioOutputs(
      context,
      { engine: this.vehicleEngine.input, sfx: this.vehicleEffects.input },
      () => {
        this.propellerVoice = new Propeller(context)
        this.tireVoice = new TireSqueal(context, noise)
        this.scrapeVoice = new MetalScrape(context, noise)
        this.powertrainVoice = new Powertrain(context, noise)
        this.reverseVoice = new ReverseAlarm(context)
        this.startVoice = new EngineStart(context, noise)
        this.gearVoice = new GearClack(context, noise)
        this.clickVoice = new GearClick(context, noise)
      },
    )
    this.gunshotVoice = withAudioOutputs(
      context,
      { sfx: this.weaponEmitter.input },
      () => new Gunshot(context, noise),
    )
    this.weaponClickVoice = withAudioOutputs(
      context,
      { sfx: this.weaponEmitter.input },
      () => new GearClick(context, noise),
    )
    this.weaponHandling = withAudioOutputs(
      context,
      { sfx: this.weaponEmitter.input },
      () => new WeaponHandling(context, noise),
    )
    this.setListener(this.eye, this.orientation, this.listenerSpeed)
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
    this.scrapeVoice?.silence(time)
    this.powertrainVoice?.silence(time)
    this.gearVoice?.silence(time)
    this.clickVoice?.silence(time)
    this.weaponClickVoice?.silence(time)
    this.startVoice?.silence(time)
    this.reverseVoice?.silence(time)
    this.gunshotVoice?.silence(time)
    this.weaponHandling?.silence(time)
    for (const voice of this.metalVoices) voice.silence(time)
    for (const entry of this.casingVoices) entry.voice.silence(time)
    for (const entry of this.destructionVoices) entry.voice.silence(time)
  }
}
