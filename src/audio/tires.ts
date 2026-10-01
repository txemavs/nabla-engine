import { silentOutput } from './graph.js'

/**
 * Tire squeal. The shared noise through a narrow bandpass.
 * No new nodes per skid. Slip below 0.2 is silent; 1 is full squeal.
 */
export class TireSqueal {
  private readonly output: GainNode
  private readonly filter: BiquadFilterNode

  constructor(context: AudioContext, noise: AudioBufferSourceNode) {
    this.output = silentOutput(context)

    this.filter = context.createBiquadFilter()
    this.filter.type = 'bandpass'
    this.filter.Q.value = 7
    this.filter.connect(this.output)
    noise.connect(this.filter)
  }

  get level(): number {
    return this.output.gain.value
  }

  silence(time: number): void {
    this.output.gain.setTargetAtTime(0, time, 0.05)
  }

  /** Airborne contacts should pass slip 0. `speedKmh` raises the band center. */
  update(time: number, audible: boolean, slip: number, speedKmh: number): void {
    const slipping = audible && Number.isFinite(slip)
    const amount = slipping ? Math.max(0, Math.min(1, (slip - 0.2) / 0.8)) : 0
    const speed = Math.min(160, Math.max(0, speedKmh || 0))
    this.output.gain.setTargetAtTime(amount * 0.085, time, 0.08)
    this.filter.frequency.setTargetAtTime(950 + speed * 3 + amount * 280, time, 0.12)
  }
}
