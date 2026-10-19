/**
 * Voice allocation for impact sounds: a fixed pool (`impactVoiceLimit` voices, the oldest is
 * reused, so a flurry of hits never builds up more voices) and a per-surface cooldown
 * (`ImpactSound.minInterval`: a hit sooner than that after the last one of the same surface is
 * dropped). Pure bookkeeping; the audio graph lives in `vehicle.ts`.
 */
export const impactVoiceLimit = 8

export class ImpactVoicePool<Key = string> {
  private next = 0
  private readonly lastAt = new Map<Key, number>()
  constructor(readonly size: number = impactVoiceLimit) {}
  /** Voice index for a hit of `key` at `now` (seconds), or null while its cooldown runs. */
  take(key: Key, now: number, minInterval: number): number | null {
    if (this.size <= 0) return null
    if (now - (this.lastAt.get(key) ?? -Infinity) < minInterval) return null
    this.lastAt.set(key, now)
    return this.next++ % this.size
  }
}
