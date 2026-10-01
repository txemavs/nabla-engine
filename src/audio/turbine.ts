import { silentOutput } from './graph.js'

/**
 * Turbine of the nearest flying craft that is not a propeller plane
 * (the container ship). Looped noise through a lowpass, plus a quiet sine hum.
 */
export class Turbine {
  private readonly output: GainNode
  private readonly filter: BiquadFilterNode
  private readonly hum: OscillatorNode

  constructor(context: AudioContext, noise: AudioBufferSourceNode) {
    this.output = silentOutput(context)

    this.filter = context.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.frequency.value = 450
    this.filter.Q.value = 0.5
    this.filter.connect(this.output)
    noise.connect(this.filter)

    this.hum = context.createOscillator()
    this.hum.type = 'sine'
    this.hum.frequency.value = 65
    const humLevel = context.createGain()
    humLevel.gain.value = 0.14
    this.hum.connect(humLevel)
    humLevel.connect(this.output)
    this.hum.start()
  }

  silence(time: number): void {
    this.output.gain.setTargetAtTime(0, time, 0.05)
  }

  /**
   * `level` is 0..1 after distance and cabin attenuation.
   * `speedKmh` opens the lowpass and raises the hum.
   */
  update(time: number, audible: boolean, level: number, speedKmh: number): void {
    const speed = Math.min(1000, speedKmh)
    const amount = audible ? Math.min(1, level) * 0.18 : 0
    this.output.gain.setTargetAtTime(amount, time, 0.15)
    this.filter.frequency.setTargetAtTime(400 + speed * 0.8, time, 0.2)
    this.hum.frequency.setTargetAtTime(65 + speed * 0.06, time, 0.2)
  }
}
