/**
 * Gear-change "click", fully synthesized: no sample files. A single short transient of the
 * shared noise through a bandpass, a few tens of milliseconds long and quiet, for a
 * motorcycle's sequential gearbox (or any vehicle whose preset asks for `gearShift.sound:
 * 'click'`). The nodes are created once; a trigger only schedules an envelope.
 */
export interface GearClickSound {
  /** Loudness multiplier, 0..2. 1 is already well below the car clack. */
  volume?: number
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

export class GearClick {
  private readonly level: GainNode

  constructor(context: AudioContext, noise: AudioBufferSourceNode) {
    this.level = context.createGain()
    this.level.gain.value = 0
    this.level.connect(context.destination)
    const band = context.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = gearClickDefaults.bandHz
    band.Q.value = gearClickDefaults.q
    band.connect(this.level)
    noise.connect(band)
  }

  /** Schedule one click at audio time `time`. Silent when not `audible` or at volume 0. */
  trigger(time: number, audible: boolean, sound?: GearClickSound | null): void {
    const volume = resolveGearClickVolume(sound)
    if (!audible || volume <= 0) return
    const d = gearClickDefaults
    const param = this.level.gain
    param.cancelScheduledValues(time)
    param.setValueAtTime(SILENT, time)
    param.linearRampToValueAtTime(Math.max(SILENT, d.peak * volume), time + d.attackSeconds)
    param.exponentialRampToValueAtTime(SILENT, time + d.attackSeconds + d.decaySeconds)
    param.setValueAtTime(0, time + d.attackSeconds + d.decaySeconds + 0.003)
  }

  silence(time: number): void {
    this.level.gain.cancelScheduledValues(time)
    this.level.gain.setTargetAtTime(0, time, 0.01)
  }
}
