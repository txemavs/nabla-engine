/**
 * Shape of an explosion `scale` times a vehicle's (1 = a vehicle, the default). Smaller blasts are
 * quieter, shorter and higher-pitched; never louder than a vehicle.
 */
export function blastVoice(scale = 1) {
  const s = Math.min(1, Math.max(0.05, Number.isFinite(scale) ? scale : 1))
  const level = s ** 0.6,
    length = s ** 0.4,
    pitch = s ** -0.3
  return {
    noisePeak: 0.7 * level,
    noiseDuration: 1.3 * length,
    bassPeak: 0.65 * level,
    bassDuration: 0.6 * length,
    filterHz: 850 * pitch,
    bassStartHz: 105 * pitch,
    bassEndHz: 28 * pitch,
  }
}

/** Preallocated noise and bass voice for explosions and sharp glass breaks. */
export class DestructionSound {
  private readonly noiseLevel: GainNode
  private readonly bassLevel: GainNode
  private readonly filter: BiquadFilterNode
  private readonly bass: OscillatorNode
  constructor(context: AudioContext, noise: AudioBufferSourceNode, output: AudioNode) {
    this.noiseLevel = context.createGain()
    this.bassLevel = context.createGain()
    this.noiseLevel.gain.value = this.bassLevel.gain.value = 0
    this.filter = context.createBiquadFilter()
    this.filter.type = 'lowpass'
    noise.connect(this.filter)
    this.filter.connect(this.noiseLevel)
    this.noiseLevel.connect(output)
    this.bass = context.createOscillator()
    this.bass.connect(this.bassLevel)
    this.bassLevel.connect(output)
    this.bass.start()
  }
  /** `scale` sizes an explosion (see `blastVoice`); glass breaks ignore it. */
  trigger(time: number, glass = false, scale = 1): void {
    const voice = blastVoice(scale)
    this.filter.type = glass ? 'highpass' : 'lowpass'
    this.filter.frequency.setValueAtTime(glass ? 2200 : voice.filterHz, time)
    for (const [gain, peak, duration] of [
      [this.noiseLevel.gain, glass ? 0.22 : voice.noisePeak, glass ? 0.28 : voice.noiseDuration],
      [this.bassLevel.gain, glass ? 0 : voice.bassPeak, voice.bassDuration],
    ] as const) {
      gain.cancelScheduledValues(time)
      gain.setValueAtTime(0, time)
      if (!peak) continue
      gain.linearRampToValueAtTime(peak, time + 0.004)
      gain.exponentialRampToValueAtTime(0.0001, time + duration)
      gain.setValueAtTime(0, time + duration + 0.01)
    }
    this.bass.frequency.cancelScheduledValues(time)
    this.bass.frequency.setValueAtTime(voice.bassStartHz, time)
    this.bass.frequency.exponentialRampToValueAtTime(voice.bassEndHz, time + 0.5)
  }
  silence(time: number): void {
    for (const gain of [this.noiseLevel.gain, this.bassLevel.gain]) {
      gain.cancelScheduledValues(time)
      gain.setTargetAtTime(0, time, 0.01)
    }
  }
}
