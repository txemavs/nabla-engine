/**
 * Gear-change "clack", fully synthesized: no sample files. Two impacts (selection, then
 * engagement) plus an optional air-release hiss. Each impact is a short pitch-falling sine
 * (the thump of the gearbox casing) plus the shared noise through a bandpass (the metal
 * click). The nodes are created once; a trigger only schedules envelopes.
 *
 * A light road car uses the defaults. A truck passes lower frequencies, longer decays and
 * an air hiss, so it sounds like a heavy dog-clutch box with air-assisted shifting.
 */
export interface GearClackSound {
  /** Body of the thump, Hz. */
  clunkHz?: number
  /** Centre of the metallic click band, Hz. */
  clickHz?: number
  /** Loudness multiplier, 0..2. */
  gain?: number
  /** Decay of the main hit, seconds. */
  decaySeconds?: number
  /** Delay of the second (engagement) hit, seconds; 0 disables it. */
  echoSeconds?: number
  /** Length of the air-release hiss, seconds; 0 disables it. */
  airSeconds?: number
}

/** Light road car: a short, dry, high "clac". */
export const carGearClack: Readonly<Required<GearClackSound>> = Object.freeze({
  clunkHz: 150,
  clickHz: 2400,
  gain: 1,
  decaySeconds: 0.07,
  echoSeconds: 0.05,
  airSeconds: 0,
})

const bounded = (value: number | undefined, fallback: number, low: number, high: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(high, Math.max(low, value))
    : fallback

/** Fill omitted or invalid fields from the car sound and clamp every field to a safe range. */
export function resolveGearClack(sound?: GearClackSound | null): Required<GearClackSound> {
  return {
    clunkHz: bounded(sound?.clunkHz, carGearClack.clunkHz, 30, 500),
    clickHz: bounded(sound?.clickHz, carGearClack.clickHz, 200, 8000),
    gain: bounded(sound?.gain, carGearClack.gain, 0, 2),
    decaySeconds: bounded(sound?.decaySeconds, carGearClack.decaySeconds, 0.02, 0.8),
    echoSeconds: bounded(sound?.echoSeconds, carGearClack.echoSeconds, 0, 0.5),
    airSeconds: bounded(sound?.airSeconds, carGearClack.airSeconds, 0, 1.5),
  }
}

const SILENT = 0.0001

/** Attack-decay envelope on one gain. Cancels only its own earlier schedule. */
function strike(param: AudioParam, time: number, peak: number, decay: number): void {
  param.cancelScheduledValues(time)
  param.setValueAtTime(SILENT, time)
  param.linearRampToValueAtTime(Math.max(SILENT, peak), time + 0.003)
  param.exponentialRampToValueAtTime(SILENT, time + 0.003 + decay)
  param.setValueAtTime(0, time + 0.006 + decay)
}

/** One impact: thump oscillator and click noise, each with its own envelope gain. */
class Impact {
  private readonly thumpLevel: GainNode
  private readonly clickLevel: GainNode
  private readonly thump: OscillatorNode
  private readonly clickBand: BiquadFilterNode

  constructor(context: AudioContext, noise: AudioBufferSourceNode, output: AudioNode) {
    this.thumpLevel = context.createGain()
    this.thumpLevel.gain.value = 0
    this.thumpLevel.connect(output)
    this.thump = context.createOscillator()
    this.thump.type = 'sine'
    this.thump.frequency.value = carGearClack.clunkHz
    this.thump.connect(this.thumpLevel)
    this.thump.start()

    this.clickLevel = context.createGain()
    this.clickLevel.gain.value = 0
    this.clickLevel.connect(output)
    this.clickBand = context.createBiquadFilter()
    this.clickBand.type = 'bandpass'
    this.clickBand.Q.value = 2.5
    this.clickBand.connect(this.clickLevel)
    noise.connect(this.clickBand)
  }

  hit(time: number, sound: Required<GearClackSound>, strength: number, pitch: number): void {
    const body = sound.clunkHz * pitch
    this.thump.frequency.cancelScheduledValues(time)
    this.thump.frequency.setValueAtTime(body * 1.9, time)
    this.thump.frequency.exponentialRampToValueAtTime(body * 0.6, time + sound.decaySeconds * 1.6)
    this.clickBand.frequency.setValueAtTime(sound.clickHz * pitch, time)
    strike(this.thumpLevel.gain, time, 0.16 * sound.gain * strength, sound.decaySeconds * 1.6)
    strike(this.clickLevel.gain, time, 0.14 * sound.gain * strength, sound.decaySeconds * 0.5)
  }
}

export class GearClack {
  private readonly selection: Impact
  private readonly engagement: Impact
  private readonly airLevel: GainNode

  constructor(context: AudioContext, noise: AudioBufferSourceNode) {
    const output = context.createGain()
    output.gain.value = 1
    output.connect(context.destination)
    this.selection = new Impact(context, noise, output)
    this.engagement = new Impact(context, noise, output)

    this.airLevel = context.createGain()
    this.airLevel.gain.value = 0
    this.airLevel.connect(output)
    const air = context.createBiquadFilter()
    air.type = 'highpass'
    air.frequency.value = 2600
    air.connect(this.airLevel)
    noise.connect(air)
  }

  /** Schedule one gear change starting at audio time `time`. Silent when not `audible`. */
  trigger(time: number, audible: boolean, sound?: GearClackSound | null): void {
    if (!audible) return
    const resolved = resolveGearClack(sound)
    this.selection.hit(time, resolved, 1, 1)
    if (resolved.echoSeconds > 0)
      this.engagement.hit(time + resolved.echoSeconds, resolved, 0.75, 0.82)
    if (resolved.airSeconds > 0) {
      // Air-release hiss starting just after the engagement hit.
      const start = time + resolved.echoSeconds + 0.02
      const level = this.airLevel.gain
      level.cancelScheduledValues(start)
      level.setValueAtTime(SILENT, start)
      level.linearRampToValueAtTime(0.05 * resolved.gain, start + 0.03)
      level.exponentialRampToValueAtTime(SILENT, start + 0.03 + resolved.airSeconds)
      level.setValueAtTime(0, start + 0.05 + resolved.airSeconds)
    }
  }

  silence(time: number): void {
    this.airLevel.gain.cancelScheduledValues(time)
    this.airLevel.gain.setTargetAtTime(0, time, 0.02)
  }
}
