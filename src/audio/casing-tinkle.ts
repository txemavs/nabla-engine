/**
 * Brass casing hitting the ground: a short metallic "tink", fully synthesized. Three inharmonic
 * sine partials (a thin tube rings at non-integer ratios) with fast exponential decays plus a
 * tick of band-passed noise. Loudness follows the impact speed. Nodes are created once; a
 * trigger only schedules envelopes. Sound design values, not measurements.
 */
const SILENT = 0.0001

export const casingTinkleDefaults = Object.freeze({
  /** Partial frequencies, Hz, and their decays, seconds. */
  partials: [
    { hz: 3700, decay: 0.16 },
    { hz: 5900, decay: 0.1 },
    { hz: 8300, decay: 0.06 },
  ],
  /** Peak gain at a 3 m/s impact. */
  peak: 0.05,
})

export class CasingTinkle {
  private readonly oscillators: OscillatorNode[] = []
  private readonly levels: GainNode[] = []
  private readonly tick: GainNode

  constructor(context: AudioContext, noise: AudioBufferSourceNode) {
    for (const partial of casingTinkleDefaults.partials) {
      const level = context.createGain()
      level.gain.value = 0
      level.connect(context.destination)
      const oscillator = context.createOscillator()
      oscillator.type = 'sine'
      oscillator.frequency.value = partial.hz
      oscillator.connect(level)
      oscillator.start()
      this.oscillators.push(oscillator)
      this.levels.push(level)
    }
    this.tick = context.createGain()
    this.tick.gain.value = 0
    this.tick.connect(context.destination)
    const band = context.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 6000
    band.Q.value = 2
    band.connect(this.tick)
    noise.connect(band)
  }

  /** One impact at audio time `time`, `speed` m/s. */
  trigger(time: number, audible: boolean, speed: number): void {
    if (!audible || !(speed > 0)) return
    const peak = casingTinkleDefaults.peak * Math.min(1.5, speed / 3)
    const detune = 0.97 + Math.random() * 0.06
    casingTinkleDefaults.partials.forEach((partial, i) => {
      this.oscillators[i].frequency.setValueAtTime(partial.hz * detune, time)
      const gain = this.levels[i].gain
      gain.cancelScheduledValues(time)
      gain.setValueAtTime(SILENT, time)
      gain.linearRampToValueAtTime(Math.max(SILENT, peak / (i + 1)), time + 0.001)
      gain.exponentialRampToValueAtTime(SILENT, time + 0.001 + partial.decay)
      gain.setValueAtTime(0, time + 0.003 + partial.decay)
    })
    const tick = this.tick.gain
    tick.cancelScheduledValues(time)
    tick.setValueAtTime(SILENT, time)
    tick.linearRampToValueAtTime(Math.max(SILENT, peak * 0.6), time + 0.001)
    tick.exponentialRampToValueAtTime(SILENT, time + 0.012)
    tick.setValueAtTime(0, time + 0.014)
  }

  silence(time: number): void {
    for (const level of [...this.levels, this.tick]) {
      level.gain.cancelScheduledValues(time)
      level.gain.setTargetAtTime(0, time, 0.01)
    }
  }
}
