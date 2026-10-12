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
  trigger(time: number, glass = false): void {
    this.filter.type = glass ? 'highpass' : 'lowpass'
    this.filter.frequency.setValueAtTime(glass ? 2200 : 850, time)
    for (const [gain, peak, duration] of [
      [this.noiseLevel.gain, glass ? 0.22 : 0.7, glass ? 0.28 : 1.3],
      [this.bassLevel.gain, glass ? 0 : 0.65, 0.6],
    ] as const) {
      gain.cancelScheduledValues(time)
      gain.setValueAtTime(0, time)
      if (!peak) continue
      gain.linearRampToValueAtTime(peak, time + 0.004)
      gain.exponentialRampToValueAtTime(0.0001, time + duration)
      gain.setValueAtTime(0, time + duration + 0.01)
    }
    this.bass.frequency.cancelScheduledValues(time)
    this.bass.frequency.setValueAtTime(105, time)
    this.bass.frequency.exponentialRampToValueAtTime(28, time + 0.5)
  }
  silence(time: number): void {
    for (const gain of [this.noiseLevel.gain, this.bassLevel.gain]) {
      gain.cancelScheduledValues(time)
      gain.setTargetAtTime(0, time, 0.01)
    }
  }
}
