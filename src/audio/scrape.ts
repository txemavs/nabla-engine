import { silentOutput } from './graph.js'

/**
 * Footpeg scrape: the shared noise through a high, wide band with a little flutter, a light
 * metallic grind under the engine. No new nodes per scrape. `level` 0 is silent, 1 full.
 */
export class MetalScrape {
  private readonly output: GainNode
  private readonly filter: BiquadFilterNode

  constructor(
    context: AudioContext,
    noise: AudioBufferSourceNode,
    private readonly random: () => number = Math.random,
  ) {
    this.output = silentOutput(context)
    const highpass = context.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = 1800
    this.filter = context.createBiquadFilter()
    this.filter.type = 'bandpass'
    this.filter.Q.value = 1.4
    this.filter.frequency.value = 3600
    highpass.connect(this.filter)
    this.filter.connect(this.output)
    noise.connect(highpass)
  }

  get level(): number {
    return this.output.gain.value
  }

  silence(time: number): void {
    this.output.gain.setTargetAtTime(0, time, 0.04)
  }

  /** `level` 0..1 (the pose's scrape); `speedKmh` raises the band. */
  update(time: number, audible: boolean, level: number, speedKmh: number): void {
    const amount = audible && Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0
    const speed = Math.min(200, Math.max(0, speedKmh || 0))
    // Uneven contact: the grind flutters by up to ±35 %.
    const flutter = amount > 0 ? 0.65 + 0.7 * this.random() : 0
    this.output.gain.setTargetAtTime(amount * flutter * 0.05, time, 0.03)
    this.filter.frequency.setTargetAtTime(3200 + speed * 9, time, 0.1)
  }
}
