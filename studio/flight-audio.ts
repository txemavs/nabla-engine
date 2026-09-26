/** A quiet synthesized turbine. One shared audio graph, gated by browser user activation. */
export class FlightAudio {
  private context?: AudioContext
  private gain?: GainNode
  private filter?: BiquadFilterNode
  private oscillator?: OscillatorNode
  private propGain?: GainNode
  private propOsc?: OscillatorNode
  private propFilter?: BiquadFilterNode
  private enabled = true
  constructor() {
    try {
      this.enabled = localStorage.getItem('nabla.flight-sound') !== 'off'
    } catch {
      /* optional */
    }
    const button = document.createElement('button')
    const label = () => {
      button.textContent = this.enabled ? 'Sonido: sí' : 'Sonido: no'
      button.setAttribute('aria-pressed', String(this.enabled))
    }
    label()
    button.title = 'Activar o silenciar los propulsores'
    document.querySelector('footer')?.append(button)
    button.addEventListener('click', () => {
      this.enabled = !this.enabled
      try {
        localStorage.setItem('nabla.flight-sound', this.enabled ? 'on' : 'off')
      } catch {
        /* optional */
      }
      label()
      if (!this.enabled && this.context) {
        this.gain?.gain.setTargetAtTime(0, this.context.currentTime, 0.08)
        this.propGain?.gain.setTargetAtTime(0, this.context.currentTime, 0.08)
      } else this.unlock()
    })
    window.addEventListener('pointerdown', () => this.unlock())
    window.addEventListener('keydown', () => this.unlock())
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.context) {
        this.gain?.gain.setTargetAtTime(0, this.context.currentTime, 0.05)
        this.propGain?.gain.setTargetAtTime(0, this.context.currentTime, 0.05)
      }
    })
  }
  private unlock(): void {
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
      this.enabled && !document.hidden ? Math.min(1, level) * 0.18 : 0,
      time,
      0.15,
    )
    this.filter?.frequency.setTargetAtTime(400 + Math.min(1000, speed) * 0.8, time, 0.2)
    this.oscillator?.frequency.setTargetAtTime(65 + Math.min(1000, speed) * 0.06, time, 0.2)
  }
  /** Quiet piston idle. `level` is 0..1 from the occupied Cessna. */
  engine(level: number): void {
    if (!this.context || !this.propGain) return
    const time = this.context.currentTime
    const amount = this.enabled && !document.hidden ? Math.max(0, Math.min(1, level)) : 0
    this.propGain.gain.setTargetAtTime(amount * 0.045, time, 0.12)
    this.propOsc?.frequency.setTargetAtTime(70 + amount * 85, time, 0.1)
    this.propFilter?.frequency.setTargetAtTime(200 + amount * 480, time, 0.15)
  }
}
