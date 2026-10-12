import { audioBus } from './mixer.js'
/** Resonant bands measured from the owner's reference tail. Four artistic timbre variants. */
export const metalImpactProfiles = [
  [542, 800, 1142, 2162],
  [568, 840, 1186, 2260],
  [515, 765, 1090, 2050],
  [550, 925, 1396, 2162],
] as const
export class MetalImpact {
  private readonly oscillators: OscillatorNode[] = []
  private readonly levels: GainNode[] = []
  private readonly tick: GainNode
  private variant = 0
  constructor(context: AudioContext, noise: AudioBufferSourceNode) {
    for (let i = 0; i < 4; i++) {
      const level = context.createGain()
      level.gain.value = 0
      level.connect(audioBus(context))
      const oscillator = context.createOscillator()
      oscillator.type = 'sine'
      oscillator.connect(level)
      oscillator.start()
      this.oscillators.push(oscillator)
      this.levels.push(level)
    }
    this.tick = context.createGain()
    this.tick.gain.value = 0
    this.tick.connect(audioBus(context))
    const band = context.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 1900
    band.Q.value = 0.8
    noise.connect(band)
    band.connect(this.tick)
  }
  trigger(time: number, variant?: number): void {
    const profile = metalImpactProfiles[(variant ?? this.variant++) % 4]
    const strike = (gain: AudioParam, peak: number, decay: number) => {
      gain.cancelScheduledValues(time)
      gain.setValueAtTime(0.0001, time)
      gain.linearRampToValueAtTime(peak, time + 0.001)
      gain.exponentialRampToValueAtTime(0.0001, time + 0.001 + decay)
      gain.setValueAtTime(0, time + 0.004 + decay)
    }
    profile.forEach((hz, i) => {
      this.oscillators[i].frequency.setValueAtTime(hz, time)
      strike(this.levels[i].gain, 0.17 / (i + 1), 0.34 - i * 0.055)
    })
    strike(this.tick.gain, 0.24, 0.025)
  }
  silence(time: number): void {
    for (const node of [...this.levels, this.tick]) {
      node.gain.cancelScheduledValues(time)
      node.gain.setTargetAtTime(0, time, 0.01)
    }
  }
}
