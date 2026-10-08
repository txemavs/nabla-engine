/**
 * Gear-change "click", fully synthesized: no sample files. A single short transient of the
 * shared noise through a bandpass, a few tens of milliseconds long and quiet, for a
 * motorcycle's sequential gearbox (or any vehicle whose preset asks for `gearShift.sound:
 * 'click'`). The nodes are created once; a trigger only schedules an envelope.
 */
export interface GearClickSound {
  /** Loudness multiplier, 0..2. 1 is already well below the car clack. */
  volume?: number
  /** Bandpass centre, Hz. Omitted keeps the gearbox tick. */
  bandHz?: number
  /** Bandpass Q. Omitted keeps the gearbox tick. */
  q?: number
  /** Peak gain at volume 1. Omitted keeps the gearbox tick. */
  peak?: number
  /** Exponential decay, seconds. Omitted keeps the gearbox tick. */
  decaySeconds?: number
}

/** Shape of the click. Peak gain is roughly a fifth of the car clack's main hit. */
export const gearClickDefaults = Object.freeze({
  /** Centre of the noise band, Hz. */
  bandHz: 3200,
  /** Bandpass Q: narrow enough to read as metal, wide enough to stay a tick. */
  q: 1.8,
  /** Peak gain at volume 1. */
  peak: 0.03,
  /** Attack, seconds. */
  attackSeconds: 0.002,
  /** Exponential decay, seconds; the whole click is ~30 ms. */
  decaySeconds: 0.028,
})

const SILENT = 0.0001

export function resolveGearClickVolume(sound?: GearClickSound | null): number {
  const volume = sound?.volume
  return typeof volume === 'number' && Number.isFinite(volume)
    ? Math.min(2, Math.max(0, volume))
    : 1
}

function shaped(value: number | undefined, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

/** Peak gain of one click, after the volume multiplier. Gearbox clicks stay at the default. */
export function gearClickPeak(sound?: GearClickSound | null): number {
  return shaped(sound?.peak, gearClickDefaults.peak, 0, 0.2) * resolveGearClickVolume(sound)
}

/**
 * Magazine release and insert. Louder than the gearbox tick those events used, and not the same
 * timbre: the release is a dull knock, the insert a short sharp tick.
 *
 * The old peaks were `0.03 * 0.9` (drop) and `0.03 * 1.2` (seat). +9 dB is ×10^(9/20) ≈ ×2.82.
 * Release 0.08 / 0.027 ≈ +9.4 dB. Insert 0.10 / 0.036 ≈ +8.9 dB. The +8–10 dB is the request,
 * not a measured recording.
 */
export const magazineReleaseClick: GearClickSound = {
  bandHz: 700,
  q: 0.9,
  peak: 0.08,
  decaySeconds: 0.07,
}
export const magazineInsertClick: GearClickSound = {
  bandHz: 3400,
  q: 2.4,
  peak: 0.1,
  decaySeconds: 0.016,
}

export class GearClick {
  private readonly level: GainNode
  private readonly band: BiquadFilterNode

  constructor(context: AudioContext, noise: AudioBufferSourceNode) {
    this.level = context.createGain()
    this.level.gain.value = 0
    this.level.connect(context.destination)
    this.band = context.createBiquadFilter()
    this.band.type = 'bandpass'
    this.band.frequency.value = gearClickDefaults.bandHz
    this.band.Q.value = gearClickDefaults.q
    this.band.connect(this.level)
    noise.connect(this.band)
  }

  /** Schedule one click at audio time `time`. Silent when not `audible` or at volume 0. */
  trigger(time: number, audible: boolean, sound?: GearClickSound | null): void {
    const volume = resolveGearClickVolume(sound)
    if (!audible || volume <= 0) return
    const d = gearClickDefaults
    // Set the filter on every trigger so a magazine click cannot leave the gearbox tick dull.
    this.band.frequency.setValueAtTime(shaped(sound?.bandHz, d.bandHz, 80, 8000), time)
    this.band.Q.setValueAtTime(shaped(sound?.q, d.q, 0.2, 18), time)
    const decay = shaped(sound?.decaySeconds, d.decaySeconds, 0.005, 0.2)
    const param = this.level.gain
    param.cancelScheduledValues(time)
    param.setValueAtTime(SILENT, time)
    param.linearRampToValueAtTime(Math.max(SILENT, gearClickPeak(sound)), time + d.attackSeconds)
    param.exponentialRampToValueAtTime(SILENT, time + d.attackSeconds + decay)
    param.setValueAtTime(0, time + d.attackSeconds + decay + 0.003)
  }

  silence(time: number): void {
    this.level.gain.cancelScheduledValues(time)
    this.level.gain.setTargetAtTime(0, time, 0.01)
  }
}
