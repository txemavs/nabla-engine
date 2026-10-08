/**
 * Procedural V4 engine voice, fully synthesized (no sample files).
 *
 * One four-stroke cycle is 720° of crank rotation, two revolutions. Each cylinder fires once
 * per cycle, at one of its two top dead centres. In a V4 with the banks `vAngle` apart and two
 * crankpins `crankpin` degrees apart, the cylinder on bank angle β riding a pin at offset ψ
 * reaches top dead centre at crank angle β − ψ (and 360° later). `v4FiringAngles` picks one
 * of those per cylinder so the largest gap is as small as possible: a 90° V4 with a 180° crank
 * fires at 0°, 90°, 270°, 540° (gaps 90-180-270-180), a 360° crank at 0°, 90°, 360°, 450°
 * (90-270-90-270). Those uneven gaps put energy into the half-orders below the firing
 * frequency, the lumpy V4 beat an evenly firing inline four (gaps 180-180-180-180, energy only
 * at multiples of the firing rate) does not have.
 *
 * The voice plays one exhaust pressure pulse per firing as a single `PeriodicWave` whose
 * fundamental is the cycle rate (rpm / 120 Hz), so the uneven pattern is exact at every rpm
 * and costs one oscillator. A soft saturator and an rpm/load lowpass shape it, and a little
 * band-passed noise stands in for intake roar under load.
 */
import { silentOutput } from './graph.js'

/** Defaults of the V4 voice. Timbre values are gameplay choices, not measurements. */
export const v4EngineDefaults = Object.freeze({
  vAngle: 90,
  crankpin: 180,
  /** Harmonics of the cycle rate in the periodic wave. */
  harmonics: 64,
  /** Exhaust pulse rise/decay time as a share of the 720° cycle (0.025 ≈ 18° of crank). */
  pulseWidth: 0.025,
  /** Output gain at idle and the extra at full load, before `volume`. */
  idleGain: 0.03,
  loadGain: 0.06,
  /** Saturator drive (tanh). */
  drive: 2.2,
  /** Lowpass cutoff: base + rpm·slope + load·boost, Hz. */
  cutoffBaseHz: 180,
  cutoffPerRpm: 0.12,
  cutoffLoadHz: 900,
  /** Intake noise level at full load. */
  intakeGain: 0.012,
})

/** Cycle (720°) rate of a four-stroke at `rpm`, Hz: the fundamental of the V4 voice. */
export const v4CycleHz = (rpm: number): number => Math.max(0, rpm) / 120

const mod = (n: number, m: number) => ((n % m) + m) % m

/**
 * Firing crank angles in the 720° cycle, ascending from 0, for a V4 with `vAngle` degrees
 * between the banks and `crankpin` degrees between its two crankpins (two cylinders, one per
 * bank, on each pin). Among all valid choices of top dead centre the one with the smallest
 * largest gap wins (then the earliest angles), as in a production firing order.
 */
export function v4FiringAngles(
  vAngle: number = v4EngineDefaults.vAngle,
  crankpin: number = v4EngineDefaults.crankpin,
): number[] {
  if (!Number.isFinite(vAngle) || !Number.isFinite(crankpin))
    throw new Error('V angle and crankpin offset must be finite')
  // [bank angle, pin offset] for the four cylinders.
  const cylinders: [number, number][] = [
    [0, 0],
    [vAngle, 0],
    [0, crankpin],
    [vAngle, crankpin],
  ]
  const first = cylinders.map(([bank, pin]) => mod(bank - pin, 360))
  const origin = first[0]
  let best: number[] | null = null
  let bestGap = Infinity
  for (let mask = 0; mask < 8; mask++) {
    const angles = [0]
    for (let c = 1; c < 4; c++)
      angles.push(mod(first[c] - origin + ((mask >> (c - 1)) & 1 ? 360 : 0), 720))
    angles.sort((a, b) => a - b)
    const gaps = firingIntervals(angles)
    const largest = Math.max(...gaps)
    const earlier = (a: number[], b: number[]) => {
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]
      return false
    }
    const better =
      largest < bestGap - 1e-9 ||
      (Math.abs(largest - bestGap) <= 1e-9 && best !== null && earlier(angles, best))
    if (better) {
      best = angles
      bestGap = largest
    }
  }
  return best!.map((angle) => Math.round(angle * 1e6) / 1e6)
}

/** Gaps between consecutive firings around the 720° cycle, degrees (they sum to 720). */
export function firingIntervals(angles: readonly number[]): number[] {
  if (angles.length === 0) return []
  const sorted = [...angles].map((a) => mod(a, 720)).sort((a, b) => a - b)
  return sorted.map((angle, i) =>
    i + 1 < sorted.length ? sorted[i + 1] - angle : 720 - angle + sorted[0],
  )
}

/**
 * Fourier series of one 720° cycle of exhaust pulses, one per firing angle, each a
 * fast-rise / exponential-decay pressure pulse `pulseWidth` (share of the cycle) long. Returns
 * the cosine (`real`) and sine (`imag`) coefficients per cycle harmonic, index 0 (DC) zero, in
 * the layout `AudioContext.createPeriodicWave` takes.
 */
export function firingPulseHarmonics(
  angles: readonly number[],
  harmonics: number = v4EngineDefaults.harmonics,
  pulseWidth: number = v4EngineDefaults.pulseWidth,
): { real: Float32Array; imag: Float32Array } {
  if (!Number.isInteger(harmonics) || harmonics < 1) throw new Error('Need at least one harmonic')
  if (!(pulseWidth > 0 && pulseWidth < 0.5)) throw new Error('Pulse width must be in (0, 0.5)')
  const samples = 2048
  const wave = new Float64Array(samples)
  const phases = angles.map((angle) => mod(angle, 720) / 720)
  for (let j = 0; j < samples; j++) {
    const t = j / samples
    for (const phase of phases) {
      const x = mod(t - phase, 1) / pulseWidth
      wave[j] += x * Math.exp(1 - x)
    }
  }
  const real = new Float32Array(harmonics + 1)
  const imag = new Float32Array(harmonics + 1)
  for (let n = 1; n <= harmonics; n++) {
    let c = 0,
      s = 0
    for (let j = 0; j < samples; j++) {
      const w = (2 * Math.PI * n * j) / samples
      c += wave[j] * Math.cos(w)
      s += wave[j] * Math.sin(w)
    }
    real[n] = (2 * c) / samples
    imag[n] = (2 * s) / samples
  }
  return { real, imag }
}

/** Magnitude of each harmonic of a `firingPulseHarmonics` result. */
export function harmonicMagnitudes(series: { real: Float32Array; imag: Float32Array }): number[] {
  return Array.from(series.real, (re, n) => Math.hypot(re, series.imag[n]))
}

function saturationCurve(drive: number): Float32Array {
  const curve = new Float32Array(1024)
  const norm = Math.tanh(drive)
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1
    curve[i] = Math.tanh(drive * x) / norm
  }
  return curve
}

/**
 * The V4 voice. Nodes are built once; `update` only automates parameters. Building needs
 * `createPeriodicWave` and `createWaveShaper` (every browser with Web Audio has them).
 */
export class V4Engine {
  private readonly output: GainNode
  private readonly oscillator: OscillatorNode
  private readonly filter: BiquadFilterNode
  private readonly intake: GainNode
  private readonly intakeFilter: BiquadFilterNode
  private firingKey = ''

  constructor(
    private readonly context: AudioContext,
    noise: AudioBufferSourceNode,
    firing: readonly number[] = v4FiringAngles(),
  ) {
    this.output = silentOutput(context)
    this.filter = context.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.Q.value = 0.9
    this.filter.connect(this.output)
    const shaper = context.createWaveShaper()
    shaper.curve = saturationCurve(v4EngineDefaults.drive) as Float32Array<ArrayBuffer>
    shaper.oversample = '2x'
    shaper.connect(this.filter)
    this.oscillator = context.createOscillator()
    this.setFiring(firing)
    this.oscillator.connect(shaper)
    this.oscillator.start()

    this.intake = silentOutput(context)
    this.intakeFilter = context.createBiquadFilter()
    this.intakeFilter.type = 'bandpass'
    this.intakeFilter.Q.value = 1.2
    this.intakeFilter.connect(this.intake)
    noise.connect(this.intakeFilter)
  }

  /** Swap the firing pattern (a different vehicle preset). No-op when unchanged. */
  setFiring(firing: readonly number[]): void {
    const key = firing.join(',')
    if (key === this.firingKey) return
    this.firingKey = key
    const { real, imag } = firingPulseHarmonics(firing)
    this.oscillator.setPeriodicWave(
      this.context.createPeriodicWave(
        real as Float32Array<ArrayBuffer>,
        imag as Float32Array<ArrayBuffer>,
      ),
    )
  }

  silence(time: number): void {
    this.output.gain.setTargetAtTime(0, time, 0.05)
    this.intake.gain.setTargetAtTime(0, time, 0.05)
  }

  update(time: number, audible: boolean, rpm: number, load: number, volume = 1): void {
    const d = v4EngineDefaults
    const level = audible ? (d.idleGain + load * d.loadGain) * volume : 0
    this.output.gain.setTargetAtTime(level, time, 0.035)
    this.oscillator.frequency.setTargetAtTime(Math.max(1, v4CycleHz(rpm)), time, 0.03)
    this.filter.frequency.setTargetAtTime(
      d.cutoffBaseHz + rpm * d.cutoffPerRpm + load * d.cutoffLoadHz,
      time,
      0.04,
    )
    this.intake.gain.setTargetAtTime(audible ? load * d.intakeGain * volume : 0, time, 0.05)
    // Intake band around a few times the firing rate (4 firings per cycle).
    this.intakeFilter.frequency.setTargetAtTime(400 + v4CycleHz(rpm) * 4 * 3, time, 0.05)
  }
}
