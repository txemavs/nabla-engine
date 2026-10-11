import { Quaternion, Vector3 } from 'three'

export interface SpatialSoundOptions {
  /** Full-volume radius and fade-to-silence radius, in metres. */
  referenceDistance?: number
  maxDistance?: number
  rolloff?: number
}

/** Reusable world sound: HRTF direction, inverse distance and a finite audible range.
 * Coordinates stay relative to the camera, including on a planet or after an origin shift.
 * Connect any procedural voice or sample to input; music/UI bypass this emitter.
 */
export class SpatialEmitter {
  readonly input: GainNode
  private readonly panner?: PannerNode
  private readonly position = new Vector3()
  private readonly eye = new Vector3()
  private readonly inverseView = new Quaternion()
  private readonly relative = new Vector3()
  private mask = 1
  constructor(
    private readonly context: AudioContext,
    destination: AudioNode,
    private readonly options: SpatialSoundOptions = {},
  ) {
    this.input = context.createGain()
    if (typeof context.createPanner === 'function') {
      this.panner = context.createPanner()
      this.panner.panningModel = 'HRTF'
      this.panner.distanceModel = 'inverse'
      this.panner.refDistance = options.referenceDistance ?? 2
      this.panner.maxDistance = options.maxDistance ?? 120
      this.panner.rolloffFactor = options.rolloff ?? 1
      this.input.connect(this.panner)
      this.panner.connect(destination)
    } else this.input.connect(destination)
  }
  setPosition(position: readonly number[]): void {
    this.position.fromArray(position)
    this.update()
  }
  setListener(position: readonly number[], quaternion: readonly number[]): void {
    this.eye.fromArray(position)
    this.inverseView.fromArray(quaternion).invert()
    this.update()
  }
  /** Wind/engine masking for very quiet sounds, independent of distance. */
  setMask(level: number): void {
    this.mask = Math.max(0, Math.min(1, level))
    this.update()
  }
  private update(): void {
    this.relative.copy(this.position).sub(this.eye).applyQuaternion(this.inverseView)
    const distance = this.relative.length()
    const maximum = this.options.maxDistance ?? 120
    const fade = Math.max(0, Math.min(1, (maximum - distance) / (maximum * 0.25)))
    if (!this.panner) {
      this.input.gain.value = fade * this.mask
      return
    }
    this.input.gain.setTargetAtTime(fade * this.mask, this.context.currentTime, 0.015)
    if (this.panner) {
      const { x, y, z } = this.relative
      if (this.panner.positionX) {
        this.panner.positionX.setValueAtTime(x, this.context.currentTime)
        this.panner.positionY.setValueAtTime(y, this.context.currentTime)
        this.panner.positionZ.setValueAtTime(z, this.context.currentTime)
      } else this.panner.setPosition(x, y, z)
    }
  }
  dispose(): void {
    this.input.disconnect()
    this.panner?.disconnect()
  }
}
