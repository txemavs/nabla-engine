import { audioBus } from './mixer.js'
/** Resonant bands measured from the owner's reference tail. Four artistic timbre variants. */
export const metalImpactProfiles = [
  [542, 800, 1142, 2162],
  [568, 840, 1186, 2260],
  [515, 765, 1090, 2050],
  [550, 925, 1396, 2162],
] as const
/** Bounded variation preserves the metal identity and avoids large loudness jumps. */
export function metalStrike(random: () => number = Math.random) {
  const pitch = 0.9 + random() * 0.2
  const damping = 0.72 + random() * 0.68
  const strength = 0.86 + random() * 0.24
  return {
    pitch,
    damping,
    strength,
    attack: 0.0007 + random() * 0.002,
    filter: 1500 + random() * 1300,
    q: 0.55 + random() * 1.1,
    modes: Array.from({ length: 4 }, () => ({
      detune: 0.975 + random() * 0.05,
      level: 0.75 + random() * 0.5,
      delay: random() * 0.003,
      decay: 0.8 + random() * 0.4,
    })),
  }
}
/** Per-surface shift of the strike (`config/impact-sounds.ts`); omitted fields keep 1. */
export interface MetalTone {
  pitch?: number
  level?: number
  decay?: number
}
export class MetalImpact {
  private readonly oscillators: OscillatorNode[] = []
  private readonly levels: GainNode[] = []
  private readonly tick: GainNode
  private readonly band: BiquadFilterNode
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
    const band = (this.band = context.createBiquadFilter())
    band.type = 'bandpass'
    band.frequency.value = 1900
    band.Q.value = 0.8
    noise.connect(band)
    band.connect(this.tick)
  }
  trigger(time: number, variant?: number, tone: MetalTone = {}): void {
    const profile = metalImpactProfiles[(variant ?? Math.floor(Math.random() * 4)) % 4]
    const variation = metalStrike()
    variation.pitch *= tone.pitch ?? 1
    variation.strength *= tone.level ?? 1
    variation.damping *= tone.decay ?? 1
    this.band.frequency.setValueAtTime(variation.filter, time)
    this.band.Q.setValueAtTime(variation.q, time)
    const strike = (gain: AudioParam, peak: number, decay: number, delay = 0) => {
      gain.cancelScheduledValues(time)
      gain.setValueAtTime(0.0001, time + delay)
      gain.linearRampToValueAtTime(peak, time + delay + variation.attack)
      gain.exponentialRampToValueAtTime(0.0001, time + delay + variation.attack + decay)
      gain.setValueAtTime(0, time + delay + variation.attack + 0.003 + decay)
    }
    profile.forEach((hz, i) => {
      const mode = variation.modes[i]
      const frequency = this.oscillators[i].frequency
      frequency.cancelScheduledValues(time)
      frequency.setValueAtTime(hz * variation.pitch * mode.detune * 1.015, time)
      frequency.exponentialRampToValueAtTime(hz * variation.pitch * mode.detune, time + 0.025)
      strike(
        this.levels[i].gain,
        (0.17 / (i + 1)) * variation.strength * mode.level,
        (0.34 - i * 0.055) * variation.damping * mode.decay,
        mode.delay,
      )
    })
    strike(this.tick.gain, 0.24 * variation.strength, 0.014 + Math.random() * 0.023)
  }
  silence(time: number): void {
    for (const node of [...this.levels, this.tick]) {
      node.gain.cancelScheduledValues(time)
      node.gain.setTargetAtTime(0, time, 0.01)
    }
  }
}
