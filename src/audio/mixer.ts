/**
 * Gain buses for one audio context: master → speakers, with an engine bus (every engine,
 * starter, turbo, turbine and propeller voice) and a music bus under it. Other effects
 * (tyres, gears, gunshot, brakes, alarms) feed the master directly.
 */

export type AudioBus = 'master' | 'engine' | 'music' | 'sfx'

/** Player mix, 0..1 per slider (`musicMuted` silences and stops the track). */
export interface AudioMixLevels {
  master: number
  engine: number
  music: number
  musicMuted: boolean
}

/** Starting mix. Music sits under the engine by default. TODO(unverified): a taste choice. */
export const defaultAudioMix: Readonly<AudioMixLevels> = Object.freeze({
  master: 1,
  engine: 1,
  music: 0.5,
  musicMuted: false,
})

interface Buses {
  master: GainNode
  engine: GainNode
  music: GainNode
}

const registry = new WeakMap<BaseAudioContext, Buses>()

/**
 * Fixed lift of the engine bus over the effects on master, so the engine dominates a gear
 * shift on every vehicle (2026-10-09 request: shifts sounded louder than the engine). 1.6 is
 * about +4 dB. TODO(unverified): a listening choice, not a measured recording.
 */
export const engineBusTrim = 1.6

/** Safety limiter on master: the louder engine bus must not clip with music and effects. */
function masterOutput(context: BaseAudioContext): AudioNode {
  if (typeof context.createDynamicsCompressor !== 'function') return context.destination
  const limiter = context.createDynamicsCompressor()
  limiter.threshold.value = -3
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.003
  limiter.release.value = 0.25
  limiter.connect(context.destination)
  return limiter
}

/** Create (once) and return the buses of `context`. */
export function attachAudioBuses(context: BaseAudioContext): Buses {
  let buses = registry.get(context)
  if (!buses) {
    const master = context.createGain()
    master.connect(masterOutput(context))
    const engine = context.createGain()
    engine.connect(master)
    const music = context.createGain()
    music.connect(master)
    buses = { master, engine, music }
    registry.set(context, buses)
  }
  return buses
}

/** Where a voice should connect: its bus when the context has a mixer, else the speakers. */
export function audioBus(context: BaseAudioContext, bus: AudioBus = 'sfx'): AudioNode {
  const buses = registry.get(context)
  if (!buses) return context.destination
  return bus === 'sfx' ? buses.master : buses[bus]
}

function level(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback
}

/** Clamp a partial mix onto `base`; junk fields keep the base value. */
export function normalizeAudioMix(
  patch: Partial<AudioMixLevels> | null | undefined,
  base: AudioMixLevels = defaultAudioMix,
): AudioMixLevels {
  return {
    master: level(patch?.master, base.master),
    engine: level(patch?.engine, base.engine),
    music: level(patch?.music, base.music),
    musicMuted: typeof patch?.musicMuted === 'boolean' ? patch.musicMuted : base.musicMuted,
  }
}

/** Slider position to gain: a squared curve so the lower half of the slider is usable. */
export function sliderGain(value: number): number {
  return value * value
}

/** Holds the player mix and drives the bus gains once a context exists. */
export class AudioMixer {
  private mix: AudioMixLevels
  private buses?: Buses
  private context?: BaseAudioContext
  constructor(levels?: Partial<AudioMixLevels>) {
    this.mix = normalizeAudioMix(levels)
  }
  get levels(): AudioMixLevels {
    return { ...this.mix }
  }
  attach(context: BaseAudioContext): void {
    this.context = context
    this.buses = attachAudioBuses(context)
    this.apply(true)
  }
  set(patch: Partial<AudioMixLevels>): AudioMixLevels {
    this.mix = normalizeAudioMix(patch, this.mix)
    this.apply(false)
    return this.levels
  }
  private apply(now: boolean): void {
    if (!this.buses || !this.context) return
    const time = this.context.currentTime
    const set = (node: GainNode, value: number) => {
      if (now) node.gain.value = value
      else node.gain.setTargetAtTime(value, time, 0.03)
    }
    set(this.buses.master, sliderGain(this.mix.master))
    set(this.buses.engine, sliderGain(this.mix.engine) * engineBusTrim)
    set(this.buses.music, this.mix.musicMuted ? 0 : sliderGain(this.mix.music))
  }
}

export const audioMixStorageKey = 'nabla.audioMix'

type MixStorage = Pick<Storage, 'getItem' | 'setItem'>

/** The player's saved mix, or undefined. */
export function readAudioMix(storage: MixStorage | null | undefined): AudioMixLevels | undefined {
  try {
    const raw = storage?.getItem(audioMixStorageKey)
    if (!raw) return undefined
    const value = JSON.parse(raw) as unknown
    if (!value || typeof value !== 'object') return undefined
    return normalizeAudioMix(value as Partial<AudioMixLevels>)
  } catch {
    return undefined
  }
}

/** Remember the mix; storage errors are ignored. */
export function writeAudioMix(storage: MixStorage | null | undefined, mix: AudioMixLevels): void {
  try {
    storage?.setItem(audioMixStorageKey, JSON.stringify(mix))
  } catch {
    // Private mode or full quota.
  }
}
