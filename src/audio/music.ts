/**
 * Looping background track, streamed through an `<audio>` element (nothing is downloaded until
 * it starts) and routed into the music bus. It starts after the first user gesture, when the
 * audio context is unlocked. Hosts pass several encodings; the first the browser can play wins
 * (for example Opus in Ogg, then AAC for Safari).
 */

export interface MusicSource {
  url: string
  /** MIME type for `canPlayType`, e.g. `audio/ogg; codecs=opus` or `audio/mp4`. */
  type: string
}

export interface MusicTrack {
  sources: readonly MusicSource[]
  /** Default true. */
  loop?: boolean
  /** Shown in messages, e.g. `Nimbus · Eveningland`. */
  title?: string
  /** Vehicle menu entry (car monitor «MUSICA» page): ASCII, up to 11 characters. */
  menuLabel?: string
}

type MediaLike = Pick<HTMLAudioElement, 'canPlayType' | 'play' | 'pause' | 'paused'> & {
  currentTime?: number
  src: string
  loop: boolean
  preload: string
  crossOrigin: string | null
}

/** First source the element can play, or undefined. */
export function pickMusicSource(
  sources: readonly MusicSource[],
  canPlay: (type: string) => string,
): MusicSource | undefined {
  return sources.find((source) => canPlay(source.type) !== '')
}

export class BackgroundMusic {
  private element?: MediaLike
  private wanted = false
  private hidden = false
  /** Stopped by the host or the player (fade-out, «PARAR»): mix changes and gestures keep it off. */
  private off = false
  private fadeTimer?: ReturnType<typeof setTimeout>
  private context?: AudioContext
  private fader?: GainNode
  constructor(
    readonly track: MusicTrack,
    private readonly createElement: () => MediaLike = () => new Audio(),
  ) {}

  /** True once the element exists and is playing. */
  get playing(): boolean {
    return !!this.element && !this.element.paused
  }

  /**
   * Create the element on first call (after a gesture), route it into `bus` and play.
   * Later calls only resume. Never throws.
   */
  start(context: AudioContext, bus: AudioNode): void {
    this.wanted = true
    try {
      if (!this.element) {
        const element = this.createElement()
        const source = pickMusicSource(this.track.sources, (t) => element.canPlayType(t))
        if (!source) return
        element.crossOrigin = 'anonymous'
        element.preload = 'auto'
        element.loop = this.track.loop !== false
        element.src = source.url
        const fader = context.createGain()
        context.createMediaElementSource(element as HTMLAudioElement).connect(fader)
        fader.connect(bus)
        this.context = context
        this.fader = fader
        this.element = element
      }
      this.sync()
    } catch {
      /* Music is optional. */
    }
  }

  /** True while a fade-out runs or after it: the track stays off until `restart`. */
  get halted(): boolean {
    return this.off
  }

  /**
   * Fade the track out over `seconds`, then pause it and rewind. It stays off (mix changes and
   * gestures do not bring it back) until `restart`. A track not started yet never starts.
   */
  fadeOut(seconds: number): void {
    if (this.off) return
    this.off = true
    const element = this.element,
      fader = this.fader
    if (!element || element.paused || !fader || !this.context || !(seconds > 0)) {
      this.finishFade()
      return
    }
    // Exponential approach: about 2 % left at `seconds`, then the element pauses.
    fader.gain.setTargetAtTime(0, this.context.currentTime, seconds / 4)
    this.fadeTimer = setTimeout(() => this.finishFade(), seconds * 1000)
  }

  /** Play the track again from the start at full level (the bus level still applies). */
  restart(): void {
    this.off = false
    if (this.fadeTimer !== undefined) clearTimeout(this.fadeTimer)
    this.fadeTimer = undefined
    if (this.fader && this.context)
      this.fader.gain.setTargetAtTime(1, this.context.currentTime, 0.01)
    if (this.element) this.element.currentTime = 0
    this.sync()
  }

  private finishFade(): void {
    this.fadeTimer = undefined
    if (!this.off) return
    if (this.element && !this.element.paused) this.element.pause()
    if (this.element) this.element.currentTime = 0
    if (this.fader && this.context)
      this.fader.gain.setTargetAtTime(1, this.context.currentTime, 0.01)
  }

  /** Stop playback (mute); `start` resumes it. */
  stop(): void {
    this.wanted = false
    this.sync()
  }

  /** Pause while the page is hidden without forgetting that it should play. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden
    this.sync()
  }

  dispose(): void {
    if (this.fadeTimer !== undefined) clearTimeout(this.fadeTimer)
    this.fadeTimer = undefined
    this.wanted = false
    this.sync()
    if (this.element) this.element.src = ''
    this.element = undefined
  }

  private sync(): void {
    const element = this.element
    if (!element) return
    // While fading out, keep playing until the fade ends (unless muted or hidden).
    if (this.off && this.fadeTimer !== undefined && this.wanted && !this.hidden) return
    if (this.wanted && !this.hidden && !this.off) {
      if (element.paused) void element.play().catch(() => {})
    } else if (!element.paused) element.pause()
  }
}
