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
}

type MediaLike = Pick<HTMLAudioElement, 'canPlayType' | 'play' | 'pause' | 'paused'> & {
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
        context.createMediaElementSource(element as HTMLAudioElement).connect(bus)
        this.element = element
      }
      this.sync()
    } catch {
      /* Music is optional. */
    }
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
    this.wanted = false
    this.sync()
    if (this.element) this.element.src = ''
    this.element = undefined
  }

  private sync(): void {
    const element = this.element
    if (!element) return
    if (this.wanted && !this.hidden) {
      if (element.paused) void element.play().catch(() => {})
    } else if (!element.paused) element.pause()
  }
}
