import type { WeaponPreset } from '../catalog/weapons/library.js'
import type { WeaponSound } from './weapon-handling.js'

type SampleAudio = {
  weaponSample(
    url: string,
    position?: readonly number[],
    options?: { loop?: boolean; shot?: boolean },
  ): { stop: () => void } | null
  weaponSound(sound: WeaponSound, position?: readonly number[]): void
  gunshot(position?: readonly number[], last?: boolean): void
}

/**
 * Preset recordings (`preset.audio`) through the generic weapon audio: shot or synthesised
 * gunshot, a held automatic loop with its tail, and handling cues by name. One per weapon holder.
 */
export class FirearmSamples {
  private loop: { stop: () => void } | null = null
  private loopUrl: string | null = null

  constructor(private readonly audio: SampleAudio) {}

  /** One fired round. `automatic` keeps the loop running instead of a shot per round. */
  shot(
    preset: WeaponPreset | undefined,
    position: readonly number[],
    automatic: boolean,
    last: boolean,
  ): void {
    const sounds = preset?.audio
    // A recording that is still loading falls back to the synthesised shot.
    if (automatic && sounds?.autoLoop) {
      if (this.loop) return
      this.loop = this.audio.weaponSample(sounds.autoLoop, position, { loop: true, shot: true })
      this.loopUrl = sounds.autoTail ?? null
      if (this.loop) return
    } else if (sounds?.shot && this.audio.weaponSample(sounds.shot, position, { shot: true }))
      return
    this.audio.weaponSound('hammer', position)
    this.audio.gunshot(position, last)
  }

  /** Trigger released or weapon emptied: end the automatic loop with its tail. */
  release(position: readonly number[]): void {
    if (!this.loop) return
    this.loop.stop()
    this.loop = null
    if (this.loopUrl) this.audio.weaponSample(this.loopUrl, position)
    this.loopUrl = null
  }

  get looping(): boolean {
    return !!this.loop
  }

  cue(preset: WeaponPreset | undefined, sound: WeaponSound, position?: readonly number[]): void {
    const cues = preset?.audio?.cues as Partial<Record<WeaponSound, string>> | undefined
    const url = cues?.[sound]
    if (url && this.audio.weaponSample(url, position)) return
    this.audio.weaponSound(sound, position)
  }
}
