import { loopingNoise, silentOutput } from './graph.js'

/**
 * Piston idle for the occupied plane. A triangle tone and its own exhaust
 * noise, both lowpassed. `level` is the simulation prop spool, 0..1.
 */
export class Propeller {
  private readonly output: GainNode
  private readonly tone: OscillatorNode
  private readonly filter: BiquadFilterNode

  constructor(context: AudioContext) {
    this.output = silentOutput(context, 'engine')

    this.filter = context.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.frequency.value = 240
    this.filter.Q.value = 0.6
    this.filter.connect(this.output)

    this.tone = context.createOscillator()
    this.tone.type = 'triangle'
    this.tone.frequency.value = 78
    const toneLevel = context.createGain()
    toneLevel.gain.value = 0.55
    this.tone.connect(toneLevel)
    toneLevel.connect(this.filter)
    this.tone.start()

    const exhaustLevel = context.createGain()
    exhaustLevel.gain.value = 0.22
    loopingNoise(context).connect(exhaustLevel)
    exhaustLevel.connect(this.filter)
  }

  silence(time: number): void {
    this.output.gain.setTargetAtTime(0, time, 0.05)
  }

  update(time: number, audible: boolean, level: number): void {
    const amount = audible ? Math.max(0, Math.min(1, level)) : 0
    this.output.gain.setTargetAtTime(amount * 0.045, time, 0.12)
    this.tone.frequency.setTargetAtTime(70 + amount * 85, time, 0.1)
    this.filter.frequency.setTargetAtTime(200 + amount * 480, time, 0.15)
  }
}
