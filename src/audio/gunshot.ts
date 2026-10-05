/**
 * Sidearm gunshot, fully synthesized: no sample files. Four layers share one trigger:
 * a bright supersonic crack (high-passed noise, a few milliseconds), the muzzle boom
 * (low-passed noise), a pitch-falling sine thump for chest weight, and a short band-passed
 * tail that stands in for the surroundings. The nodes are created once; a trigger only
 * schedules envelopes, so rapid fire never allocates audio nodes.
 */
const SILENT = 0.0001

/** Attack-decay envelope on one gain. Cancels only its own earlier schedule. */
function strike(param: AudioParam, time: number, peak: number, decay: number): void {
  param.cancelScheduledValues(time)
  param.setValueAtTime(SILENT, time)
  param.linearRampToValueAtTime(Math.max(SILENT, peak), time + 0.001)
  param.exponentialRampToValueAtTime(SILENT, time + 0.001 + decay)
  param.setValueAtTime(0, time + 0.004 + decay)
}

/** Longest scheduled envelope after a trigger, seconds (tail start plus decay). */
export const gunshotSeconds = 0.5

export class Gunshot {
  private readonly crackLevel: GainNode
  private readonly boomLevel: GainNode
  private readonly thumpLevel: GainNode
  private readonly tailLevel: GainNode
  private readonly thump: OscillatorNode
  private readonly crackBand: BiquadFilterNode

  constructor(context: AudioContext, noise: AudioBufferSourceNode) {
    const output = context.createGain()
    output.gain.value = 1
    output.connect(context.destination)
    const level = () => {
      const gain = context.createGain()
      gain.gain.value = 0
      gain.connect(output)
      return gain
    }
    const filter = (type: BiquadFilterType, frequency: number, q: number, into: AudioNode) => {
      const node = context.createBiquadFilter()
      node.type = type
      node.frequency.value = frequency
      node.Q.value = q
      node.connect(into)
      noise.connect(node)
      return node
    }
    this.crackLevel = level()
    this.boomLevel = level()
    this.thumpLevel = level()
    this.tailLevel = level()
    this.crackBand = filter('highpass', 1800, 0.7, this.crackLevel)
    filter('lowpass', 900, 0.9, this.boomLevel)
    filter('bandpass', 520, 0.6, this.tailLevel)
    this.thump = context.createOscillator()
    this.thump.type = 'sine'
    this.thump.frequency.value = 150
    this.thump.connect(this.thumpLevel)
    this.thump.start()
  }

  /** Schedule one shot at audio time `time`. Silent when not `audible`. */
  trigger(time: number, audible: boolean): void {
    if (!audible) return
    // A few percent of variation keeps rapid fire from sounding like one looped sample.
    const pitch = 0.96 + Math.random() * 0.08
    this.crackBand.frequency.setValueAtTime(1800 * pitch, time)
    this.thump.frequency.cancelScheduledValues(time)
    this.thump.frequency.setValueAtTime(170 * pitch, time)
    this.thump.frequency.exponentialRampToValueAtTime(48 * pitch, time + 0.12)
    strike(this.crackLevel.gain, time, 0.38, 0.045)
    strike(this.boomLevel.gain, time, 0.26, 0.18)
    strike(this.thumpLevel.gain, time, 0.3, 0.13)
    strike(this.tailLevel.gain, time + 0.02, 0.07, gunshotSeconds - 0.03)
  }

  silence(time: number): void {
    for (const level of [this.crackLevel, this.boomLevel, this.thumpLevel, this.tailLevel]) {
      level.gain.cancelScheduledValues(time)
      level.gain.setTargetAtTime(0, time, 0.01)
    }
  }
}
