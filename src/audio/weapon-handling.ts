import { audioBus } from './mixer.js'
export type WeaponSound =
  | 'prop-impact'
  | 'hammer'
  | 'dry'
  | 'dry-cocked'
  | 'slide-back'
  | 'slide-forward'
  | 'slide-lock'
  | 'magazine-out'
  | 'magazine-in'
  | 'magazine-release'
  | 'safety'
  | 'trigger-reset'
export const handlingProfiles = {
  'prop-impact': [650, 0.025, 0.025],
  hammer: [2800, 0.07, 0.018],
  dry: [2400, 0.055, 0.015],
  'dry-cocked': [2800, 0.07, 0.018],
  'slide-back': [1300, 0.09, 0.1],
  'slide-forward': [2100, 0.14, 0.035],
  'slide-lock': [3100, 0.07, 0.018],
  'magazine-out': [700, 0.08, 0.07],
  'magazine-in': [3400, 0.1, 0.016],
  'magazine-release': [2300, 0.035, 0.012],
  safety: [2600, 0.04, 0.014],
  'trigger-reset': [2900, 0.018, 0.009],
} as const
/** Independent procedural handling actions; shared by desktop and future hand interactions. */
export class WeaponHandling {
  private readonly band: BiquadFilterNode
  private readonly level: GainNode
  constructor(context: AudioContext, noise: AudioBufferSourceNode) {
    this.level = context.createGain()
    this.level.gain.value = 0
    this.level.connect(audioBus(context))
    this.band = context.createBiquadFilter()
    this.band.type = 'bandpass'
    this.band.Q.value = 1.2
    noise.connect(this.band)
    this.band.connect(this.level)
  }
  trigger(time: number, sound: WeaponSound): void {
    const [hz, peak, decay] = handlingProfiles[sound]
    this.band.frequency.setValueAtTime(hz, time)
    const gain = this.level.gain
    gain.cancelScheduledValues(time)
    gain.setValueAtTime(0.0001, time)
    gain.linearRampToValueAtTime(peak, time + 0.001)
    gain.exponentialRampToValueAtTime(0.0001, time + 0.001 + decay)
    gain.setValueAtTime(0, time + 0.004 + decay)
  }
  silence(time: number): void {
    this.level.gain.cancelScheduledValues(time)
    this.level.gain.setTargetAtTime(0, time, 0.01)
  }
}
