/** A quiet synthesized turbine. One shared audio graph, gated by browser user activation. */
export class FlightAudio {
  private context?: AudioContext
  private gain?: GainNode
  private filter?: BiquadFilterNode
  private oscillator?: OscillatorNode
  private propGain?: GainNode
  private propOsc?: OscillatorNode
  private propFilter?: BiquadFilterNode
  private tireGain?: GainNode
  private tireFilter?: BiquadFilterNode
  private carGain?: GainNode
  private carOsc?: OscillatorNode
  private carFilter?: BiquadFilterNode
  private turboGain?: GainNode
  private turboOsc?: OscillatorNode
  private turboAir?: GainNode
  private turboBoost = 0
  private turboRelease = 0
  private previousCarLoad = 0
  private carTime = 0
  private enabled = true
  private suspended = false
  constructor(enabled = true) {
    this.enabled = enabled
  }
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) this.silence()
    else this.unlock()
  }
  setSuspended(suspended: boolean): void {
    this.suspended = suspended
    if (suspended) this.silence()
  }
  private silence(): void {
    if (!this.context) return
    this.tireGain?.gain.setTargetAtTime(0, this.context.currentTime, 0.05)
    this.gain?.gain.setTargetAtTime(0, this.context.currentTime, 0.05)
    this.propGain?.gain.setTargetAtTime(0, this.context.currentTime, 0.05)
    this.carGain?.gain.setTargetAtTime(0, this.context.currentTime, 0.05)
    this.turboGain?.gain.setTargetAtTime(0, this.context.currentTime, 0.03)
    this.turboAir?.gain.setTargetAtTime(0, this.context.currentTime, 0.03)
    this.turboBoost = this.turboRelease = this.previousCarLoad = 0
  }
  dispose(): void {
    if (this.context) void this.context.close().catch(() => {})
    this.context = undefined
    this.enabled = false
  }
  unlock(): void {
    if (!this.enabled) return
    try {
      if (!this.context) {
        const ctx = (this.context = new AudioContext())
        const gain = (this.gain = ctx.createGain())
        gain.gain.value = 0
        gain.connect(ctx.destination)
        const filter = (this.filter = ctx.createBiquadFilter())
        filter.type = 'lowpass'
        filter.frequency.value = 450
        filter.Q.value = 0.5
        filter.connect(gain)
        const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
        const samples = noise.getChannelData(0)
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
        const source = ctx.createBufferSource()
        source.buffer = noise
        source.loop = true
        source.connect(filter)
        source.start()
        this.tireGain = ctx.createGain()
        this.tireGain.gain.value = 0
        this.tireGain.connect(ctx.destination)
        this.tireFilter = ctx.createBiquadFilter()
        this.tireFilter.type = 'bandpass'
        this.tireFilter.Q.value = 7
        source.connect(this.tireFilter).connect(this.tireGain)
        const oscillator = (this.oscillator = ctx.createOscillator())
        oscillator.type = 'sine'
        oscillator.frequency.value = 65
        const hum = ctx.createGain()
        hum.gain.value = 0.14
        oscillator.connect(hum).connect(gain)
        oscillator.start()
        const propGain = (this.propGain = ctx.createGain())
        propGain.gain.value = 0
        propGain.connect(ctx.destination)
        const propFilter = (this.propFilter = ctx.createBiquadFilter())
        propFilter.type = 'lowpass'
        propFilter.frequency.value = 240
        propFilter.Q.value = 0.6
        propFilter.connect(propGain)
        const propOsc = (this.propOsc = ctx.createOscillator())
        propOsc.type = 'triangle'
        propOsc.frequency.value = 78
        const tone = ctx.createGain()
        tone.gain.value = 0.55
        propOsc.connect(tone).connect(propFilter)
        propOsc.start()
        const exhaust = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
        const exhaustSamples = exhaust.getChannelData(0)
        for (let i = 0; i < exhaustSamples.length; i++) exhaustSamples[i] = Math.random() * 2 - 1
        const exhaustSource = ctx.createBufferSource()
        exhaustSource.buffer = exhaust
        exhaustSource.loop = true
        const exhaustGain = ctx.createGain()
        exhaustGain.gain.value = 0.22
        exhaustSource.connect(exhaustGain).connect(propFilter)
        exhaustSource.start()
        this.carGain = ctx.createGain()
        this.carGain.gain.value = 0
        this.carGain.connect(ctx.destination)
        this.carFilter = ctx.createBiquadFilter()
        this.carFilter.type = 'lowpass'
        this.carFilter.Q.value = 0.7
        this.carFilter.connect(this.carGain)
        this.carOsc = ctx.createOscillator()
        this.carOsc.type = 'sawtooth'
        this.carOsc.connect(this.carFilter)
        this.carOsc.start()
        // A shared, quiet whistle and filtered air; no new nodes per gear change.
        this.turboGain = ctx.createGain()
        this.turboGain.gain.value = 0
        this.turboGain.connect(ctx.destination)
        this.turboOsc = ctx.createOscillator()
        this.turboOsc.type = 'sine'
        this.turboOsc.frequency.value = 1100
        this.turboOsc.connect(this.turboGain)
        this.turboOsc.start()
        this.turboAir = ctx.createGain()
        this.turboAir.gain.value = 0
        this.turboAir.connect(ctx.destination)
        const airFilter = ctx.createBiquadFilter()
        airFilter.type = 'bandpass'
        airFilter.frequency.value = 2400
        airFilter.Q.value = 0.8
        source.connect(airFilter).connect(this.turboAir)
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {})
    } catch {
      /* Audio is optional; never interrupt flight. */
    }
  }
  update(level: number, speed: number): void {
    if (!this.context || !this.gain) return
    const time = this.context.currentTime
    this.gain.gain.setTargetAtTime(
      this.enabled && !this.suspended ? Math.min(1, level) * 0.18 : 0,
      time,
      0.15,
    )
    this.filter?.frequency.setTargetAtTime(400 + Math.min(1000, speed) * 0.8, time, 0.2)
    this.oscillator?.frequency.setTargetAtTime(65 + Math.min(1000, speed) * 0.06, time, 0.2)
  }
  /** Four-cylinder firing frequency, with shift cuts supplied by the drivetrain load. */
  car(rpm: number, load: number): void {
    if (!this.context || !this.carGain) return
    const time = this.context.currentTime
    rpm = Number.isFinite(rpm) ? Math.max(0, Math.min(10000, rpm)) : 0
    load = Number.isFinite(load) ? Math.max(0, Math.min(1, load)) : 0
    const audible = this.enabled && !this.suspended && rpm > 0
    const dt = Math.min(0.1, Math.max(0, time - this.carTime))
    this.carTime = time
    const targetBoost = audible ? load * Math.max(0, Math.min(1, (rpm - 1600) / 3600)) : 0
    // A load cut vents the stored boost once, including the DSG's short shift cut.
    if (audible && this.previousCarLoad > 0.5 && load < 0.25)
      this.turboRelease = Math.max(this.turboRelease, this.turboBoost)
    if (!audible) this.turboRelease = this.turboBoost = 0
    this.turboBoost +=
      (targetBoost - this.turboBoost) *
      (1 - Math.exp(-dt / (targetBoost > this.turboBoost ? 0.3 : 0.12)))
    this.turboRelease *= Math.exp(-dt / 0.14)
    this.previousCarLoad = audible ? load : 0
    // A hint while the turbo spools; fade the whistle out as the engine revs rise.
    const whistleFade = Math.max(0, Math.min(1, (3800 - rpm) / 1400))
    this.turboGain?.gain.setTargetAtTime(this.turboBoost * whistleFade * 0.006, time, 0.06)
    this.turboOsc?.frequency.setTargetAtTime(1100 + this.turboBoost * 1900, time, 0.08)
    this.turboAir?.gain.setTargetAtTime(
      this.turboBoost * whistleFade * 0.003 + this.turboRelease * 0.04,
      time,
      0.025,
    )
    this.carGain.gain.setTargetAtTime(audible ? 0.025 + load * 0.055 : 0, time, 0.035)
    this.carOsc?.frequency.setTargetAtTime(Math.max(30, rpm / 30), time, 0.035)
    this.carFilter?.frequency.setTargetAtTime(180 + rpm * 0.1 + load * 700, time, 0.04)
  }
  get tireSoundLevel(): number {
    return this.tireGain?.gain.value ?? 0
  }
  /** Quiet friction squeal, reusing the shared noise source; no nodes per skid. */
  tires(slip: number, speedKmh: number): void {
    if (!this.context || !this.tireGain) return
    const amount =
      this.enabled && !this.suspended && Number.isFinite(slip)
        ? Math.max(0, Math.min(1, (slip - 0.2) / 0.8))
        : 0
    const time = this.context.currentTime
    this.tireGain.gain.setTargetAtTime(amount * 0.085, time, 0.08)
    this.tireFilter?.frequency.setTargetAtTime(
      950 + Math.min(160, Math.max(0, speedKmh || 0)) * 3 + amount * 280,
      time,
      0.12,
    )
  }
  /** Quiet piston idle. `level` is 0..1 from the occupied Cessna. */
  engine(level: number): void {
    if (!this.context || !this.propGain) return
    const time = this.context.currentTime
    const amount = this.enabled && !this.suspended ? Math.max(0, Math.min(1, level)) : 0
    this.propGain.gain.setTargetAtTime(amount * 0.045, time, 0.12)
    this.propOsc?.frequency.setTargetAtTime(70 + amount * 85, time, 0.1)
    this.propFilter?.frequency.setTargetAtTime(200 + amount * 480, time, 0.15)
  }
}
