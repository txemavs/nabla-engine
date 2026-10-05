/** One reusable oscillator; no timers or sample downloads. The shared context owns its lifetime. */
import { reverseAlarmDefaults as tuning } from '../config/audio.js'
import { silentOutput } from './graph.js'

export class ReverseAlarm {
  private readonly output: GainNode
  private next = 0
  private active = false
  constructor(context: AudioContext) {
    this.output = silentOutput(context)
    const tone = context.createOscillator()
    tone.type = 'sine'
    tone.frequency.value = tuning.frequencyHz
    tone.connect(this.output)
    tone.start()
  }
  /** Beep immediately on R engagement and periodically thereafter; mute cancels the envelope. */
  update(time: number, active: boolean): void {
    if (!active) {
      this.silence(time)
      return
    }
    if (this.active && time < this.next) return
    this.active = true
    this.next = time + tuning.intervalSeconds
    const gain = this.output.gain
    gain.cancelScheduledValues(time)
    gain.setValueAtTime(0, time)
    gain.linearRampToValueAtTime(tuning.gain, time + tuning.rampSeconds)
    gain.setValueAtTime(tuning.gain, time + tuning.durationSeconds - tuning.rampSeconds)
    gain.linearRampToValueAtTime(0, time + tuning.durationSeconds)
  }
  /** Stop the current beep when leaving R, muting, suspending, or leaving the vehicle. */
  silence(time: number): void {
    if (!this.active) return
    this.active = false
    this.next = 0
    this.output.gain.cancelScheduledValues(time)
    this.output.gain.setTargetAtTime(0, time, tuning.rampSeconds)
  }
}
